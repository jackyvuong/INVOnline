namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;
using Npgsql;

public class ImportSlipService(DbConnectionFactory db, TransactionService transactions)
{
    public async Task<IEnumerable<ImportSlip>> GetAllAsync()
    {
        await using var conn = db.Create();
        var rows = await conn.QueryAsync<dynamic>(
            @"SELECT id, legacy_id, code, slip_date, supplier, note, status, items, in_transaction_ids, return_transaction_ids,
              created_at, updated_at, created_by_email, updated_by_email FROM import_slips ORDER BY legacy_id DESC");
        return rows.Select(MapSlip);
    }

    public async Task<ImportSlip?> GetByIdAsync(long id)
    {
        await using var conn = db.Create();
        var row = await conn.QuerySingleOrDefaultAsync<dynamic>(
            @"SELECT id, legacy_id, code, slip_date, supplier, note, status, items, in_transaction_ids, return_transaction_ids,
              created_at, updated_at, created_by_email, updated_by_email FROM import_slips WHERE id = @Id", new { Id = id });
        return row is null ? null : MapSlip(row);
    }

    public async Task<ServiceResult<ImportSlip>> CreateAsync(ImportSlip input, string email)
    {
        var items = NormalizeItems(input.Items);
        if (items.Count == 0) return ServiceResult<ImportSlip>.Fail(new Dictionary<string, string> { ["items"] = "Phiếu phải có ít nhất một sản phẩm." });

        await using var conn = db.Create();
        var legacyId = await conn.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM import_slips");
        var code = await GenerateCodeAsync(conn);
        var now = DateTimeOffset.UtcNow;
        var slipDate = ServiceHelpers.ParseLegacyDateTime(ServiceHelpers.FormatLegacyDateTime(input.SlipDate));

        var id = await conn.QuerySingleAsync<long>(
            @"INSERT INTO import_slips (legacy_id, code, slip_date, supplier, note, status, items, in_transaction_ids, return_transaction_ids,
              created_at, updated_at, created_by_email, updated_by_email)
              VALUES (@LegacyId, @Code, @SlipDate, @Supplier, @Note, 'PROCESSING', @Items::jsonb, '[]'::jsonb, '[]'::jsonb,
              @Now, @Now, @Email, @Email) RETURNING id",
            new { LegacyId = legacyId, Code = code, SlipDate = slipDate, Supplier = input.Supplier?.Trim() ?? "", Note = input.Note?.Trim() ?? "", Items = JsonDb.ToJson(items), Now = now, Email = email });

        return ServiceResult<ImportSlip>.Success(new ImportSlip
        {
            Id = id, LegacyId = legacyId, Code = code, SlipDate = slipDate,
            Supplier = input.Supplier?.Trim() ?? "", Note = input.Note?.Trim() ?? "",
            Status = "PROCESSING", Items = items, CreatedAt = now, UpdatedAt = now,
            CreatedByEmail = email, UpdatedByEmail = email,
        });
    }

    public async Task<ServiceResult<ImportSlip>> UpdateAsync(long id, ImportSlip input, string email)
    {
        var current = await GetByIdAsync(id);
        if (current is null) return ServiceResult<ImportSlip>.Fail("Không tìm thấy phiếu nhập.");
        if (current.Status != "PROCESSING") return ServiceResult<ImportSlip>.Fail("Chỉ được sửa phiếu đang ở trạng thái Đang xử lý.");

        var items = NormalizeItems(input.Items);
        if (items.Count == 0) return ServiceResult<ImportSlip>.Fail(new Dictionary<string, string> { ["items"] = "Phiếu phải có ít nhất một sản phẩm." });

        var now = DateTimeOffset.UtcNow;
        var slipDate = ServiceHelpers.ParseLegacyDateTime(ServiceHelpers.FormatLegacyDateTime(input.SlipDate));
        await using var conn = db.Create();
        await conn.ExecuteAsync(
            @"UPDATE import_slips SET slip_date = @SlipDate, supplier = @Supplier, note = @Note, items = @Items::jsonb,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new { SlipDate = slipDate, Supplier = input.Supplier?.Trim() ?? "", Note = input.Note?.Trim() ?? "", Items = JsonDb.ToJson(items), Now = now, Email = email, Id = id });

        current.SlipDate = slipDate;
        current.Supplier = input.Supplier?.Trim() ?? "";
        current.Note = input.Note?.Trim() ?? "";
        current.Items = items;
        current.UpdatedAt = now;
        current.UpdatedByEmail = email;
        return ServiceResult<ImportSlip>.Success(current);
    }

    public async Task<ServiceResult<ImportSlip>> CompleteAsync(long id, string email)
    {
        var slip = await GetByIdAsync(id);
        if (slip is null) return ServiceResult<ImportSlip>.Fail("Không tìm thấy phiếu nhập.");
        if (slip.Status != "PROCESSING") return ServiceResult<ImportSlip>.Fail("Chỉ hoàn thành được phiếu đang xử lý.");

        var items = NormalizeItems(slip.Items);
        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        var inIds = new List<int>();
        var txDate = ServiceHelpers.FormatLegacyDateTime(slip.SlipDate);
        foreach (var item in items)
        {
            var result = await transactions.CreateInTransactionAsync(conn, tx, txDate, "IN", item.ProductId, item.Quantity,
                $"Nhập theo phiếu {slip.Code} - {slip.Supplier} - {item.Note}", email);
            if (!result.Ok) { await tx.RollbackAsync(); return ServiceResult<ImportSlip>.Fail(result.Message!); }
            inIds.Add(result.Data);
        }

        var now = DateTimeOffset.UtcNow;
        await conn.ExecuteAsync(
            @"UPDATE import_slips SET status = 'COMPLETED', in_transaction_ids = @InIds::jsonb,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new { InIds = JsonDb.ToJson(inIds), Now = now, Email = email, Id = id }, tx);

        await tx.CommitAsync();
        slip.Status = "COMPLETED";
        slip.InTransactionIds = inIds;
        slip.UpdatedAt = now;
        slip.UpdatedByEmail = email;
        return ServiceResult<ImportSlip>.Success(slip);
    }

    public async Task<ServiceResult<ImportSlip>> ReturnAsync(long id, string email)
    {
        var slip = await GetByIdAsync(id);
        if (slip is null) return ServiceResult<ImportSlip>.Fail("Không tìm thấy phiếu nhập.");
        if (slip.Status != "COMPLETED") return ServiceResult<ImportSlip>.Fail("Chỉ hoàn trả được phiếu đã hoàn thành.");

        var items = NormalizeItems(slip.Items);
        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        var returnIds = new List<int>();
        var txDate = ServiceHelpers.FormatLegacyDateTime(DateTimeOffset.UtcNow);
        foreach (var item in items)
        {
            var result = await transactions.CreateInTransactionAsync(conn, tx, txDate, "OUT", item.ProductId, item.Quantity,
                $"Hoàn trả phiếu {slip.Code} - {slip.Supplier} - {item.Note}", email);
            if (!result.Ok) { await tx.RollbackAsync(); return ServiceResult<ImportSlip>.Fail(result.Message!); }
            returnIds.Add(result.Data);
        }

        var now = DateTimeOffset.UtcNow;
        await conn.ExecuteAsync(
            @"UPDATE import_slips SET status = 'RETURNED', return_transaction_ids = @ReturnIds::jsonb,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new { ReturnIds = JsonDb.ToJson(returnIds), Now = now, Email = email, Id = id }, tx);

        await tx.CommitAsync();
        slip.Status = "RETURNED";
        slip.ReturnTransactionIds = returnIds;
        slip.UpdatedAt = now;
        slip.UpdatedByEmail = email;
        return ServiceResult<ImportSlip>.Success(slip);
    }

    public async Task<ServiceResult<ImportSlip>> CopyAsync(long id, string email)
    {
        var source = await GetByIdAsync(id);
        if (source is null) return ServiceResult<ImportSlip>.Fail("Không tìm thấy phiếu nhập.");
        return await CreateAsync(new ImportSlip { SlipDate = DateTimeOffset.UtcNow, Supplier = source.Supplier, Note = source.Note, Items = source.Items }, email);
    }

    public async Task<ServiceResult> RemoveAsync(long id, string email)
    {
        var slip = await GetByIdAsync(id);
        if (slip is null) return ServiceResult.Fail("Không tìm thấy phiếu nhập.");
        if (slip.Status != "PROCESSING") return ServiceResult.Fail("Chỉ xóa được phiếu đang xử lý.");

        await using var conn = db.Create();
        await conn.ExecuteAsync("UPDATE import_slips SET updated_by_email = @Email, updated_at = NOW() WHERE id = @Id", new { Email = email, Id = id });
        await conn.ExecuteAsync("DELETE FROM import_slips WHERE id = @Id", new { Id = id });
        return ServiceResult.Success();
    }

    private static ImportSlip MapSlip(dynamic row) => new()
    {
        Id = row.id, LegacyId = row.legacy_id, Code = row.code,
        SlipDate = row.slip_date, Supplier = row.supplier ?? "", Note = row.note ?? "",
        Status = row.status,
        Items = JsonDb.FromJson<List<SlipItem>>(row.items?.ToString() ?? "[]"),
        InTransactionIds = JsonDb.FromJson<List<int>>(row.in_transaction_ids?.ToString() ?? "[]"),
        ReturnTransactionIds = JsonDb.FromJson<List<int>>(row.return_transaction_ids?.ToString() ?? "[]"),
        CreatedAt = row.created_at, UpdatedAt = row.updated_at,
        CreatedByEmail = row.created_by_email ?? "", UpdatedByEmail = row.updated_by_email ?? "",
    };

    private static List<SlipItem> NormalizeItems(IEnumerable<SlipItem> items) =>
        items.Where(i => i.ProductId > 0 && i.Quantity > 0)
            .Select(i => new SlipItem { ProductId = i.ProductId, Quantity = i.Quantity, Note = i.Note?.Trim() ?? "" }).ToList();

    private static async Task<string> GenerateCodeAsync(NpgsqlConnection conn)
    {
        var day = DateTime.Now.ToString("yyyyMMdd");
        var p = $"PNK-{day}-";
        var max = await conn.ExecuteScalarAsync<int>(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)), 0) FROM import_slips WHERE code LIKE @P || '%'", new { P = p });
        return $"{p}{max + 1:D3}";
    }
}

public class ReportService(DbConnectionFactory db, ProductService products, TransactionService transactions)
{
    public async Task<ServiceResult<List<object>>> BuildStockReportAsync(string fromDate, string toDate)
    {
        if (string.IsNullOrWhiteSpace(fromDate) || string.IsNullOrWhiteSpace(toDate))
            return ServiceResult<List<object>>.Fail("Vui lòng chọn Từ ngày và Đến ngày.");
        if (DateOnly.Parse(fromDate) > DateOnly.Parse(toDate))
            return ServiceResult<List<object>>.Fail("Từ ngày không được lớn hơn Đến ngày.");

        var productList = (await products.GetAllAsync()).ToList();
        var txList = (await transactions.GetAllEnrichedAsync()).Cast<dynamic>().ToList();
        var from = DateOnly.Parse(fromDate);
        var to = DateOnly.Parse(toDate);

        var rows = productList.Select(p =>
        {
            decimal opening = 0, inQty = 0, outQty = 0, adjustQty = 0;
            foreach (var tx in txList.Where(t => (long)t.ProductId == p.Id))
            {
                var day = DateOnly.FromDateTime(((DateTimeOffset)tx.MovementAt).DateTime);
                var qty = (decimal)tx.Quantity;
                var type = (string)tx.Type;
                if (day < from) opening += ServiceHelpers.StockDelta(type, qty);
                else if (day >= from && day <= to)
                {
                    if (type == "IN") inQty += qty;
                    else if (type == "OUT") outQty += qty;
                    else if (type == "ADJUST") adjustQty += qty;
                }
            }
            var closing = opening + inQty - outQty + adjustQty;
            return (object)new { productId = p.LegacyId, code = p.Code, name = p.Name, brand = p.Brand, category = p.CategoryName, unit = p.Unit, opening, inQty, outQty, adjustQty, closing };
        }).ToList();

        return ServiceResult<List<object>>.Success(rows);
    }
}
