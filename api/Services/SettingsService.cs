namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;
using System.Text.Json;

public class SettingsService(DbConnectionFactory db, LegacyImportService legacyImport)
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

    public Task<ServiceResult<ImportSummary>> ImportAsync(JsonElement payload, string email)
    {
        var backup = LegacyImportService.TryParse(payload, out var parseError);
        if (backup is null)
            return Task.FromResult(ServiceResult<ImportSummary>.Fail(parseError ?? "File JSON không hợp lệ."));

        return legacyImport.ImportAsync(backup, email);
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
