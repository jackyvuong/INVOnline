namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;

public class CategoryService(DbConnectionFactory db)
{
    public async Task<IEnumerable<Category>> GetAllAsync()
    {
        await using var conn = db.Create();
        return await conn.QueryAsync<Category>(
            @"SELECT id AS Id, legacy_id AS LegacyId, code AS Code, name AS Name, description AS Description,
              created_at AS CreatedAt, updated_at AS UpdatedAt, created_by_email AS CreatedByEmail, updated_by_email AS UpdatedByEmail
              FROM categories ORDER BY name");
    }

    public async Task<IEnumerable<object>> GetAllWithProductCountAsync()
    {
        await using var conn = db.Create();
        return await conn.QueryAsync(
            @"SELECT c.id AS id, c.legacy_id AS legacyId, c.code AS code, c.name AS name, c.description AS description,
              c.created_at AS createdAt, c.updated_at AS updatedAt, c.created_by_email AS createdByEmail,
              c.updated_by_email AS updatedByEmail,
              (SELECT COUNT(*)::int FROM products p WHERE p.category_name = c.name) AS productCount
              FROM categories c ORDER BY c.name");
    }

    public async Task<IEnumerable<object>> GetOptionsAsync()
    {
        await using var conn = db.Create();
        return await conn.QueryAsync(
            @"SELECT id AS id, name AS name FROM categories ORDER BY name");
    }

    public async Task<PagedResult<object>> GetPagedAsync(PagedQuery q)
    {
        await using var conn = db.Create();
        var search = PaginationHelper.LikePattern(q.Search);
        const string fromSql = @"
            FROM categories c
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS product_count FROM products p WHERE p.category_name = c.name
            ) pc ON true";
        const string whereSql = "WHERE (@Search IS NULL OR c.code ILIKE @Search OR c.name ILIKE @Search OR c.description ILIKE @Search)";

        var total = await conn.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*) {fromSql} {whereSql}", new { Search = search });

        var sortMap = new Dictionary<string, string>
        {
            ["code"] = "c.code", ["name"] = "c.name", ["description"] = "c.description", ["productCount"] = "pc.product_count",
        };
        var order = PaginationHelper.OrderClause(PaginationHelper.ResolveSort(q.Sort, sortMap, "code"), q.Desc);

        var items = await conn.QueryAsync(
            $@"SELECT c.id AS id, c.legacy_id AS {PaginationHelper.Alias("legacyId")}, c.code AS code, c.name AS name, c.description AS description,
               c.created_at AS {PaginationHelper.Alias("createdAt")}, c.updated_at AS {PaginationHelper.Alias("updatedAt")},
               pc.product_count AS {PaginationHelper.Alias("productCount")}
               {fromSql} {whereSql}
               ORDER BY {order}
               LIMIT @Limit OFFSET @Offset",
            new { Search = search, Limit = q.NormalizedPageSize, Offset = q.Offset });

        return PaginationHelper.Of(items, total, q);
    }

    public async Task<Category?> GetByIdAsync(long id)
    {
        await using var conn = db.Create();
        return await conn.QuerySingleOrDefaultAsync<Category>(
            @"SELECT id AS Id, legacy_id AS LegacyId, code AS Code, name AS Name, description AS Description,
              created_at AS CreatedAt, updated_at AS UpdatedAt, created_by_email AS CreatedByEmail, updated_by_email AS UpdatedByEmail
              FROM categories WHERE id = @Id", new { Id = id });
    }

    public async Task<ServiceResult<Category>> CreateAsync(Category input, string email)
    {
        var errors = await ValidateAsync(input, null);
        if (errors.Count > 0) return ServiceResult<Category>.Fail(errors);

        await using var conn = db.Create();
        await conn.OpenAsync();
        var legacyId = await conn.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM categories");
        var now = DateTimeOffset.UtcNow;

        var id = await conn.QuerySingleAsync<long>(
            @"INSERT INTO categories (legacy_id, code, name, description, created_at, updated_at, created_by_email, updated_by_email)
              VALUES (@LegacyId, @Code, @Name, @Description, @Now, @Now, @Email, @Email) RETURNING id",
            new { LegacyId = legacyId, input.Code, input.Name, input.Description, Now = now, Email = email });

        return ServiceResult<Category>.Success(new Category
        {
            Id = id, LegacyId = legacyId, Code = input.Code.Trim(), Name = input.Name.Trim(),
            Description = input.Description?.Trim() ?? "", CreatedAt = now, UpdatedAt = now,
            CreatedByEmail = email, UpdatedByEmail = email,
        });
    }

    public async Task<ServiceResult<Category>> UpdateAsync(long id, Category input, string email)
    {
        var current = await GetByIdAsync(id);
        if (current is null) return ServiceResult<Category>.Fail("Không tìm thấy công ty.");

        var errors = await ValidateAsync(input, id);
        if (errors.Count > 0) return ServiceResult<Category>.Fail(errors);

        var oldName = current.Name;
        var newName = input.Name.Trim();
        var now = DateTimeOffset.UtcNow;

        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        await conn.ExecuteAsync(
            @"UPDATE categories SET code = @Code, name = @Name, description = @Description,
              updated_at = @Now, updated_by_email = @Email WHERE id = @Id",
            new { input.Code, Name = newName, input.Description, Now = now, Email = email, Id = id }, tx);

        if (oldName != newName)
        {
            await conn.ExecuteAsync(
                @"UPDATE products SET category_name = @NewName, updated_at = @Now, updated_by_email = @Email
                  WHERE category_name = @OldName",
                new { NewName = newName, OldName = oldName, Now = now, Email = email }, tx);
        }

        await tx.CommitAsync();
        current.Code = input.Code.Trim();
        current.Name = newName;
        current.Description = input.Description?.Trim() ?? "";
        current.UpdatedAt = now;
        current.UpdatedByEmail = email;
        return ServiceResult<Category>.Success(current);
    }

    public async Task<ServiceResult> RemoveAsync(long id, string email)
    {
        var current = await GetByIdAsync(id);
        if (current is null) return ServiceResult.Fail("Không tìm thấy công ty.");

        await using var conn = db.Create();
        var count = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM products WHERE category_name = @Name", new { Name = current.Name });
        if (count > 0)
            return ServiceResult.Fail($"Không thể xóa. Có {count} sản phẩm đang thuộc công ty \"{current.Name}\".");

        await conn.ExecuteAsync(
            "UPDATE categories SET updated_by_email = @Email, updated_at = NOW() WHERE id = @Id",
            new { Email = email, Id = id });
        await conn.ExecuteAsync("DELETE FROM categories WHERE id = @Id", new { Id = id });
        return ServiceResult.Success();
    }

    private async Task<Dictionary<string, string>> ValidateAsync(Category input, long? editingId)
    {
        var errors = new Dictionary<string, string>();
        var code = input.Code?.Trim() ?? "";
        var name = input.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(code)) errors["code"] = "Mã công ty là bắt buộc.";
        if (string.IsNullOrWhiteSpace(name)) errors["name"] = "Tên công ty là bắt buộc.";

        await using var conn = db.Create();
        if (!string.IsNullOrWhiteSpace(code))
        {
            var dup = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM categories WHERE LOWER(code) = LOWER(@Code) AND (@Id IS NULL OR id <> @Id)",
                new { Code = code, Id = editingId });
            if (dup > 0) errors["code"] = "Mã công ty đã tồn tại.";
        }
        if (!string.IsNullOrWhiteSpace(name))
        {
            var dup = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM categories WHERE LOWER(name) = LOWER(@Name) AND (@Id IS NULL OR id <> @Id)",
                new { Name = name, Id = editingId });
            if (dup > 0) errors["name"] = "Tên công ty đã tồn tại.";
        }
        return errors;
    }
}
