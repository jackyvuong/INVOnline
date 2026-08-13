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

    public async Task<IEnumerable<object>> GetOptionsAsync()
    {
        await using var conn = db.Create();
        return await conn.QueryAsync(
            $@"SELECT id AS id, legacy_id AS {PaginationHelper.Alias("legacyId")}, code AS code, name AS name, category_name AS category, unit AS unit,
              brand AS brand, stock AS stock
              FROM products ORDER BY code");
    }

    public async Task<PagedResult<object>> GetPagedAsync(PagedQuery q, string? category, string? status)
    {
        await using var conn = db.Create();
        var search = PaginationHelper.LikePattern(q.Search);
        const string statusExpr = "CASE WHEN p.stock <= 0 THEN 'OUT' WHEN p.stock <= p.warning_stock THEN 'LOW' ELSE 'OK' END";
        var where = @"WHERE (@Search IS NULL OR p.code ILIKE @Search OR p.name ILIKE @Search OR p.category_name ILIKE @Search
            OR p.brand ILIKE @Search OR p.description ILIKE @Search OR p.note ILIKE @Search)
            AND (@Category IS NULL OR @Category = '' OR p.category_name = @Category)
            AND (@Status IS NULL OR @Status = '' OR " + statusExpr + " = @Status)";

        var total = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) FROM products p {where}",
            new { Search = search, Category = category, Status = status });

        var sortMap = new Dictionary<string, string>
        {
            ["code"] = "p.code", ["name"] = "p.name", ["category"] = "p.category_name", ["brand"] = "p.brand",
            ["stock"] = "p.stock", ["status"] = statusExpr,
        };
        var order = PaginationHelper.OrderClause(PaginationHelper.ResolveSort(q.Sort, sortMap, "code"), q.Desc);

        var items = await conn.QueryAsync(
            $@"SELECT p.id AS id, p.legacy_id AS {PaginationHelper.Alias("legacyId")}, p.code AS code, p.name AS name, p.category_name AS category,
               p.unit AS unit, p.brand AS brand, p.description AS description, p.note AS note,
               p.warning_stock AS {PaginationHelper.Alias("warningStock")}, p.stock AS stock, {statusExpr} AS status
               FROM products p {where}
               ORDER BY {order}
               LIMIT @Limit OFFSET @Offset",
            new { Search = search, Category = category, Status = status, Limit = q.NormalizedPageSize, Offset = q.Offset });

        return PaginationHelper.Of(items, total, q);
    }

    public async Task<IEnumerable<object>> GetAlertsAsync(int limit = 8)
    {
        await using var conn = db.Create();
        const string statusExpr = "CASE WHEN p.stock <= 0 THEN 'OUT' WHEN p.stock <= p.warning_stock THEN 'LOW' ELSE 'OK' END";
        return await conn.QueryAsync(
            $@"SELECT p.id AS id, p.code AS code, p.name AS name, p.stock AS stock, p.unit AS unit,
               p.warning_stock AS {PaginationHelper.Alias("warningStock")}, {statusExpr} AS status
               FROM products p
               WHERE {statusExpr} <> 'OK'
               ORDER BY p.stock ASC
               LIMIT @Limit",
            new { Limit = limit });
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
        await using var conn = db.Create();
        return await conn.QuerySingleAsync(
            $@"SELECT COUNT(*)::int AS {PaginationHelper.Alias("totalProducts")},
              COALESCE(SUM(stock), 0) AS {PaginationHelper.Alias("totalStock")},
              COUNT(*) FILTER (WHERE stock > 0 AND stock <= warning_stock)::int AS {PaginationHelper.Alias("lowCount")},
              COUNT(*) FILTER (WHERE stock <= 0)::int AS {PaginationHelper.Alias("outCount")}
              FROM products");
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
