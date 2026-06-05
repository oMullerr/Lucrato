using Lucrato.Domain;

namespace Lucrato.Application;

/// <summary>The full payload returned to the frontend: raw data + derived fields + KPIs.</summary>
public sealed class ComputedDatabase
{
    public required IReadOnlyList<Purchase> Purchases { get; init; }
    public required IReadOnlyList<Sale> Sales { get; init; }
    public required Settings Settings { get; init; }
    public required DatabaseMetadata Metadata { get; init; }
    public required IReadOnlyList<ComputedPurchase> ComputedPurchases { get; init; }
    public required IReadOnlyList<ComputedSale> ComputedSales { get; init; }
    public required KpiSummary Kpis { get; init; }
}

/// <summary>
/// Composes the derived view from a raw <see cref="Database"/>. Mirrors the computed signals in
/// src/app/core/services/data.service.ts (computedPurchases / computedSales / kpis).
/// </summary>
public static class DataComposition
{
    public static ComputedDatabase Compose(Database db, DateTimeOffset? now = null)
    {
        var computedPurchases = db.Purchases
            .Select(p => Calculations.CalculatePurchase(p, db.Sales, db.Settings, now))
            .ToList();
        var computedSales = db.Sales
            .Select(s => Calculations.CalculateSale(s, db.Purchases))
            .ToList();
        var kpis = Calculations.CalculateKpis(computedPurchases, computedSales);

        return new ComputedDatabase
        {
            Purchases = db.Purchases,
            Sales = db.Sales,
            Settings = db.Settings,
            Metadata = db.Metadata,
            ComputedPurchases = computedPurchases,
            ComputedSales = computedSales,
            Kpis = kpis,
        };
    }
}
