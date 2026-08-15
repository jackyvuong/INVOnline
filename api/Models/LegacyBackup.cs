namespace Inventory.Api.Models;

public class LegacyBackup
{
    public string? Version { get; set; }
    public string? ExportedAt { get; set; }
    public List<LegacyCategoryDto> Categories { get; set; } = [];
    public List<LegacyProductDto> Products { get; set; } = [];
    public List<LegacyTransactionDto> Transactions { get; set; } = [];
    public List<LegacyExportSlipDto> ExportSlips { get; set; } = [];
    public List<LegacyImportSlipDto> ImportSlips { get; set; } = [];
}

public class LegacyCategoryDto
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
}

public class LegacyProductDto
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string Unit { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Description { get; set; } = "";
    public string Note { get; set; } = "";
    public int WarningStock { get; set; }
    public decimal Stock { get; set; }
    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
}

public class LegacyTransactionDto
{
    public int Id { get; set; }
    public string Date { get; set; } = "";
    public int ProductId { get; set; }
    public string Type { get; set; } = "";
    public decimal Quantity { get; set; }
    public string Note { get; set; } = "";
}

public class LegacyExportSlipDto
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Date { get; set; } = "";
    public string Recipient { get; set; } = "";
    public string Note { get; set; } = "";
    public string Status { get; set; } = "PROCESSING";
    public object? Items { get; set; }
    public object? OutTransactionIds { get; set; }
    public object? ReturnTransactionIds { get; set; }
    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
}

public class LegacyImportSlipDto
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Date { get; set; } = "";
    public string Supplier { get; set; } = "";
    public string Note { get; set; } = "";
    public string Status { get; set; } = "PROCESSING";
    public object? Items { get; set; }
    public object? InTransactionIds { get; set; }
    public object? ReturnTransactionIds { get; set; }
    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
}

public class ImportSummary
{
    public int Categories { get; set; }
    public int Products { get; set; }
    public int Transactions { get; set; }
    public int ExportSlips { get; set; }
    public int ImportSlips { get; set; }
    public int SkippedTransactions { get; set; }
    public string? SourceVersion { get; set; }
    public string? ExportedAt { get; set; }
}

public class RepairSummary
{
    public int ExportSlipsUpdated { get; set; }
    public int ImportSlipsUpdated { get; set; }
    public int TransactionsUpdated { get; set; }
    public int SkippedSlips { get; set; }
    public int SkippedTransactions { get; set; }
}
