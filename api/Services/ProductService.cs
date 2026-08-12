namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;

public class ProductService(DbConnectionFactory db)
{
    public async Task<IEnumerable<Product>> GetAllAsync()
    {
        await using var conn = db.Create();
        return await conn.QueryAsync<Product>(
            @"SELECT id AS Id, legacy_id AS LegacyId, code AS Code, name AS Name, category_name AS CategoryName,
              unit AS Unit, brand AS Brand, description AS Description, note AS Note, warning_stock AS WarningStock,
              stock AS Stock, created_at AS CreatedAt, updated_at AS UpdatedAt,
              created_by_email AS CreatedByEmail, updated_by_email AS UpdatedByEmail
              FROM products ORDER BY code");
    }

    public async Task<Product?> GetByIdAsync(long id)
    {
        await using var conn = db.Create();
        return await conn.QuerySingleOrDefaultAsync<Product>(
            @"SELECT id AS Id, legacy_id AS LegacyId, code AS Code, name AS Name, category_name AS CategoryName,
              unit AS Unit, brand AS Brand, description AS Description, note AS Note, warning_stock AS WarningStock,
              stock AS Stock, created_at AS CreatedAt, updated_at AS UpdatedAt,
              created_by_email AS CreatedByEmail, updated_by_email AS UpdatedByEmail
              FROM products WHERE id = @Id", new { Id = id });
    }

    public async Task<ServiceResult<Product>> CreateAsync(Product input, string email)
    {
        var errors = await ValidateAsync(input, null);
        if (errors.Count > 0) return ServiceResult<Product>.Fail(errors);

        await using var conn = db.Create();
        var legacyId = await conn.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM products");
        var now = DateTimeOffset.UtcNow;

        var id = await conn.QuerySingleAsync<long>(
            @"INSERT INTO products (legacy_id, code, name, category_name, unit, brand, description, note, warning_stock, stock,
              created_at, updated_at, created_by_email, updated_by_email)
              VALUES (@LegacyId, @Code, @Name, @CategoryName, @Unit, @Brand, @Description, @Note, @WarningStock, 0,
              @Now, @Now, @Email, @Email) RETURNING id",
            new
            {
                LegacyId = legacyId, Code = input.Code.Trim(), Name = input.Name.Trim(),
                CategoryName = input.CategoryName.Trim(), Unit = input.Unit.Trim(),
                Brand = input.Brand?.Trim() ?? "", Description = input.Description?.Trim() ?? "",
                Note = input.Note?.Trim() ?? "", input.WarningStock, Now = now, Email = email,
            });

        return ServiceResult<Product>.Success(new Product
        {
            Id = id, LegacyId = legacyId, Code = input.Code.Trim(), Name = input.Name.Trim(),
            CategoryName = input.CategoryName.Trim(), Unit = input.Unit.Trim(),
            Brand = input.Brand?.Trim() ?? "", Description = input.Description?.Trim() ?? "",
            Note = input.Note?.Trim() ?? "", WarningStock = input.WarningStock, Stock = 0,
            CreatedAt = now, UpdatedAt = now, CreatedByEmail = email, UpdatedByEmail = email,
        });
    }

    public async Task<ServiceResult<Product>> UpdateAsync(long id, Product input, string email)
    {
        var current = await GetByIdAsync(id);
        if (current is null) return ServiceResult<Product>.Fail("Không tìm thấy sản phẩm.");

        var errors = await ValidateAsync(input, id);
        if (errors.Count > 0) return ServiceResult<Product>.Fail(errors);

        var now = DateTimeOffset.UtcNow;
        await using var conn = db.Create();
        await conn.ExecuteAsync(
            @"UPDATE products SET code = @Code, name = @Name, category_name = @CategoryName, unit = @Unit,
              brand = @Brand, description = @Description, note = @Note, warning_stock = @WarningStock,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new
            {
                Code = input.Code.Trim(), Name = input.Name.Trim(), CategoryName = input.CategoryName.Trim(),
                Unit = input.Unit.Trim(), Brand = input.Brand?.Trim() ?? "", Description = input.Description?.Trim() ?? "",
                Note = input.Note?.Trim() ?? "", input.WarningStock, Now = now, Email = email, Id = id,
            });

        current.Code = input.Code.Trim();
        current.Name = input.Name.Trim();
        current.CategoryName = input.CategoryName.Trim();
        current.Unit = input.Unit.Trim();
        current.Brand = input.Brand?.Trim() ?? "";
        current.Description = input.Description?.Trim() ?? "";
        current.Note = input.Note?.Trim() ?? "";
        current.WarningStock = input.WarningStock;
        current.UpdatedAt = now;
        current.UpdatedByEmail = email;
        return ServiceResult<Product>.Success(current);
    }

    public async Task<ServiceResult> RemoveAsync(long id, string email)
    {
        var current = await GetByIdAsync(id);
        if (current is null) return ServiceResult.Fail("Không tìm thấy sản phẩm.");

        await using var conn = db.Create();
        var txCount = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM transactions WHERE product_id = @Id", new { Id = id });
        if (txCount > 0)
            return ServiceResult.Fail("Không thể xóa sản phẩm đã có lịch sử giao dịch.");

        await conn.ExecuteAsync(
            "UPDATE products SET updated_by_email = @Email, updated_at = NOW() WHERE id = @Id",
            new { Email = email, Id = id });
        await conn.ExecuteAsync("DELETE FROM products WHERE id = @Id", new { Id = id });
        return ServiceResult.Success();
    }

    public async Task SetStockAsync(long productId, decimal stock, string email, Npgsql.NpgsqlConnection conn, Npgsql.NpgsqlTransaction tx)
    {
        await conn.ExecuteAsync(
            "UPDATE products SET stock = @Stock, updated_at = NOW(), updated_by_email = @Email WHERE id = @Id",
            new { Stock = stock, Email = email, Id = productId }, tx);
    }

    public async Task<object> GetDashboardStatsAsync()
    {
        var products = (await GetAllAsync()).ToList();
        var totalProducts = products.Count;
        var totalStock = products.Sum(p => p.Stock);
        var lowCount = products.Count(p => StockStatus.FromProduct(p.Stock, p.WarningStock) == StockStatus.Low);
        var outCount = products.Count(p => StockStatus.FromProduct(p.Stock, p.WarningStock) == StockStatus.Out);
        return new { totalProducts, totalStock, lowCount, outCount };
    }

    private async Task<Dictionary<string, string>> ValidateAsync(Product input, long? editingId)
    {
        var errors = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(input.Code)) errors["code"] = "Mã sản phẩm là bắt buộc.";
        if (string.IsNullOrWhiteSpace(input.Name)) errors["name"] = "Tên sản phẩm là bắt buộc.";
        if (string.IsNullOrWhiteSpace(input.Unit)) errors["unit"] = "Đơn vị là bắt buộc.";
        if (input.WarningStock < 0) errors["warningStock"] = "Tồn cảnh báo phải ≥ 0.";

        await using var conn = db.Create();
        if (!string.IsNullOrWhiteSpace(input.Code))
        {
            var dup = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM products WHERE LOWER(code) = LOWER(@Code) AND (@Id IS NULL OR id <> @Id)",
                new { Code = input.Code.Trim(), Id = editingId });
            if (dup > 0) errors["code"] = "Mã sản phẩm đã tồn tại.";
        }
        if (!string.IsNullOrWhiteSpace(input.Name))
        {
            var dup = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM products WHERE LOWER(name) = LOWER(@Name) AND (@Id IS NULL OR id <> @Id)",
                new { Name = input.Name.Trim(), Id = editingId });
            if (dup > 0) errors["name"] = "Tên sản phẩm đã tồn tại.";
        }
        return errors;
    }
}
