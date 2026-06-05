using Lucrato.Domain;

namespace Lucrato.Application;

/// <summary>
/// Default settings and empty-database factory. Mirrors defaultSettings()/createEmpty() in
/// src/app/core/services/data.service.ts so a freshly created account matches the old behaviour.
/// </summary>
public static class DatabaseDefaults
{
    public const string AppVersion = "1.0.0";

    public static Settings DefaultSettings() => new()
    {
        DefaultMlFee = 0.12,
        YellowAlertDays = 25,
        RedAlertDays = 30,
        MinimumMargin = 0.10,
        LowStockAlert = 1,
        DefaultShipping = 0,
        DefaultChannel = SaleChannel.MercadoLivre,
        Categories = new() { "Eletrônicos", "Outros" },
        Suppliers = new() { "Amazon BR", "Outro" },
        Channels = new() { SaleChannel.MercadoLivre, SaleChannel.Outro },
    };

    public static Database CreateEmpty() => new()
    {
        Purchases = new(),
        Sales = new(),
        Settings = DefaultSettings(),
        Metadata = new DatabaseMetadata { Versao = AppVersion, UltimaAtualizacao = DateTimeOffset.UtcNow.ToString("o") },
    };
}
