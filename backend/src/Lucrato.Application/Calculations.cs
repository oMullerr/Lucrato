using System.Globalization;
using Lucrato.Domain;

namespace Lucrato.Application;

/// <summary>
/// Pure business logic ported from src/app/core/services/calculations.ts.
/// Keep behaviour identical to the TypeScript version (see Lucrato.Tests for parity).
/// </summary>
public static class Calculations
{
    private const double MsPerDay = 1000d * 60 * 60 * 24;

    /// <summary>Calculates derived fields for a purchase batch.</summary>
    public static ComputedPurchase CalculatePurchase(
        Purchase purchase, IReadOnlyList<Sale> sales, Settings config, DateTimeOffset? now = null)
    {
        var totalPurchaseCost = purchase.QuantityPurchased * purchase.UnitCost;
        var totalActualCost = totalPurchaseCost + purchase.PurchaseShipping + purchase.OtherCosts;
        var actualUnitCost = purchase.QuantityPurchased > 0 ? totalActualCost / purchase.QuantityPurchased : 0;

        var batchSales = sales
            .Where(v => v.BatchId == purchase.Id && v.Status == SaleStatus.Concluida)
            .ToList();
        var quantitySold = batchSales.Sum(v => v.QuantitySold);
        var currentStock = purchase.QuantityPurchased - quantitySold;
        var idleValue = currentStock > 0 ? currentStock * actualUnitCost : 0;

        var dates = batchSales.Select(v => v.SaleDate).OrderBy(s => s, StringComparer.Ordinal).ToList();
        var firstSale = dates.Count > 0 ? dates[0] : null;
        var lastSale = dates.Count > 0 ? dates[^1] : null;

        var startDate = ParseDate(!string.IsNullOrEmpty(purchase.ReceiptDate) ? purchase.ReceiptDate! : purchase.PurchaseDate);
        var endRef = (currentStock <= 0 && lastSale != null) ? ParseDate(lastSale) : (now ?? DateTimeOffset.UtcNow);
        var daysInStock = Math.Floor((endRef - startDate).TotalMilliseconds / MsPerDay);

        string status;
        if (currentStock <= 0) status = InventoryStatus.Vendido;
        else if (string.IsNullOrEmpty(purchase.ReceiptDate)) status = InventoryStatus.EmTransito;
        else if (daysInStock >= config.RedAlertDays) status = InventoryStatus.Parado;
        else if (daysInStock >= config.YellowAlertDays) status = InventoryStatus.Atencao;
        else status = InventoryStatus.EmEstoque;

        var totalRevenue = batchSales.Sum(v => v.QuantitySold * v.UnitPrice);
        var totalProfit = batchSales.Sum(v =>
        {
            var grossRev = v.QuantitySold * v.UnitPrice;
            var netRev = grossRev - grossRev * v.FeePercentage - v.SellerShipping - v.Discount - v.OtherCosts;
            return netRev - v.QuantitySold * actualUnitCost;
        });
        double? averageMargin = totalRevenue > 0 ? totalProfit / totalRevenue : null;

        return new ComputedPurchase
        {
            Purchase = purchase,
            TotalPurchaseCost = totalPurchaseCost,
            TotalActualCost = totalActualCost,
            ActualUnitCost = actualUnitCost,
            QuantitySold = quantitySold,
            CurrentStock = currentStock,
            IdleValue = idleValue,
            FirstSale = firstSale,
            LastSale = lastSale,
            DaysInStock = daysInStock,
            Status = status,
            AverageMargin = averageMargin,
        };
    }

    /// <summary>Calculates derived fields for a sale.</summary>
    public static ComputedSale CalculateSale(Sale sale, IReadOnlyList<Purchase> purchases)
    {
        var batch = purchases.FirstOrDefault(c => c.Id == sale.BatchId);
        var actualUnitCost = batch != null
            ? (batch.QuantityPurchased * batch.UnitCost + batch.PurchaseShipping + batch.OtherCosts)
                / Math.Max(batch.QuantityPurchased, 1)
            : 0;

        var grossRevenue = sale.QuantitySold * sale.UnitPrice;
        var feeAmount = grossRevenue * sale.FeePercentage;
        var shippingImpact = sale.ShippingType == "flex"
            ? (sale.FlexRefund ?? 0)
            : -sale.SellerShipping;
        var netRevenue = grossRevenue - feeAmount + shippingImpact - sale.Discount - sale.OtherCosts;
        var proportionalCost = sale.QuantitySold * actualUnitCost;
        var grossProfit = grossRevenue - proportionalCost;
        var netProfit = netRevenue - proportionalCost;
        var netMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

        return new ComputedSale
        {
            Sale = sale,
            GrossRevenue = grossRevenue,
            FeeAmount = feeAmount,
            NetRevenue = netRevenue,
            ActualUnitCost = actualUnitCost,
            ProportionalCost = proportionalCost,
            GrossProfit = grossProfit,
            NetProfit = netProfit,
            NetMargin = netMargin,
        };
    }

    /// <summary>Calculates consolidated KPIs from computed lists.</summary>
    public static KpiSummary CalculateKpis(
        IReadOnlyList<ComputedPurchase> computedPurchases, IReadOnlyList<ComputedSale> computedSales)
    {
        var completed = computedSales.Where(v => v.Sale.Status == SaleStatus.Concluida).ToList();

        var grossRevenue = completed.Sum(v => v.GrossRevenue);
        var netProfit = completed.Sum(v => v.NetProfit);

        return new KpiSummary
        {
            TotalInvested = computedPurchases.Sum(c => c.TotalActualCost),
            IdleCapital = computedPurchases.Sum(c => c.IdleValue),
            GrossRevenue = grossRevenue,
            TotalFees = completed.Sum(v => v.FeeAmount),
            TotalShipping = completed.Sum(v => v.Sale.SellerShipping),
            TotalDiscounts = completed.Sum(v => v.Sale.Discount),
            NetRevenue = completed.Sum(v => v.NetRevenue),
            GrossProfit = completed.Sum(v => v.GrossProfit),
            NetProfit = netProfit,
            NetMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0,
            TotalSold = completed.Sum(v => v.Sale.QuantitySold),
            TotalBatches = computedPurchases.Count,
            BatchesInStock = computedPurchases.Count(c => c.CurrentStock > 0),
            SoldBatches = computedPurchases.Count(c => c.CurrentStock <= 0),
            AverageTicket = completed.Count > 0 ? grossRevenue / completed.Count : 0,
        };
    }

    /// <summary>Generates the next sequential ID for a given prefix (e.g. C, V).</summary>
    public static string NextId(IEnumerable<string> ids, string prefix, int padding = 3)
    {
        var max = 0;
        var re = new System.Text.RegularExpressions.Regex($"^{prefix}(\\d+)$");
        foreach (var id in ids)
        {
            var m = re.Match(id);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var n))
                max = Math.Max(max, n);
        }
        return prefix + (max + 1).ToString().PadLeft(padding, '0');
    }

    private static DateTimeOffset ParseDate(string value) =>
        DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
}
