namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using System.Text.Json;

public class SettingsService(DbConnectionFactory db)
{
    public async Task<object> ExportAsync()
    {
        await using var conn = db.Create();
        return new
        {
            version = "1.0.0",
            exportedAt = DateTimeOffset.UtcNow,
            categories = await conn.QueryAsync("SELECT legacy_id AS id, code, name, description, created_at AS \"createdAt\", updated_at AS \"updatedAt\" FROM categories ORDER BY legacy_id"),
            products = await conn.QueryAsync(@"SELECT legacy_id AS id, code, name, category_name AS category, unit, brand, description, note,
                warning_stock AS ""warningStock"", stock, created_at AS ""createdAt"", updated_at AS ""updatedAt"" FROM products ORDER BY legacy_id"),
            transactions = await conn.QueryAsync(@"SELECT t.legacy_id AS id, t.movement_at AS date, p.legacy_id AS ""productId"", t.type, t.quantity, t.note
                FROM transactions t JOIN products p ON p.id = t.product_id ORDER BY t.legacy_id"),
            exportSlips = await conn.QueryAsync(@"SELECT legacy_id AS id, code, slip_date AS date, recipient, note, status, items,
                out_transaction_ids AS ""outTransactionIds"", return_transaction_ids AS ""returnTransactionIds"",
                created_at AS ""createdAt"", updated_at AS ""updatedAt"" FROM export_slips ORDER BY legacy_id"),
            importSlips = await conn.QueryAsync(@"SELECT legacy_id AS id, code, slip_date AS date, supplier, note, status, items,
                in_transaction_ids AS ""inTransactionIds"", return_transaction_ids AS ""returnTransactionIds"",
                created_at AS ""createdAt"", updated_at AS ""updatedAt"" FROM import_slips ORDER BY legacy_id"),
        };
    }

    public async Task<ServiceResult> ImportAsync(JsonElement payload, string email)
    {
        if (!payload.TryGetProperty("products", out _) || !payload.TryGetProperty("transactions", out _))
            return ServiceResult.Fail("File JSON không hợp lệ (thiếu products/transactions).");

        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        await conn.ExecuteAsync("DELETE FROM transactions", tx);
        await conn.ExecuteAsync("DELETE FROM export_slips", tx);
        await conn.ExecuteAsync("DELETE FROM import_slips", tx);
        await conn.ExecuteAsync("DELETE FROM products", tx);
        await conn.ExecuteAsync("DELETE FROM categories", tx);

        var catMap = new Dictionary<int, long>();
        foreach (var c in payload.GetProperty("categories").EnumerateArray())
        {
            var legacyId = c.GetProperty("id").GetInt32();
            var id = await conn.QuerySingleAsync<long>(
                @"INSERT INTO categories (legacy_id, code, name, description, created_by_email, updated_by_email)
                  VALUES (@LegacyId, @Code, @Name, @Description, @Email, @Email) RETURNING id",
                new
                {
                    LegacyId = legacyId,
                    Code = c.GetProperty("code").GetString(),
                    Name = c.GetProperty("name").GetString(),
                    Description = c.TryGetProperty("description", out var d) ? d.GetString() : "",
                    Email = email,
                }, tx);
            catMap[legacyId] = id;
        }

        var prodMap = new Dictionary<int, long>();
        foreach (var p in payload.GetProperty("products").EnumerateArray())
        {
            var legacyId = p.GetProperty("id").GetInt32();
            var id = await conn.QuerySingleAsync<long>(
                @"INSERT INTO products (legacy_id, code, name, category_name, unit, brand, description, note, warning_stock, stock, created_by_email, updated_by_email)
                  VALUES (@LegacyId, @Code, @Name, @Category, @Unit, @Brand, @Description, @Note, @WarningStock, @Stock, @Email, @Email) RETURNING id",
                new
                {
                    LegacyId = legacyId,
                    Code = p.GetProperty("code").GetString(),
                    Name = p.GetProperty("name").GetString(),
                    Category = p.TryGetProperty("category", out var cat) ? cat.GetString() : "",
                    Unit = p.GetProperty("unit").GetString(),
                    Brand = p.TryGetProperty("brand", out var b) ? b.GetString() : "",
                    Description = p.TryGetProperty("description", out var desc) ? desc.GetString() : "",
                    Note = p.TryGetProperty("note", out var n) ? n.GetString() : "",
                    WarningStock = p.TryGetProperty("warningStock", out var w) ? w.GetInt32() : 0,
                    Stock = p.TryGetProperty("stock", out var s) ? s.GetDecimal() : 0,
                    Email = email,
                }, tx);
            prodMap[legacyId] = id;
        }

        foreach (var t in payload.GetProperty("transactions").EnumerateArray())
        {
            var productLegacyId = t.GetProperty("productId").GetInt32();
            if (!prodMap.TryGetValue(productLegacyId, out var productId)) continue;
            await conn.ExecuteAsync(
                @"INSERT INTO transactions (legacy_id, movement_at, product_id, type, quantity, note, created_by_email)
                  VALUES (@LegacyId, @MovementAt, @ProductId, @Type, @Quantity, @Note, @Email)",
                new
                {
                    LegacyId = t.GetProperty("id").GetInt32(),
                    MovementAt = ServiceHelpers.ParseLegacyDateTime(t.GetProperty("date").GetString() ?? ""),
                    ProductId = productId,
                    Type = t.GetProperty("type").GetString(),
                    Quantity = t.GetProperty("quantity").GetDecimal(),
                    Note = t.TryGetProperty("note", out var note) ? note.GetString() : "",
                    Email = email,
                }, tx);
        }

        if (payload.TryGetProperty("exportSlips", out var exportSlips))
        {
            foreach (var s in exportSlips.EnumerateArray())
            {
                await conn.ExecuteAsync(
                    @"INSERT INTO export_slips (legacy_id, code, slip_date, recipient, note, status, items, out_transaction_ids, return_transaction_ids, created_by_email, updated_by_email)
                      VALUES (@LegacyId, @Code, @SlipDate, @Recipient, @Note, @Status, @Items::jsonb, @OutIds::jsonb, @ReturnIds::jsonb, @Email, @Email)",
                    new
                    {
                        LegacyId = s.GetProperty("id").GetInt32(),
                        Code = s.GetProperty("code").GetString(),
                        SlipDate = ServiceHelpers.ParseLegacyDateTime(s.GetProperty("date").GetString() ?? ""),
                        Recipient = s.TryGetProperty("recipient", out var r) ? r.GetString() : "",
                        Note = s.TryGetProperty("note", out var n) ? n.GetString() : "",
                        Status = s.GetProperty("status").GetString(),
                        Items = s.TryGetProperty("items", out var items) ? items.GetRawText() : "[]",
                        OutIds = s.TryGetProperty("outTransactionIds", out var o) ? o.GetRawText() : "[]",
                        ReturnIds = s.TryGetProperty("returnTransactionIds", out var ret) ? ret.GetRawText() : "[]",
                        Email = email,
                    }, tx);
            }
        }

        if (payload.TryGetProperty("importSlips", out var importSlips))
        {
            foreach (var s in importSlips.EnumerateArray())
            {
                await conn.ExecuteAsync(
                    @"INSERT INTO import_slips (legacy_id, code, slip_date, supplier, note, status, items, in_transaction_ids, return_transaction_ids, created_by_email, updated_by_email)
                      VALUES (@LegacyId, @Code, @SlipDate, @Supplier, @Note, @Status, @Items::jsonb, @InIds::jsonb, @ReturnIds::jsonb, @Email, @Email)",
                    new
                    {
                        LegacyId = s.GetProperty("id").GetInt32(),
                        Code = s.GetProperty("code").GetString(),
                        SlipDate = ServiceHelpers.ParseLegacyDateTime(s.GetProperty("date").GetString() ?? ""),
                        Supplier = s.TryGetProperty("supplier", out var sup) ? sup.GetString() : "",
                        Note = s.TryGetProperty("note", out var n) ? n.GetString() : "",
                        Status = s.GetProperty("status").GetString(),
                        Items = s.TryGetProperty("items", out var items) ? items.GetRawText() : "[]",
                        InIds = s.TryGetProperty("inTransactionIds", out var i) ? i.GetRawText() : "[]",
                        ReturnIds = s.TryGetProperty("returnTransactionIds", out var ret) ? ret.GetRawText() : "[]",
                        Email = email,
                    }, tx);
            }
        }

        await tx.CommitAsync();
        return ServiceResult.Success();
    }

    public async Task<ServiceResult> ClearAllAsync(string email)
    {
        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();
        await conn.ExecuteAsync("DELETE FROM transactions", tx);
        await conn.ExecuteAsync("DELETE FROM export_slips", tx);
        await conn.ExecuteAsync("DELETE FROM import_slips", tx);
        await conn.ExecuteAsync("DELETE FROM products", tx);
        await conn.ExecuteAsync("DELETE FROM categories", tx);
        await tx.CommitAsync();
        return ServiceResult.Success();
    }
}
