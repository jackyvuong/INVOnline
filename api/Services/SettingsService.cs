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
        const string ts = "to_char({0} AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI')";
        return new
        {
            version = "1.0.0",
            exportedAt = ServiceHelpers.FormatLegacyDateTime(DateTimeOffset.Now),
            categories = await conn.QueryAsync(
                $@"SELECT legacy_id AS id, code, name, description,
                   {string.Format(ts, "created_at")} AS {PaginationHelper.Alias("createdAt")},
                   {string.Format(ts, "updated_at")} AS {PaginationHelper.Alias("updatedAt")}
                   FROM categories ORDER BY legacy_id"),
            products = await conn.QueryAsync(
                $@"SELECT legacy_id AS id, code, name, category_name AS category, unit, brand, description, note,
                   warning_stock AS {PaginationHelper.Alias("warningStock")}, stock,
                   {string.Format(ts, "created_at")} AS {PaginationHelper.Alias("createdAt")},
                   {string.Format(ts, "updated_at")} AS {PaginationHelper.Alias("updatedAt")}
                   FROM products ORDER BY legacy_id"),
            transactions = await conn.QueryAsync(
                $@"SELECT t.legacy_id AS id, {string.Format(ts, "t.movement_at")} AS date,
                   p.legacy_id AS {PaginationHelper.Alias("productId")}, t.type, t.quantity, t.note
                   FROM transactions t JOIN products p ON p.id = t.product_id ORDER BY t.legacy_id"),
            exportSlips = await conn.QueryAsync(
                $@"SELECT legacy_id AS id, code, {string.Format(ts, "slip_date")} AS date, recipient, note, status, items,
                   out_transaction_ids AS {PaginationHelper.Alias("outTransactionIds")},
                   return_transaction_ids AS {PaginationHelper.Alias("returnTransactionIds")},
                   {string.Format(ts, "created_at")} AS {PaginationHelper.Alias("createdAt")},
                   {string.Format(ts, "updated_at")} AS {PaginationHelper.Alias("updatedAt")}
                   FROM export_slips ORDER BY legacy_id"),
            importSlips = await conn.QueryAsync(
                $@"SELECT legacy_id AS id, code, {string.Format(ts, "slip_date")} AS date, supplier, note, status, items,
                   in_transaction_ids AS {PaginationHelper.Alias("inTransactionIds")},
                   return_transaction_ids AS {PaginationHelper.Alias("returnTransactionIds")},
                   {string.Format(ts, "created_at")} AS {PaginationHelper.Alias("createdAt")},
                   {string.Format(ts, "updated_at")} AS {PaginationHelper.Alias("updatedAt")}
                   FROM import_slips ORDER BY legacy_id"),
        };
    }

    public Task<ServiceResult<ImportSummary>> ImportAsync(JsonElement payload, string email)
    {
        var backup = LegacyImportService.TryParse(payload, out var parseError);
        if (backup is null)
            return Task.FromResult(ServiceResult<ImportSummary>.Fail(parseError ?? "File JSON không hợp lệ."));

        return legacyImport.ImportAsync(backup, email);
    }

    public Task<ServiceResult<RepairSummary>> RepairAsync(JsonElement payload, string email)
    {
        var backup = LegacyImportService.TryParse(payload, out var parseError);
        if (backup is null)
            return Task.FromResult(ServiceResult<RepairSummary>.Fail(parseError ?? "File JSON không hợp lệ."));

        return legacyImport.RepairAsync(backup, email);
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
