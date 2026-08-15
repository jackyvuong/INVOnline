namespace Inventory.Api.Services;

using System.Globalization;
using System.Text.RegularExpressions;

public static class ServiceHelpers
{
    private static readonly TimeZoneInfo VietnamTz = ResolveVietnamTimeZone();
    private static readonly string[] NaiveFormats =
    [
        "yyyy-MM-dd HH:mm",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd'T'HH:mm:ss",
        "dd-MM-yyyy HH:mm",
        "dd/MM/yyyy HH:mm",
        "yyyy-MM-dd",
        "dd-MM-yyyy",
        "dd/MM/yyyy",
    ];

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        foreach (var id in new[] { "Asia/Ho_Chi_Minh", "SE Asia Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("VN", TimeSpan.FromHours(7), "Vietnam", "Vietnam");
    }

    private static bool HasExplicitOffset(string value)
    {
        var s = value.Trim();
        if (s.EndsWith("Z", StringComparison.OrdinalIgnoreCase)) return true;
        return Regex.IsMatch(s, @"[+-]\d{2}:?\d{2}$");
    }

    public static DateTimeOffset ParseLegacyDateTime(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return DateTimeOffset.UtcNow;
        var s = value.Trim();

        if (HasExplicitOffset(s) && DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dto))
            return dto.ToUniversalTime();

        if (DateTime.TryParseExact(s, NaiveFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)
            || DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt))
        {
            var unspecified = DateTime.SpecifyKind(dt, DateTimeKind.Unspecified);
            var offset = VietnamTz.GetUtcOffset(unspecified);
            return new DateTimeOffset(unspecified, offset).ToUniversalTime();
        }

        return DateTimeOffset.UtcNow;
    }

    public static string FormatLegacyDateTime(DateTimeOffset value) =>
        TimeZoneInfo.ConvertTime(value, VietnamTz).ToString("yyyy-MM-dd HH:mm");

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
