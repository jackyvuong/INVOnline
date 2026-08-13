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

    public async Task<PagedResult<object>> GetPagedAsync(PagedQuery q, string? status, string? dateFrom, string? dateTo)
    {
        await using var conn = db.Create();
        var search = PaginationHelper.LikePattern(q.Search);
        const string fromSql = "FROM import_slips s";
        const string whereSql = @"WHERE (@Search IS NULL OR s.code ILIKE @Search OR s.supplier ILIKE @Search OR s.note ILIKE @Search)
            AND (@Status IS NULL OR @Status = '' OR s.status = @Status)
            AND (@DateFrom IS NULL OR @DateFrom = '' OR s.slip_date::date >= @DateFrom::date)
            AND (@DateTo IS NULL OR @DateTo = '' OR s.slip_date::date <= @DateTo::date)";

        var total = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) {fromSql} {whereSql}",
            new { Search = search, Status = status, DateFrom = dateFrom, DateTo = dateTo });

        var sortMap = new Dictionary<string, string>
        {
            ["code"] = "s.code", ["slipDate"] = "s.slip_date", ["party"] = "s.supplier",
            ["itemCount"] = "item_count", ["totalQty"] = "total_qty", ["status"] = "s.status",
        };
        var order = PaginationHelper.OrderClause(PaginationHelper.ResolveSort(q.Sort, sortMap, "slipDate"), q.Desc);

        var items = await conn.QueryAsync(
            $@"SELECT s.id AS id, s.code AS code, s.slip_date AS {PaginationHelper.Alias("slipDate")}, s.supplier AS supplier,
               s.note AS note, s.status AS status, s.items AS items,
               s.supplier AS party,
               jsonb_array_length(COALESCE(s.items, '[]'::jsonb)) AS {PaginationHelper.Alias("itemCount")},
               COALESCE((SELECT SUM((elem->>'quantity')::numeric)
                 FROM jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) elem), 0) AS {PaginationHelper.Alias("totalQty")},
               jsonb_array_length(COALESCE(s.items, '[]'::jsonb)) AS item_count,
               COALESCE((SELECT SUM((elem->>'quantity')::numeric)
                 FROM jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) elem), 0) AS total_qty
               {fromSql} {whereSql}
               ORDER BY {order}
               LIMIT @Limit OFFSET @Offset",
            new { Search = search, Status = status, DateFrom = dateFrom, DateTo = dateTo, Limit = q.NormalizedPageSize, Offset = q.Offset });

        return PaginationHelper.Of(items, total, q);
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

public class ReportService(DbConnectionFactory db)
{
    public async Task<ServiceResult<List<object>>> BuildStockReportAsync(string fromDate, string toDate)
    {
        if (string.IsNullOrWhiteSpace(fromDate) || string.IsNullOrWhiteSpace(toDate))
            return ServiceResult<List<object>>.Fail("Vui lòng chọn Từ ngày và Đến ngày.");
        if (!DateOnly.TryParse(fromDate, out var from) || !DateOnly.TryParse(toDate, out var to))
            return ServiceResult<List<object>>.Fail("Định dạng ngày không hợp lệ.");
        if (from > to)
            return ServiceResult<List<object>>.Fail("Từ ngày không được lớn hơn Đến ngày.");

        await using var conn = db.Create();
        const string delta = "CASE t.type WHEN 'IN' THEN t.quantity WHEN 'OUT' THEN -t.quantity WHEN 'ADJUST' THEN t.quantity ELSE 0 END";
        const string dayExpr = "(t.movement_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date";

        var rows = (await conn.QueryAsync(
            $@"SELECT p.legacy_id AS {PaginationHelper.Alias("productId")},
                      p.code AS code, p.name AS name, p.brand AS brand,
                      p.category_name AS category, p.unit AS unit,
                      COALESCE(SUM(CASE WHEN {dayExpr} < CAST(@From AS date) THEN {delta} ELSE 0 END), 0) AS opening,
                      COALESCE(SUM(CASE WHEN {dayExpr} >= CAST(@From AS date) AND {dayExpr} <= CAST(@To AS date) AND t.type = 'IN' THEN t.quantity ELSE 0 END), 0) AS {PaginationHelper.Alias("inQty")},
                      COALESCE(SUM(CASE WHEN {dayExpr} >= CAST(@From AS date) AND {dayExpr} <= CAST(@To AS date) AND t.type = 'OUT' THEN t.quantity ELSE 0 END), 0) AS {PaginationHelper.Alias("outQty")},
                      COALESCE(SUM(CASE WHEN {dayExpr} >= CAST(@From AS date) AND {dayExpr} <= CAST(@To AS date) AND t.type = 'ADJUST' THEN t.quantity ELSE 0 END), 0) AS {PaginationHelper.Alias("adjustQty")},
                      COALESCE(SUM(CASE WHEN {dayExpr} < CAST(@From AS date) THEN {delta} ELSE 0 END), 0)
                        + COALESCE(SUM(CASE WHEN {dayExpr} >= CAST(@From AS date) AND {dayExpr} <= CAST(@To AS date) AND t.type = 'IN' THEN t.quantity ELSE 0 END), 0)
                        - COALESCE(SUM(CASE WHEN {dayExpr} >= CAST(@From AS date) AND {dayExpr} <= CAST(@To AS date) AND t.type = 'OUT' THEN t.quantity ELSE 0 END), 0)
                        + COALESCE(SUM(CASE WHEN {dayExpr} >= CAST(@From AS date) AND {dayExpr} <= CAST(@To AS date) AND t.type = 'ADJUST' THEN t.quantity ELSE 0 END), 0)
                        AS closing
               FROM products p
               LEFT JOIN transactions t ON t.product_id = p.id
               GROUP BY p.legacy_id, p.code, p.name, p.brand, p.category_name, p.unit
               ORDER BY p.code",
            new { From = from.ToString("yyyy-MM-dd"), To = to.ToString("yyyy-MM-dd") })).ToList();

        return ServiceResult<List<object>>.Success(rows.Cast<object>().ToList());
    }
}
