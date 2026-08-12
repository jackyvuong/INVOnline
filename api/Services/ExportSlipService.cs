namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;
using Npgsql;

public class ExportSlipService(DbConnectionFactory db, TransactionService transactions)
{
    public async Task<IEnumerable<ExportSlip>> GetAllAsync()
    {
        await using var conn = db.Create();
        var rows = await conn.QueryAsync<dynamic>(
            @"SELECT id, legacy_id, code, slip_date, recipient, note, status, items, out_transaction_ids, return_transaction_ids,
              created_at, updated_at, created_by_email, updated_by_email FROM export_slips ORDER BY legacy_id DESC");
        return rows.Select(MapSlip);
    }

    public async Task<ExportSlip?> GetByIdAsync(long id)
    {
        await using var conn = db.Create();
        var row = await conn.QuerySingleOrDefaultAsync<dynamic>(
            @"SELECT id, legacy_id, code, slip_date, recipient, note, status, items, out_transaction_ids, return_transaction_ids,
              created_at, updated_at, created_by_email, updated_by_email FROM export_slips WHERE id = @Id", new { Id = id });
        return row is null ? null : MapSlip(row);
    }

    public async Task<ServiceResult<ExportSlip>> CreateAsync(ExportSlip input, string email)
    {
        var items = NormalizeItems(input.Items);
        var errors = ValidateSlip(input, items);
        if (errors.Count > 0) return ServiceResult<ExportSlip>.Fail(errors);

        await using var conn = db.Create();
        var legacyId = await conn.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM export_slips");
        var code = await GenerateCodeAsync(conn, "PXK");
        var now = DateTimeOffset.UtcNow;
        var slipDate = ServiceHelpers.ParseLegacyDateTime(ServiceHelpers.FormatLegacyDateTime(input.SlipDate));

        var id = await conn.QuerySingleAsync<long>(
            @"INSERT INTO export_slips (legacy_id, code, slip_date, recipient, note, status, items, out_transaction_ids, return_transaction_ids,
              created_at, updated_at, created_by_email, updated_by_email)
              VALUES (@LegacyId, @Code, @SlipDate, @Recipient, @Note, 'PROCESSING', @Items::jsonb, '[]'::jsonb, '[]'::jsonb,
              @Now, @Now, @Email, @Email) RETURNING id",
            new
            {
                LegacyId = legacyId, Code = code, SlipDate = slipDate,
                Recipient = input.Recipient?.Trim() ?? "", Note = input.Note?.Trim() ?? "",
                Items = JsonDb.ToJson(items), Now = now, Email = email,
            });

        return ServiceResult<ExportSlip>.Success(new ExportSlip
        {
            Id = id, LegacyId = legacyId, Code = code, SlipDate = slipDate,
            Recipient = input.Recipient?.Trim() ?? "", Note = input.Note?.Trim() ?? "",
            Status = "PROCESSING", Items = items, CreatedAt = now, UpdatedAt = now,
            CreatedByEmail = email, UpdatedByEmail = email,
        });
    }

    public async Task<ServiceResult<ExportSlip>> UpdateAsync(long id, ExportSlip input, string email)
    {
        var current = await GetByIdAsync(id);
        if (current is null) return ServiceResult<ExportSlip>.Fail("Không tìm thấy phiếu xuất.");
        if (current.Status != "PROCESSING") return ServiceResult<ExportSlip>.Fail("Chỉ được sửa phiếu đang ở trạng thái Đang xử lý.");

        var items = NormalizeItems(input.Items);
        var errors = ValidateSlip(input, items);
        if (errors.Count > 0) return ServiceResult<ExportSlip>.Fail(errors);

        var now = DateTimeOffset.UtcNow;
        var slipDate = ServiceHelpers.ParseLegacyDateTime(ServiceHelpers.FormatLegacyDateTime(input.SlipDate));
        await using var conn = db.Create();
        await conn.ExecuteAsync(
            @"UPDATE export_slips SET slip_date = @SlipDate, recipient = @Recipient, note = @Note, items = @Items::jsonb,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new { SlipDate = slipDate, Recipient = input.Recipient?.Trim() ?? "", Note = input.Note?.Trim() ?? "", Items = JsonDb.ToJson(items), Now = now, Email = email, Id = id });

        current.SlipDate = slipDate;
        current.Recipient = input.Recipient?.Trim() ?? "";
        current.Note = input.Note?.Trim() ?? "";
        current.Items = items;
        current.UpdatedAt = now;
        current.UpdatedByEmail = email;
        return ServiceResult<ExportSlip>.Success(current);
    }

    public async Task<ServiceResult<ExportSlip>> CompleteAsync(long id, string email)
    {
        var slip = await GetByIdAsync(id);
        if (slip is null) return ServiceResult<ExportSlip>.Fail("Không tìm thấy phiếu xuất.");
        if (slip.Status != "PROCESSING") return ServiceResult<ExportSlip>.Fail("Chỉ hoàn thành được phiếu đang xử lý.");

        var items = NormalizeItems(slip.Items);
        if (items.Count == 0) return ServiceResult<ExportSlip>.Fail("Phiếu xuất không có sản phẩm.");

        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        var outIds = new List<int>();
        var txDate = ServiceHelpers.FormatLegacyDateTime(slip.SlipDate);
        foreach (var item in items)
        {
            var result = await transactions.CreateInTransactionAsync(conn, tx, txDate, "OUT", item.ProductId, item.Quantity,
                $"Xuất theo phiếu {slip.Code} - {slip.Recipient} - {item.Note}", email);
            if (!result.Ok) { await tx.RollbackAsync(); return ServiceResult<ExportSlip>.Fail(result.Message!); }
            outIds.Add(result.Data);
        }

        var now = DateTimeOffset.UtcNow;
        await conn.ExecuteAsync(
            @"UPDATE export_slips SET status = 'COMPLETED', out_transaction_ids = @OutIds::jsonb,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new { OutIds = JsonDb.ToJson(outIds), Now = now, Email = email, Id = id }, tx);

        await tx.CommitAsync();
        slip.Status = "COMPLETED";
        slip.OutTransactionIds = outIds;
        slip.UpdatedAt = now;
        slip.UpdatedByEmail = email;
        return ServiceResult<ExportSlip>.Success(slip);
    }

    public async Task<ServiceResult<ExportSlip>> ReturnAsync(long id, string email)
    {
        var slip = await GetByIdAsync(id);
        if (slip is null) return ServiceResult<ExportSlip>.Fail("Không tìm thấy phiếu xuất.");
        if (slip.Status != "COMPLETED") return ServiceResult<ExportSlip>.Fail("Chỉ hoàn trả được phiếu đã hoàn thành.");

        var items = NormalizeItems(slip.Items);
        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        var returnIds = new List<int>();
        var txDate = ServiceHelpers.FormatLegacyDateTime(DateTimeOffset.UtcNow);
        foreach (var item in items)
        {
            var result = await transactions.CreateInTransactionAsync(conn, tx, txDate, "IN", item.ProductId, item.Quantity,
                $"Hoàn trả phiếu {slip.Code} - {slip.Recipient} - {item.Note}", email);
            if (!result.Ok) { await tx.RollbackAsync(); return ServiceResult<ExportSlip>.Fail(result.Message!); }
            returnIds.Add(result.Data);
        }

        var now = DateTimeOffset.UtcNow;
        await conn.ExecuteAsync(
            @"UPDATE export_slips SET status = 'RETURNED', return_transaction_ids = @ReturnIds::jsonb,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new { ReturnIds = JsonDb.ToJson(returnIds), Now = now, Email = email, Id = id }, tx);

        await tx.CommitAsync();
        slip.Status = "RETURNED";
        slip.ReturnTransactionIds = returnIds;
        slip.UpdatedAt = now;
        slip.UpdatedByEmail = email;
        return ServiceResult<ExportSlip>.Success(slip);
    }

    public async Task<ServiceResult<ExportSlip>> CopyAsync(long id, string email)
    {
        var source = await GetByIdAsync(id);
        if (source is null) return ServiceResult<ExportSlip>.Fail("Không tìm thấy phiếu xuất.");
        return await CreateAsync(new ExportSlip
        {
            SlipDate = DateTimeOffset.UtcNow,
            Recipient = source.Recipient,
            Note = source.Note,
            Items = source.Items,
        }, email);
    }

    public async Task<ServiceResult> RemoveAsync(long id, string email)
    {
        var slip = await GetByIdAsync(id);
        if (slip is null) return ServiceResult.Fail("Không tìm thấy phiếu xuất.");
        if (slip.Status != "PROCESSING") return ServiceResult.Fail("Chỉ xóa được phiếu đang xử lý.");

        await using var conn = db.Create();
        await conn.ExecuteAsync("UPDATE export_slips SET updated_by_email = @Email, updated_at = NOW() WHERE id = @Id", new { Email = email, Id = id });
        await conn.ExecuteAsync("DELETE FROM export_slips WHERE id = @Id", new { Id = id });
        return ServiceResult.Success();
    }

    private static ExportSlip MapSlip(dynamic row) => new()
    {
        Id = row.id, LegacyId = row.legacy_id, Code = row.code,
        SlipDate = row.slip_date, Recipient = row.recipient ?? "", Note = row.note ?? "",
        Status = row.status,
        Items = JsonDb.FromJson<List<SlipItem>>(row.items?.ToString() ?? "[]"),
        OutTransactionIds = JsonDb.FromJson<List<int>>(row.out_transaction_ids?.ToString() ?? "[]"),
        ReturnTransactionIds = JsonDb.FromJson<List<int>>(row.return_transaction_ids?.ToString() ?? "[]"),
        CreatedAt = row.created_at, UpdatedAt = row.updated_at,
        CreatedByEmail = row.created_by_email ?? "", UpdatedByEmail = row.updated_by_email ?? "",
    };

    private static List<SlipItem> NormalizeItems(IEnumerable<SlipItem> items) =>
        items.Where(i => i.ProductId > 0 && i.Quantity > 0)
            .Select(i => new SlipItem { ProductId = i.ProductId, Quantity = i.Quantity, Note = i.Note?.Trim() ?? "" })
            .ToList();

    private static Dictionary<string, string> ValidateSlip(ExportSlip input, List<SlipItem> items)
    {
        var errors = new Dictionary<string, string>();
        if (items.Count == 0) errors["items"] = "Phiếu phải có ít nhất một sản phẩm.";
        var dup = items.GroupBy(i => i.ProductId).FirstOrDefault(g => g.Count() > 1);
        if (dup is not null) errors["items"] = "Không được trùng sản phẩm trên cùng phiếu.";
        return errors;
    }

    private static async Task<string> GenerateCodeAsync(NpgsqlConnection conn, string prefix)
    {
        var day = DateTime.Now.ToString("yyyyMMdd");
        var p = $"{prefix}-{day}-";
        var max = await conn.ExecuteScalarAsync<int>(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)), 0) FROM export_slips WHERE code LIKE @P || '%'",
            new { P = p });
        return $"{p}{max + 1:D3}";
    }
}
