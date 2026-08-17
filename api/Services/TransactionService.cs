namespace Inventory.Api.Services;

using Dapper;
using Inventory.Api.Data;
using Inventory.Api.Models;
using System.Text.Json;

public class TransactionService(DbConnectionFactory db, ProductService products)
{
    public async Task<IEnumerable<object>> GetAllEnrichedAsync()
    {
        await using var conn = db.Create();
        return await conn.QueryAsync(
            $@"SELECT t.id AS id, t.legacy_id AS {PaginationHelper.Alias("legacyId")}, t.movement_at AS {PaginationHelper.Alias("movementAt")}, t.product_id AS {PaginationHelper.Alias("productId")},
              t.type AS type, t.quantity AS quantity, t.note AS note, t.created_at AS {PaginationHelper.Alias("createdAt")},
              t.created_by_email AS {PaginationHelper.Alias("createdByEmail")},
              p.code AS {PaginationHelper.Alias("productCode")}, p.name AS {PaginationHelper.Alias("productName")}, p.category_name AS {PaginationHelper.Alias("companyName")},
              p.brand AS {PaginationHelper.Alias("productBrand")}, p.unit AS {PaginationHelper.Alias("productUnit")}
              FROM transactions t JOIN products p ON p.id = t.product_id
              ORDER BY t.legacy_id DESC");
    }

    public async Task<PagedResult<object>> GetPagedAsync(
        PagedQuery q, string? type, string? category, long? productId, string? dateFrom, string? dateTo)
    {
        await using var conn = db.Create();
        var search = PaginationHelper.LikePattern(q.Search);
        const string fromSql = "FROM transactions t JOIN products p ON p.id = t.product_id";
        const string whereSql = @"WHERE (@Search IS NULL OR p.code ILIKE @Search OR p.name ILIKE @Search OR p.category_name ILIKE @Search
            OR p.brand ILIKE @Search OR t.note ILIKE @Search OR t.type ILIKE @Search)
            AND (@Type IS NULL OR @Type = '' OR t.type = @Type)
            AND (@Category IS NULL OR @Category = '' OR p.category_name = @Category)
            AND (@ProductId IS NULL OR t.product_id = @ProductId)
            AND (@DateFrom IS NULL OR @DateFrom = '' OR t.movement_at::date >= @DateFrom::date)
            AND (@DateTo IS NULL OR @DateTo = '' OR t.movement_at::date <= @DateTo::date)";

        var total = await conn.ExecuteScalarAsync<int>($"SELECT COUNT(*) {fromSql} {whereSql}",
            new { Search = search, Type = type, Category = category, ProductId = productId, DateFrom = dateFrom, DateTo = dateTo });

        var sortMap = new Dictionary<string, string>
        {
            ["movementAt"] = "t.movement_at", ["type"] = "t.type", ["productCode"] = "p.code",
            ["productName"] = "p.name", ["companyName"] = "p.category_name", ["productBrand"] = "p.brand",
            ["quantity"] = "t.quantity",
        };
        var order = PaginationHelper.OrderClause(PaginationHelper.ResolveSort(q.Sort, sortMap, "movementAt"), q.Desc);

        var items = await conn.QueryAsync(
            $@"SELECT t.id AS id, t.legacy_id AS {PaginationHelper.Alias("legacyId")}, t.movement_at AS {PaginationHelper.Alias("movementAt")}, t.product_id AS {PaginationHelper.Alias("productId")},
               t.type AS type, t.quantity AS quantity, t.note AS note,
               p.code AS {PaginationHelper.Alias("productCode")}, p.name AS {PaginationHelper.Alias("productName")}, p.category_name AS {PaginationHelper.Alias("companyName")},
               p.brand AS {PaginationHelper.Alias("productBrand")}, p.unit AS {PaginationHelper.Alias("productUnit")}
               {fromSql} {whereSql}
               ORDER BY {order}
               LIMIT @Limit OFFSET @Offset",
            new
            {
                Search = search, Type = type, Category = category, ProductId = productId,
                DateFrom = dateFrom, DateTo = dateTo, Limit = q.NormalizedPageSize, Offset = q.Offset,
            });

        return PaginationHelper.Of(items, total, q);
    }

    public async Task<IEnumerable<object>> GetRecentAsync(int limit = 5)
    {
        await using var conn = db.Create();
        return await conn.QueryAsync(
            $@"SELECT t.id AS id, t.legacy_id AS {PaginationHelper.Alias("legacyId")}, t.movement_at AS {PaginationHelper.Alias("movementAt")}, t.product_id AS {PaginationHelper.Alias("productId")},
              t.type AS type, t.quantity AS quantity, t.note AS note, t.created_at AS {PaginationHelper.Alias("createdAt")},
              t.created_by_email AS {PaginationHelper.Alias("createdByEmail")},
              p.code AS {PaginationHelper.Alias("productCode")}, p.name AS {PaginationHelper.Alias("productName")}, p.category_name AS {PaginationHelper.Alias("companyName")},
              p.brand AS {PaginationHelper.Alias("productBrand")}, p.unit AS {PaginationHelper.Alias("productUnit")}
              FROM transactions t JOIN products p ON p.id = t.product_id
              ORDER BY t.legacy_id DESC
              LIMIT @Limit",
            new { Limit = limit });
    }

    public async Task<ServiceResult<object>> CreateAsync(string date, string type, long productId, decimal quantity, string note, string email)
    {
        var product = await products.GetByIdAsync(productId);
        if (product is null)
            return ServiceResult<object>.Fail(new Dictionary<string, string> { ["productId"] = "Không tìm thấy sản phẩm." });

        type = type.ToUpperInvariant();
        var errors = new Dictionary<string, string>();
        decimal nextStock = product.Stock;

        if (type == "IN")
        {
            if (quantity <= 0) errors["quantity"] = "Số lượng nhập phải > 0.";
            else nextStock = product.Stock + quantity;
        }
        else if (type == "OUT")
        {
            if (quantity <= 0) errors["quantity"] = "Số lượng xuất phải > 0.";
            else if (product.Stock < quantity) errors["quantity"] = $"Không đủ tồn kho. Tồn hiện tại: {product.Stock}.";
            else nextStock = product.Stock - quantity;
        }
        else if (type == "ADJUST")
        {
            if (quantity == 0) errors["quantity"] = "Số điều chỉnh phải khác 0.";
            else
            {
                nextStock = product.Stock + quantity;
                if (nextStock < 0) errors["quantity"] = $"Điều chỉnh sẽ làm tồn âm. Tồn hiện tại: {product.Stock}.";
            }
        }
        else errors["type"] = "Loại giao dịch không hợp lệ.";

        if (errors.Count > 0) return ServiceResult<object>.Fail(errors);

        await using var conn = db.Create();
        await conn.OpenAsync();
        using var tx = await conn.BeginTransactionAsync();

        await products.SetStockAsync(productId, nextStock, email, conn, tx);
        var legacyId = await conn.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM transactions", transaction: tx);
        var movementAt = ServiceHelpers.ParseLegacyDateTime(date);

        var id = await conn.QuerySingleAsync<long>(
            @"INSERT INTO transactions (legacy_id, movement_at, product_id, type, quantity, note, created_by_email)
              VALUES (@LegacyId, @MovementAt, @ProductId, @Type, @Quantity, @Note, @Email) RETURNING id",
            new { LegacyId = legacyId, MovementAt = movementAt, ProductId = productId, Type = type, Quantity = quantity, Note = note?.Trim() ?? "", Email = email }, tx);

        await tx.CommitAsync();

        return ServiceResult<object>.Success(new
        {
            Id = id, LegacyId = legacyId, Date = ServiceHelpers.FormatLegacyDateTime(movementAt),
            ProductId = productId, Type = type, Quantity = quantity, Note = note?.Trim() ?? "",
            CreatedByEmail = email,
        });
    }

    /// <summary>Internal — dùng từ slip service trong cùng transaction.</summary>
    public async Task<ServiceResult<int>> CreateInTransactionAsync(
        Npgsql.NpgsqlConnection conn, Npgsql.NpgsqlTransaction tx,
        string date, string type, long productId, decimal quantity, string note, string email)
    {
        var product = await conn.QuerySingleOrDefaultAsync<Product>(
            @"SELECT id AS Id, stock AS Stock FROM products
              WHERE id = @Id
              FOR UPDATE", new { Id = productId }, tx);
        if (product is null) return ServiceResult<int>.Fail("Không tìm thấy sản phẩm.");
        productId = product.Id;

        type = type.ToUpperInvariant();
        decimal nextStock = product.Stock;
        if (type == "IN") nextStock += quantity;
        else if (type == "OUT")
        {
            if (product.Stock < quantity) return ServiceResult<int>.Fail($"Không đủ tồn. Hiện có: {product.Stock}.");
            nextStock -= quantity;
        }
        else if (type == "ADJUST") nextStock += quantity;

        if (nextStock < 0) return ServiceResult<int>.Fail("Tồn không được âm.");

        await conn.ExecuteAsync(
            "UPDATE products SET stock = @Stock, updated_at = NOW(), updated_by_email = @Email WHERE id = @Id",
            new { Stock = nextStock, Email = email, Id = productId }, tx);

        var legacyId = await conn.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(legacy_id), 0) + 1 FROM transactions", transaction: tx);
        var movementAt = ServiceHelpers.ParseLegacyDateTime(date);
        await conn.ExecuteAsync(
            @"INSERT INTO transactions (legacy_id, movement_at, product_id, type, quantity, note, created_by_email)
              VALUES (@LegacyId, @MovementAt, @ProductId, @Type, @Quantity, @Note, @Email)",
            new { LegacyId = legacyId, MovementAt = movementAt, ProductId = productId, Type = type, Quantity = quantity, Note = note, Email = email }, tx);

        return ServiceResult<int>.Success(legacyId);
    }
}

public static class JsonDb
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public static string ToJson<T>(T value) => JsonSerializer.Serialize(value, JsonOpts);
    public static T FromJson<T>(string json) => JsonSerializer.Deserialize<T>(json, JsonOpts) ?? Activator.CreateInstance<T>()!;
}
