namespace Inventory.Api.Services;

public static class ServiceHelpers
{
    public static DateTimeOffset ParseLegacyDateTime(string value)
    {
        if (DateTimeOffset.TryParse(value, out var dto)) return dto;
        if (DateTime.TryParseExact(value, "yyyy-MM-dd HH:mm", null, System.Globalization.DateTimeStyles.AssumeLocal, out var dt))
            return new DateTimeOffset(dt);
        return DateTimeOffset.UtcNow;
    }

    public static string FormatLegacyDateTime(DateTimeOffset value) =>
        value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");

    public static decimal StockDelta(string type, decimal qty) => type switch
    {
        "IN" => qty,
        "OUT" => -qty,
        "ADJUST" => qty,
        _ => 0,
    };
}

public class ServiceResult<T>
{
    public bool Ok { get; init; }
    public T? Data { get; init; }
    public string? Message { get; init; }
    public Dictionary<string, string>? Errors { get; init; }

    public static ServiceResult<T> Success(T data) => new() { Ok = true, Data = data };
    public static ServiceResult<T> Fail(string message) => new() { Ok = false, Message = message };
    public static ServiceResult<T> Fail(Dictionary<string, string> errors) => new() { Ok = false, Errors = errors };
}

public class ServiceResult
{
    public bool Ok { get; init; }
    public string? Message { get; init; }
    public Dictionary<string, string>? Errors { get; init; }

    public static ServiceResult Success() => new() { Ok = true };
    public static ServiceResult Fail(string message) => new() { Ok = false, Message = message };
}
