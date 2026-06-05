namespace Lucrato.Domain;

// Mirrors src/app/core/models/models.ts. Kept in sync with the Angular frontend.

public static class InventoryStatus
{
    public const string EmEstoque = "Em Estoque";
    public const string Vendido = "Vendido";
    public const string Atencao = "Atenção";
    public const string Parado = "Parado";
    public const string EmTransito = "Em trânsito";
}

public static class SaleStatus
{
    public const string Concluida = "Concluída";
    public const string Cancelada = "Cancelada";
    public const string Devolvida = "Devolvida";
    public const string EmDisputa = "Em disputa";
}

public static class SaleChannel
{
    public const string MercadoLivre = "Mercado Livre";
    public const string Shopee = "Shopee";
    public const string Amazon = "Amazon";
    public const string Instagram = "Instagram";
    public const string WhatsApp = "WhatsApp";
    public const string Outro = "Outro";
}

/// <summary>Purchase batch.</summary>
public sealed class Purchase
{
    public string Id { get; set; } = "";
    public string Product { get; set; } = "";
    public string Category { get; set; } = "";
    public string Supplier { get; set; } = "";
    public string? Link { get; set; }
    public string PurchaseDate { get; set; } = "";
    public string? ReceiptDate { get; set; }
    public double QuantityPurchased { get; set; }
    public double UnitCost { get; set; }
    public double PurchaseShipping { get; set; }
    public double OtherCosts { get; set; }
    public string? Notes { get; set; }
}

/// <summary>Individual sale.</summary>
public sealed class Sale
{
    public string Id { get; set; } = "";
    public string BatchId { get; set; } = "";
    public string Product { get; set; } = "";
    public double QuantitySold { get; set; }
    public double UnitPrice { get; set; }
    public string SaleDate { get; set; } = "";
    public string Channel { get; set; } = SaleChannel.MercadoLivre;
    public double FeePercentage { get; set; }
    public string? ShippingType { get; set; } // "correios" | "flex"
    public double SellerShipping { get; set; }
    public double? FlexRefund { get; set; }
    public double Discount { get; set; }
    public double OtherCosts { get; set; }
    public string Status { get; set; } = SaleStatus.Concluida;
    public string? Notes { get; set; }
}

public sealed class Settings
{
    public double DefaultMlFee { get; set; }
    public double YellowAlertDays { get; set; }
    public double RedAlertDays { get; set; }
    public double MinimumMargin { get; set; }
    public double LowStockAlert { get; set; }
    public double DefaultShipping { get; set; }
    public string DefaultChannel { get; set; } = SaleChannel.MercadoLivre;
    public List<string> Categories { get; set; } = new();
    public List<string> Suppliers { get; set; } = new();
    public List<string> Channels { get; set; } = new();
}

/// <summary>Purchase with derived computed fields.</summary>
public sealed class ComputedPurchase
{
    public required Purchase Purchase { get; init; }
    public double TotalPurchaseCost { get; set; }
    public double TotalActualCost { get; set; }
    public double ActualUnitCost { get; set; }
    public double QuantitySold { get; set; }
    public double CurrentStock { get; set; }
    public double IdleValue { get; set; }
    public string? FirstSale { get; set; }
    public string? LastSale { get; set; }
    public double DaysInStock { get; set; }
    public string Status { get; set; } = InventoryStatus.EmEstoque;
    public double? AverageMargin { get; set; }
}

/// <summary>Sale with derived computed fields.</summary>
public sealed class ComputedSale
{
    public required Sale Sale { get; init; }
    public double GrossRevenue { get; set; }
    public double FeeAmount { get; set; }
    public double NetRevenue { get; set; }
    public double ActualUnitCost { get; set; }
    public double ProportionalCost { get; set; }
    public double GrossProfit { get; set; }
    public double NetProfit { get; set; }
    public double NetMargin { get; set; }
}

/// <summary>Consolidated KPIs.</summary>
public sealed class KpiSummary
{
    public double TotalInvested { get; set; }
    public double IdleCapital { get; set; }
    public double GrossRevenue { get; set; }
    public double NetRevenue { get; set; }
    public double TotalFees { get; set; }
    public double TotalShipping { get; set; }
    public double TotalDiscounts { get; set; }
    public double GrossProfit { get; set; }
    public double NetProfit { get; set; }
    public double NetMargin { get; set; }
    public double TotalSold { get; set; }
    public int TotalBatches { get; set; }
    public int BatchesInStock { get; set; }
    public int SoldBatches { get; set; }
    public double AverageTicket { get; set; }
}

public sealed class DatabaseMetadata
{
    public string Versao { get; set; } = "";
    public string UltimaAtualizacao { get; set; } = "";
}

/// <summary>The per-user database document (users/{uid}/db/main).</summary>
public sealed class Database
{
    public List<Purchase> Purchases { get; set; } = new();
    public List<Sale> Sales { get; set; } = new();
    public Settings Settings { get; set; } = new();
    public DatabaseMetadata Metadata { get; set; } = new();
}
