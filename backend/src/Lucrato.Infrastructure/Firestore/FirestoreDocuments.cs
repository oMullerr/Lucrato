using Google.Cloud.Firestore;
using Lucrato.Domain;

namespace Lucrato.Infrastructure.Firestore;

// Firestore DTOs. Field names match the camelCase shape written by the Angular frontend
// (src/app/core/services/data.service.ts) so existing documents deserialize unchanged.

[FirestoreData]
public sealed class PurchaseDoc
{
    [FirestoreProperty("id")] public string Id { get; set; } = "";
    [FirestoreProperty("product")] public string Product { get; set; } = "";
    [FirestoreProperty("category")] public string Category { get; set; } = "";
    [FirestoreProperty("supplier")] public string Supplier { get; set; } = "";
    [FirestoreProperty("link")] public string? Link { get; set; }
    [FirestoreProperty("purchaseDate")] public string PurchaseDate { get; set; } = "";
    [FirestoreProperty("receiptDate")] public string? ReceiptDate { get; set; }
    [FirestoreProperty("quantityPurchased")] public double QuantityPurchased { get; set; }
    [FirestoreProperty("unitCost")] public double UnitCost { get; set; }
    [FirestoreProperty("purchaseShipping")] public double PurchaseShipping { get; set; }
    [FirestoreProperty("otherCosts")] public double OtherCosts { get; set; }
    [FirestoreProperty("notes")] public string? Notes { get; set; }

    public static PurchaseDoc From(Purchase p) => new()
    {
        Id = p.Id, Product = p.Product, Category = p.Category, Supplier = p.Supplier, Link = p.Link,
        PurchaseDate = p.PurchaseDate, ReceiptDate = p.ReceiptDate, QuantityPurchased = p.QuantityPurchased,
        UnitCost = p.UnitCost, PurchaseShipping = p.PurchaseShipping, OtherCosts = p.OtherCosts, Notes = p.Notes,
    };

    public Purchase ToDomain() => new()
    {
        Id = Id, Product = Product, Category = Category, Supplier = Supplier, Link = Link,
        PurchaseDate = PurchaseDate, ReceiptDate = ReceiptDate, QuantityPurchased = QuantityPurchased,
        UnitCost = UnitCost, PurchaseShipping = PurchaseShipping, OtherCosts = OtherCosts, Notes = Notes,
    };
}

[FirestoreData]
public sealed class SaleDoc
{
    [FirestoreProperty("id")] public string Id { get; set; } = "";
    [FirestoreProperty("batchId")] public string BatchId { get; set; } = "";
    [FirestoreProperty("product")] public string Product { get; set; } = "";
    [FirestoreProperty("quantitySold")] public double QuantitySold { get; set; }
    [FirestoreProperty("unitPrice")] public double UnitPrice { get; set; }
    [FirestoreProperty("saleDate")] public string SaleDate { get; set; } = "";
    [FirestoreProperty("channel")] public string Channel { get; set; } = SaleChannel.MercadoLivre;
    [FirestoreProperty("feePercentage")] public double FeePercentage { get; set; }
    [FirestoreProperty("shippingType")] public string? ShippingType { get; set; }
    [FirestoreProperty("sellerShipping")] public double SellerShipping { get; set; }
    [FirestoreProperty("flexRefund")] public double? FlexRefund { get; set; }
    [FirestoreProperty("discount")] public double Discount { get; set; }
    [FirestoreProperty("otherCosts")] public double OtherCosts { get; set; }
    [FirestoreProperty("status")] public string Status { get; set; } = SaleStatus.Concluida;
    [FirestoreProperty("notes")] public string? Notes { get; set; }

    public static SaleDoc From(Sale s) => new()
    {
        Id = s.Id, BatchId = s.BatchId, Product = s.Product, QuantitySold = s.QuantitySold, UnitPrice = s.UnitPrice,
        SaleDate = s.SaleDate, Channel = s.Channel, FeePercentage = s.FeePercentage, ShippingType = s.ShippingType,
        SellerShipping = s.SellerShipping, FlexRefund = s.FlexRefund, Discount = s.Discount, OtherCosts = s.OtherCosts,
        Status = s.Status, Notes = s.Notes,
    };

    public Sale ToDomain() => new()
    {
        Id = Id, BatchId = BatchId, Product = Product, QuantitySold = QuantitySold, UnitPrice = UnitPrice,
        SaleDate = SaleDate, Channel = Channel, FeePercentage = FeePercentage, ShippingType = ShippingType,
        SellerShipping = SellerShipping, FlexRefund = FlexRefund, Discount = Discount, OtherCosts = OtherCosts,
        Status = Status, Notes = Notes,
    };
}

[FirestoreData]
public sealed class SettingsDoc
{
    [FirestoreProperty("defaultMlFee")] public double DefaultMlFee { get; set; }
    [FirestoreProperty("yellowAlertDays")] public double YellowAlertDays { get; set; }
    [FirestoreProperty("redAlertDays")] public double RedAlertDays { get; set; }
    [FirestoreProperty("minimumMargin")] public double MinimumMargin { get; set; }
    [FirestoreProperty("lowStockAlert")] public double LowStockAlert { get; set; }
    [FirestoreProperty("defaultShipping")] public double DefaultShipping { get; set; }
    [FirestoreProperty("defaultChannel")] public string DefaultChannel { get; set; } = SaleChannel.MercadoLivre;
    [FirestoreProperty("categories")] public List<string> Categories { get; set; } = new();
    [FirestoreProperty("suppliers")] public List<string> Suppliers { get; set; } = new();
    [FirestoreProperty("channels")] public List<string> Channels { get; set; } = new();

    public static SettingsDoc From(Settings s) => new()
    {
        DefaultMlFee = s.DefaultMlFee, YellowAlertDays = s.YellowAlertDays, RedAlertDays = s.RedAlertDays,
        MinimumMargin = s.MinimumMargin, LowStockAlert = s.LowStockAlert, DefaultShipping = s.DefaultShipping,
        DefaultChannel = s.DefaultChannel, Categories = s.Categories, Suppliers = s.Suppliers, Channels = s.Channels,
    };

    public Settings ToDomain() => new()
    {
        DefaultMlFee = DefaultMlFee, YellowAlertDays = YellowAlertDays, RedAlertDays = RedAlertDays,
        MinimumMargin = MinimumMargin, LowStockAlert = LowStockAlert, DefaultShipping = DefaultShipping,
        DefaultChannel = DefaultChannel, Categories = Categories, Suppliers = Suppliers, Channels = Channels,
    };
}

[FirestoreData]
public sealed class MetadataDoc
{
    [FirestoreProperty("versao")] public string Versao { get; set; } = "";
    [FirestoreProperty("ultimaAtualizacao")] public string UltimaAtualizacao { get; set; } = "";

    public static MetadataDoc From(DatabaseMetadata m) => new() { Versao = m.Versao, UltimaAtualizacao = m.UltimaAtualizacao };
    public DatabaseMetadata ToDomain() => new() { Versao = Versao, UltimaAtualizacao = UltimaAtualizacao };
}

[FirestoreData]
public sealed class DatabaseDoc
{
    [FirestoreProperty("purchases")] public List<PurchaseDoc> Purchases { get; set; } = new();
    [FirestoreProperty("sales")] public List<SaleDoc> Sales { get; set; } = new();
    [FirestoreProperty("settings")] public SettingsDoc? Settings { get; set; }
    [FirestoreProperty("metadata")] public MetadataDoc? Metadata { get; set; }

    public static DatabaseDoc From(Database db) => new()
    {
        Purchases = db.Purchases.Select(PurchaseDoc.From).ToList(),
        Sales = db.Sales.Select(SaleDoc.From).ToList(),
        Settings = SettingsDoc.From(db.Settings),
        Metadata = MetadataDoc.From(db.Metadata),
    };

    public Database ToDomain() => new()
    {
        Purchases = Purchases.Select(p => p.ToDomain()).ToList(),
        Sales = Sales.Select(s => s.ToDomain()).ToList(),
        Settings = Settings?.ToDomain() ?? new Settings(),
        Metadata = Metadata?.ToDomain() ?? new DatabaseMetadata(),
    };
}
