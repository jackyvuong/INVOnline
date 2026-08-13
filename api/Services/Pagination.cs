namespace Inventory.Api.Services;

public class PagedQuery
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? Search { get; set; }
    public string? Sort { get; set; }
    public string? Dir { get; set; }

    public int NormalizedPage => Math.Max(1, Page);
    public int NormalizedPageSize => Math.Clamp(PageSize, 1, 50000);
    public int Offset => (NormalizedPage - 1) * NormalizedPageSize;
    public bool Desc => string.Equals(Dir, "desc", StringComparison.OrdinalIgnoreCase);
}

public class PagedResult<T>
{
    public required IEnumerable<T> Items { get; init; }
    public int Total { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}

public static class PaginationHelper
{
    public static string ResolveSort(string? sort, IReadOnlyDictionary<string, string> map, string defaultKey)
    {
        if (!string.IsNullOrEmpty(sort) && map.TryGetValue(sort, out var col))
            return col;
        return map[defaultKey];
    }

    public static string OrderClause(string column, bool desc) => $"{column} {(desc ? "DESC" : "ASC")}";

    public static string? LikePattern(string? search) =>
        string.IsNullOrWhiteSpace(search) ? null : $"%{search.Trim()}%";

    public static PagedResult<T> Of<T>(IEnumerable<T> items, int total, PagedQuery q) => new()
    {
        Items = items,
        Total = total,
        Page = q.NormalizedPage,
        PageSize = q.NormalizedPageSize,
    };

    /// <summary>Quote camelCase alias — PostgreSQL folds unquoted identifiers to lowercase.</summary>
    public static string Alias(string name) => $@"""{name}""";
}
