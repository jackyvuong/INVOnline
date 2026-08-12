namespace Inventory.Api.Models;

public class Category
{
    public long Id { get; set; }
    public int LegacyId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string CreatedByEmail { get; set; } = "";
    public string UpdatedByEmail { get; set; } = "";
}

public class Product
{
    public long Id { get; set; }
    public int LegacyId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string CategoryName { get; set; } = "";
    public string Unit { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Description { get; set; } = "";
    public string Note { get; set; } = "";
    public int WarningStock { get; set; }
    public decimal Stock { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string CreatedByEmail { get; set; } = "";
    public string UpdatedByEmail { get; set; } = "";
}

public class TransactionRow
{
    public long Id { get; set; }
    public int LegacyId { get; set; }
    public DateTimeOffset MovementAt { get; set; }
    public long ProductId { get; set; }
    public string Type { get; set; } = "";
    public decimal Quantity { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string CreatedByEmail { get; set; } = "";
}

public class SlipItem
{
    public long ProductId { get; set; }
    public decimal Quantity { get; set; }
    public string Note { get; set; } = "";
}

public class ExportSlip
{
    public long Id { get; set; }
    public int LegacyId { get; set; }
    public string Code { get; set; } = "";
    public DateTimeOffset SlipDate { get; set; }
    public string Recipient { get; set; } = "";
    public string Note { get; set; } = "";
    public string Status { get; set; } = "PROCESSING";
    public List<SlipItem> Items { get; set; } = [];
    public List<int> OutTransactionIds { get; set; } = [];
    public List<int> ReturnTransactionIds { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string CreatedByEmail { get; set; } = "";
    public string UpdatedByEmail { get; set; } = "";
}

public class ImportSlip
{
    public long Id { get; set; }
    public int LegacyId { get; set; }
    public string Code { get; set; } = "";
    public DateTimeOffset SlipDate { get; set; }
    public string Supplier { get; set; } = "";
    public string Note { get; set; } = "";
    public string Status { get; set; } = "PROCESSING";
    public List<SlipItem> Items { get; set; } = [];
    public List<int> InTransactionIds { get; set; } = [];
    public List<int> ReturnTransactionIds { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string CreatedByEmail { get; set; } = "";
    public string UpdatedByEmail { get; set; } = "";
}

public class User
{
    public long Id { get; set; }
    public string GoogleSub { get; set; } = "";
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string AvatarUrl { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastLoginAt { get; set; }
}

public static class StockStatus
{
    public const string Ok = "OK";
    public const string Low = "LOW";
    public const string Out = "OUT";

    public static string FromProduct(decimal stock, int warningStock)
    {
        if (stock <= 0) return Out;
        if (stock <= warningStock) return Low;
        return Ok;
    }
}
