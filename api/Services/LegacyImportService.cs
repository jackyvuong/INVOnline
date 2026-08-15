namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;
using System.Text.Json;

public class LegacyImportService(DbConnectionFactory db)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static LegacyBackup? TryParse(JsonElement payload, out string? error)
    {
        error = null;
        try
        {
            var backup = JsonSerializer.Deserialize<LegacyBackup>(payload.GetRawText(), JsonOptions);
            if (backup is null)
            {
                error = "File JSON không hợp lệ.";
                return null;
            }
            return backup;
        }
        catch (JsonException ex)
        {
            error = $"File JSON không hợp lệ: {ex.Message}";
            return null;
        }
    }

    public static LegacyBackup Normalize(LegacyBackup backup)
    {
        backup.Categories = EnsureCategories(backup.Categories, backup.Products);
        backup.ExportSlips ??= [];
        backup.ImportSlips ??= [];
        return backup;
    }

    public static ServiceResult<ImportSummary> Validate(LegacyBackup backup)
    {
        var errors = new List<string>();

        if (backup.Products is null || backup.Products.Count == 0)
            errors.Add("Thiếu mảng products hoặc rỗng.");
        if (backup.Transactions is null)
            errors.Add("Thiếu mảng transactions.");

        backup.Products ??= [];
        backup.Transactions ??= [];
        backup.Categories ??= [];
        backup.ExportSlips ??= [];
        backup.ImportSlips ??= [];

        if (errors.Count > 0)
            return ServiceResult<ImportSummary>.Fail(string.Join(" ", errors));

        foreach (var (label, ids) in new (string, IEnumerable<int>)[]
        {
            ("category", backup.Categories.Select(c => c.Id)),
            ("product", backup.Products.Select(p => p.Id)),
            ("transaction", backup.Transactions.Select(t => t.Id)),
        })
        {
            var dup = ids.GroupBy(x => x).Where(g => g.Key > 0 && g.Count() > 1).Select(g => g.Key).Take(3).ToList();
            if (dup.Count > 0)
                errors.Add($"Trùng legacy_id {label}: {string.Join(", ", dup)}.");
        }

        var productIds = backup.Products.Select(p => p.Id).ToHashSet();
        foreach (var t in backup.Transactions)
        {
            if (!productIds.Contains(t.ProductId))
                errors.Add($"Giao dịch #{t.Id}: productId {t.ProductId} không tồn tại.");
        }

        foreach (var p in backup.Products)
        {
            if (p.Stock < 0)
                errors.Add($"Sản phẩm #{p.Id} ({p.Code}): tồn âm.");
        }

        const int maxErrors = 8;
        if (errors.Count > maxErrors)
            return ServiceResult<ImportSummary>.Fail(string.Join(" ", errors.Take(maxErrors)) + $" (+{errors.Count - maxErrors} lỗi khác)");

        if (errors.Count > 0)
            return ServiceResult<ImportSummary>.Fail(string.Join(" ", errors));

        return ServiceResult<ImportSummary>.Success(new ImportSummary
        {
            Categories = backup.Categories.Count,
            Products = backup.Products.Count,
            Transactions = backup.Transactions.Count,
            ExportSlips = backup.ExportSlips.Count,
            ImportSlips = backup.ImportSlips.Count,
            SourceVersion = backup.Version,
            ExportedAt = backup.ExportedAt,
        });
    }

    public async Task<ServiceResult<ImportSummary>> ImportAsync(LegacyBackup backup, string email)
    {
        var normalized = Normalize(backup);
        var validation = Validate(normalized);
        if (!validation.Ok)
            return validation;

        await using var conn = db.Create();
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        try
        {
            await conn.ExecuteAsync("DELETE FROM transactions", transaction: tx);
            await conn.ExecuteAsync("DELETE FROM export_slips", transaction: tx);
            await conn.ExecuteAsync("DELETE FROM import_slips", transaction: tx);
            await conn.ExecuteAsync("DELETE FROM products", transaction: tx);
            await conn.ExecuteAsync("DELETE FROM categories", transaction: tx);

            var legacyIdToCode = new Dictionary<int, string>();
            var codeToId = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            foreach (var c in normalized.Categories)
            {
                var createdAt = ParseOptionalDate(c.CreatedAt);
                var updatedAt = ParseOptionalDate(c.UpdatedAt);
                await conn.ExecuteAsync(
                    @"INSERT INTO categories (legacy_id, code, name, description, created_at, updated_at, created_by_email, updated_by_email)
                      VALUES (@LegacyId, @Code, @Name, @Description, @CreatedAt, @UpdatedAt, @Email, @Email)",
                    new
                    {
                        LegacyId = c.Id,
                        Code = c.Code,
                        Name = c.Name,
                        Description = c.Description ?? "",
                        CreatedAt = createdAt,
                        UpdatedAt = updatedAt,
                        Email = email,
                    }, tx);
            }

            foreach (var p in normalized.Products)
            {
                var createdAt = ParseOptionalDate(p.CreatedAt);
                var updatedAt = ParseOptionalDate(p.UpdatedAt);
                var code = (p.Code ?? "").Trim();
                var id = await conn.QuerySingleAsync<long>(
                    @"INSERT INTO products (legacy_id, code, name, category_name, unit, brand, description, note, warning_stock, stock,
                      created_at, updated_at, created_by_email, updated_by_email)
                      VALUES (@LegacyId, @Code, @Name, @Category, @Unit, @Brand, @Description, @Note, @WarningStock, @Stock,
                      @CreatedAt, @UpdatedAt, @Email, @Email) RETURNING id",
                    new
                    {
                        LegacyId = p.Id,
                        Code = code,
                        Name = p.Name,
                        Category = p.Category ?? "",
                        Unit = p.Unit,
                        Brand = p.Brand ?? "",
                        Description = p.Description ?? "",
                        Note = p.Note ?? "",
                        WarningStock = p.WarningStock,
                        Stock = p.Stock,
                        CreatedAt = createdAt,
                        UpdatedAt = updatedAt,
                        Email = email,
                    }, tx);
                if (p.Id > 0 && !string.IsNullOrEmpty(code))
                    legacyIdToCode[p.Id] = code;
                if (!string.IsNullOrEmpty(code))
                    codeToId[code] = id;
            }

            var skippedTx = 0;
            foreach (var t in normalized.Transactions)
            {
                if (!TryResolveProductId(t.ProductId, null, legacyIdToCode, codeToId, out var productId))
                {
                    skippedTx++;
                    continue;
                }

                await conn.ExecuteAsync(
                    @"INSERT INTO transactions (legacy_id, movement_at, product_id, type, quantity, note, created_by_email)
                      VALUES (@LegacyId, @MovementAt, @ProductId, @Type, @Quantity, @Note, @Email)",
                    new
                    {
                        LegacyId = t.Id,
                        MovementAt = ServiceHelpers.ParseLegacyDateTime(t.Date),
                        ProductId = productId,
                        Type = t.Type,
                        Quantity = t.Quantity,
                        Note = t.Note ?? "",
                        Email = email,
                    }, tx);
            }

            foreach (var s in normalized.ExportSlips)
            {
                var createdAt = ParseOptionalDate(s.CreatedAt);
                var updatedAt = ParseOptionalDate(s.UpdatedAt);
                await conn.ExecuteAsync(
                    @"INSERT INTO export_slips (legacy_id, code, slip_date, recipient, note, status, items, out_transaction_ids, return_transaction_ids,
                      created_at, updated_at, created_by_email, updated_by_email)
                      VALUES (@LegacyId, @Code, @SlipDate, @Recipient, @Note, @Status, @Items::jsonb, @OutIds::jsonb, @ReturnIds::jsonb,
                      @CreatedAt, @UpdatedAt, @Email, @Email)",
                    new
                    {
                        LegacyId = s.Id,
                        Code = s.Code,
                        SlipDate = ServiceHelpers.ParseLegacyDateTime(s.Date),
                        Recipient = s.Recipient ?? "",
                        Note = s.Note ?? "",
                        Status = s.Status,
                        Items = RemapSlipItems(s.Items, legacyIdToCode, codeToId),
                        OutIds = ToJsonArray(s.OutTransactionIds),
                        ReturnIds = ToJsonArray(s.ReturnTransactionIds),
                        CreatedAt = createdAt,
                        UpdatedAt = updatedAt,
                        Email = email,
                    }, tx);
            }

            foreach (var s in normalized.ImportSlips)
            {
                var createdAt = ParseOptionalDate(s.CreatedAt);
                var updatedAt = ParseOptionalDate(s.UpdatedAt);
                await conn.ExecuteAsync(
                    @"INSERT INTO import_slips (legacy_id, code, slip_date, supplier, note, status, items, in_transaction_ids, return_transaction_ids,
                      created_at, updated_at, created_by_email, updated_by_email)
                      VALUES (@LegacyId, @Code, @SlipDate, @Supplier, @Note, @Status, @Items::jsonb, @InIds::jsonb, @ReturnIds::jsonb,
                      @CreatedAt, @UpdatedAt, @Email, @Email)",
                    new
                    {
                        LegacyId = s.Id,
                        Code = s.Code,
                        SlipDate = ServiceHelpers.ParseLegacyDateTime(s.Date),
                        Supplier = s.Supplier ?? "",
                        Note = s.Note ?? "",
                        Status = s.Status,
                        Items = RemapSlipItems(s.Items, legacyIdToCode, codeToId),
                        InIds = ToJsonArray(s.InTransactionIds),
                        ReturnIds = ToJsonArray(s.ReturnTransactionIds),
                        CreatedAt = createdAt,
                        UpdatedAt = updatedAt,
                        Email = email,
                    }, tx);
            }

            await ResetSequencesAsync(conn, tx);
            await tx.CommitAsync();

            return ServiceResult<ImportSummary>.Success(new ImportSummary
            {
                Categories = normalized.Categories.Count,
                Products = normalized.Products.Count,
                Transactions = normalized.Transactions.Count - skippedTx,
                ExportSlips = normalized.ExportSlips.Count,
                ImportSlips = normalized.ImportSlips.Count,
                SkippedTransactions = skippedTx,
                SourceVersion = normalized.Version,
                ExportedAt = normalized.ExportedAt,
            });
        }
        catch (Exception ex)
        {
            try { await tx.RollbackAsync(); } catch { /* transaction may already be aborted */ }
            return ServiceResult<ImportSummary>.Fail($"Import thất bại: {ex.Message}");
        }
    }

    /// <summary>
    /// Sửa dữ liệu đã import sai: giữ sản phẩm/phiếu mới, chỉ cập nhật phiếu và giao dịch
    /// trùng mã theo file JSON gốc. Map sản phẩm theo code, ngày theo giờ VN.
    /// </summary>
    public async Task<ServiceResult<RepairSummary>> RepairAsync(LegacyBackup backup, string email)
    {
        var normalized = Normalize(backup);
        await using var conn = db.Create();
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        try
        {
            var codeToId = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            foreach (var row in await conn.QueryAsync<(long Id, string Code)>("SELECT id, code FROM products", transaction: tx))
            {
                var code = (row.Code ?? "").Trim();
                if (code.Length > 0 && !codeToId.ContainsKey(code))
                    codeToId[code] = row.Id;
            }

            var legacyIdToCode = new Dictionary<int, string>();
            foreach (var p in normalized.Products)
            {
                var code = (p.Code ?? "").Trim();
                if (p.Id > 0 && code.Length > 0)
                    legacyIdToCode[p.Id] = code;
            }

            var summary = new RepairSummary();
            var now = DateTimeOffset.UtcNow;

            foreach (var s in normalized.ExportSlips)
            {
                var id = await conn.ExecuteScalarAsync<long?>(
                    "SELECT id FROM export_slips WHERE code = @Code", new { s.Code }, tx);
                if (id is null)
                {
                    summary.SkippedSlips++;
                    continue;
                }

                await conn.ExecuteAsync(
                    @"UPDATE export_slips SET items = @Items::jsonb, slip_date = @SlipDate,
                      updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
                    new
                    {
                        Items = RemapSlipItems(s.Items, legacyIdToCode, codeToId),
                        SlipDate = ServiceHelpers.ParseLegacyDateTime(s.Date),
                        Now = now,
                        Email = email,
                        Id = id.Value,
                    }, tx);
                summary.ExportSlipsUpdated++;
            }

            foreach (var s in normalized.ImportSlips)
            {
                var id = await conn.ExecuteScalarAsync<long?>(
                    "SELECT id FROM import_slips WHERE code = @Code", new { s.Code }, tx);
                if (id is null)
                {
                    summary.SkippedSlips++;
                    continue;
                }

                await conn.ExecuteAsync(
                    @"UPDATE import_slips SET items = @Items::jsonb, slip_date = @SlipDate,
                      updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
                    new
                    {
                        Items = RemapSlipItems(s.Items, legacyIdToCode, codeToId),
                        SlipDate = ServiceHelpers.ParseLegacyDateTime(s.Date),
                        Now = now,
                        Email = email,
                        Id = id.Value,
                    }, tx);
                summary.ImportSlipsUpdated++;
            }

            foreach (var t in normalized.Transactions)
            {
                if (!TryResolveProductId(t.ProductId, null, legacyIdToCode, codeToId, out var productId))
                {
                    summary.SkippedTransactions++;
                    continue;
                }

                var n = await conn.ExecuteAsync(
                    @"UPDATE transactions SET product_id = @ProductId, movement_at = @MovementAt
                      WHERE legacy_id = @LegacyId",
                    new
                    {
                        ProductId = productId,
                        MovementAt = ServiceHelpers.ParseLegacyDateTime(t.Date),
                        LegacyId = t.Id,
                    }, tx);
                if (n > 0) summary.TransactionsUpdated++;
                else summary.SkippedTransactions++;
            }

            await tx.CommitAsync();
            return ServiceResult<RepairSummary>.Success(summary);
        }
        catch (Exception ex)
        {
            try { await tx.RollbackAsync(); } catch { /* already aborted */ }
            return ServiceResult<RepairSummary>.Fail($"Sửa dữ liệu thất bại: {ex.Message}");
        }
    }

    private static List<LegacyCategoryDto> EnsureCategories(List<LegacyCategoryDto> categories, List<LegacyProductDto> products)
    {
        var list = categories?.Where(c => c.Id > 0 && !string.IsNullOrWhiteSpace(c.Name)).ToList() ?? [];
        var existingNames = new HashSet<string>(list.Select(c => c.Name.Trim().ToLowerInvariant()));
        var maxId = list.Count > 0 ? list.Max(c => c.Id) : 0;
        var now = ServiceHelpers.FormatLegacyDateTime(DateTimeOffset.Now);

        foreach (var name in products
            .Select(p => (p.Category ?? "").Trim())
            .Where(n => n.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (existingNames.Contains(name.ToLowerInvariant())) continue;
            maxId++;
            list.Add(new LegacyCategoryDto
            {
                Id = maxId,
                Code = $"NH{maxId:D2}",
                Name = name,
                Description = "Tự động tạo từ dữ liệu sản phẩm",
                CreatedAt = now,
                UpdatedAt = now,
            });
            existingNames.Add(name.ToLowerInvariant());
        }

        return list;
    }

    private static DateTimeOffset ParseOptionalDate(string? value) =>
        string.IsNullOrWhiteSpace(value) ? DateTimeOffset.UtcNow : ServiceHelpers.ParseLegacyDateTime(value);

    private static bool TryResolveProductId(
        int legacyProductId,
        string? productCode,
        Dictionary<int, string> legacyIdToCode,
        Dictionary<string, long> codeToId,
        out long productId)
    {
        productId = 0;
        var code = (productCode ?? "").Trim();
        if (code.Length == 0 && legacyProductId > 0)
            legacyIdToCode.TryGetValue(legacyProductId, out code);
        if (string.IsNullOrWhiteSpace(code)) return false;
        return codeToId.TryGetValue(code.Trim(), out productId);
    }

    private static string RemapSlipItems(
        object? value,
        Dictionary<int, string> legacyIdToCode,
        Dictionary<string, long> codeToId)
    {
        using var doc = JsonDocument.Parse(ToJsonArray(value));
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return "[]";

        var list = new List<object>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            var legacyPid = ReadInt(el, "productId", "ProductId");
            var code = ReadString(el, "productCode", "ProductCode", "code", "Code");
            var qty = ReadDecimal(el, "quantity", "Quantity");
            var note = ReadString(el, "note", "Note");
            if (!TryResolveProductId(legacyPid, code, legacyIdToCode, codeToId, out var mapped))
                continue;
            list.Add(new { productId = mapped, quantity = qty, note });
        }
        return JsonSerializer.Serialize(list);
    }

    private static int ReadInt(JsonElement el, params string[] names)
    {
        foreach (var n in names)
        {
            if (!el.TryGetProperty(n, out var p)) continue;
            if (p.TryGetInt32(out var v)) return v;
            if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out v)) return v;
            if (p.TryGetInt64(out var l)) return (int)l;
        }
        return 0;
    }

    private static decimal ReadDecimal(JsonElement el, params string[] names)
    {
        foreach (var n in names)
            if (el.TryGetProperty(n, out var p) && p.TryGetDecimal(out var v)) return v;
        return 0;
    }

    private static string ReadString(JsonElement el, params string[] names)
    {
        foreach (var n in names)
            if (el.TryGetProperty(n, out var p)) return p.GetString() ?? "";
        return "";
    }

    private static string ToJsonArray(object? value)
    {
        if (value is null) return "[]";
        if (value is JsonElement el) return el.ValueKind == JsonValueKind.Undefined ? "[]" : el.GetRawText();
        return JsonSerializer.Serialize(value);
    }

    private static async Task ResetSequencesAsync(System.Data.Common.DbConnection conn, System.Data.Common.DbTransaction tx)
    {
        foreach (var table in new[] { "categories", "products", "transactions", "export_slips", "import_slips" })
        {
            await conn.ExecuteAsync(
                $"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 1), true)",
                transaction: tx);
        }
    }
}
