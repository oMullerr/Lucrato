using Lucrato.Application;
using Lucrato.Domain;
using Xunit;

namespace Lucrato.Tests;

// Parity port of src/app/core/services/calculations.spec.ts.
public class CalculationsTests
{
    // Fixed "now" matching jest.setSystemTime(new Date('2026-03-01T00:00:00Z')).
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-03-01T00:00:00Z");

    private static Purchase MakePurchase(Action<Purchase>? o = null)
    {
        var p = new Purchase
        {
            Id = "C001",
            Product = "Produto A",
            Category = "Eletrônicos",
            Supplier = "Fornecedor X",
            PurchaseDate = "2026-01-01",
            ReceiptDate = "2026-01-05",
            QuantityPurchased = 10,
            UnitCost = 100,
            PurchaseShipping = 50,
            OtherCosts = 0,
        };
        o?.Invoke(p);
        return p;
    }

    private static Sale MakeSale(Action<Sale>? o = null)
    {
        var s = new Sale
        {
            Id = "V001",
            BatchId = "C001",
            Product = "Produto A",
            QuantitySold = 1,
            UnitPrice = 200,
            SaleDate = "2026-02-01",
            Channel = SaleChannel.MercadoLivre,
            FeePercentage = 0.1,
            ShippingType = "correios",
            SellerShipping = 20,
            Discount = 0,
            OtherCosts = 0,
            Status = SaleStatus.Concluida,
        };
        o?.Invoke(s);
        return s;
    }

    private static Settings MakeSettings(Action<Settings>? o = null)
    {
        var s = new Settings
        {
            DefaultMlFee = 0.13,
            YellowAlertDays = 30,
            RedAlertDays = 60,
            MinimumMargin = 0.1,
            LowStockAlert = 2,
            DefaultShipping = 0,
            DefaultChannel = SaleChannel.MercadoLivre,
        };
        o?.Invoke(s);
        return s;
    }

    // --- calculatePurchase ---

    [Fact]
    public void CalculatePurchase_GrossActualAndUnitCost()
    {
        var purchase = MakePurchase(p => { p.QuantityPurchased = 10; p.UnitCost = 100; p.PurchaseShipping = 50; p.OtherCosts = 30; });
        var r = Calculations.CalculatePurchase(purchase, [], MakeSettings(), Now);

        Assert.Equal(1000, r.TotalPurchaseCost);
        Assert.Equal(1080, r.TotalActualCost);
        Assert.Equal(108, r.ActualUnitCost);
    }

    [Fact]
    public void CalculatePurchase_ZeroQuantityGuardsDivision()
    {
        var r = Calculations.CalculatePurchase(MakePurchase(p => p.QuantityPurchased = 0), [], MakeSettings(), Now);
        Assert.Equal(0, r.ActualUnitCost);
        Assert.Equal(0, r.TotalPurchaseCost);
    }

    [Fact]
    public void CalculatePurchase_OnlyCompletedSalesCountTowardQuantitySold()
    {
        var purchase = MakePurchase(p => p.QuantityPurchased = 10);
        var sales = new List<Sale>
        {
            MakeSale(s => { s.Id = "V001"; s.QuantitySold = 3; s.Status = SaleStatus.Concluida; }),
            MakeSale(s => { s.Id = "V002"; s.QuantitySold = 5; s.Status = SaleStatus.Cancelada; }),
            MakeSale(s => { s.Id = "V003"; s.QuantitySold = 2; s.Status = SaleStatus.Devolvida; }),
        };
        var r = Calculations.CalculatePurchase(purchase, sales, MakeSettings(), Now);
        Assert.Equal(3, r.QuantitySold);
        Assert.Equal(7, r.CurrentStock);
    }

    [Fact]
    public void CalculatePurchase_StatusVendidoWhenStockZero()
    {
        var purchase = MakePurchase(p => p.QuantityPurchased = 5);
        var sales = new List<Sale> { MakeSale(s => { s.QuantitySold = 5; s.SaleDate = "2026-02-10"; }) };
        var r = Calculations.CalculatePurchase(purchase, sales, MakeSettings(), Now);
        Assert.Equal(0, r.CurrentStock);
        Assert.Equal(InventoryStatus.Vendido, r.Status);
    }

    [Fact]
    public void CalculatePurchase_EmTransitoWhenNoReceiptDate()
    {
        var purchase = MakePurchase(p => { p.ReceiptDate = null; p.QuantityPurchased = 10; });
        var r = Calculations.CalculatePurchase(purchase, [], MakeSettings(), Now);
        Assert.Equal(InventoryStatus.EmTransito, r.Status);
    }

    [Fact]
    public void CalculatePurchase_TransitionFromTransitoToEmEstoque()
    {
        var settings = MakeSettings(s => { s.YellowAlertDays = 30; s.RedAlertDays = 60; });

        var emTransito = Calculations.CalculatePurchase(MakePurchase(p => p.ReceiptDate = null), [], settings, Now);
        Assert.Equal(InventoryStatus.EmTransito, emTransito.Status);

        var recebido = Calculations.CalculatePurchase(MakePurchase(p => p.ReceiptDate = "2026-03-01"), [], settings, Now);
        Assert.Equal(InventoryStatus.EmEstoque, recebido.Status);
        Assert.Equal(0, recebido.DaysInStock);
    }

    [Fact]
    public void CalculatePurchase_ParadoWhenDaysGteRed()
    {
        var purchase = MakePurchase(p => p.ReceiptDate = "2026-01-05");
        var settings = MakeSettings(s => { s.YellowAlertDays = 30; s.RedAlertDays = 50; });
        var r = Calculations.CalculatePurchase(purchase, [], settings, Now);
        Assert.True(r.DaysInStock >= 50);
        Assert.Equal(InventoryStatus.Parado, r.Status);
    }

    [Fact]
    public void CalculatePurchase_AtencaoBetweenYellowAndRed()
    {
        var purchase = MakePurchase(p => p.ReceiptDate = "2026-01-05");
        var settings = MakeSettings(s => { s.YellowAlertDays = 30; s.RedAlertDays = 100; });
        var r = Calculations.CalculatePurchase(purchase, [], settings, Now);
        Assert.True(r.DaysInStock >= 30 && r.DaysInStock < 100);
        Assert.Equal(InventoryStatus.Atencao, r.Status);
    }

    [Fact]
    public void CalculatePurchase_EmEstoqueWhenBelowYellow()
    {
        var purchase = MakePurchase(p => p.ReceiptDate = "2026-02-25");
        var settings = MakeSettings(s => { s.YellowAlertDays = 30; s.RedAlertDays = 60; });
        var r = Calculations.CalculatePurchase(purchase, [], settings, Now);
        Assert.True(r.DaysInStock < 30);
        Assert.Equal(InventoryStatus.EmEstoque, r.Status);
    }

    [Fact]
    public void CalculatePurchase_FirstAndLastSaleSorted()
    {
        var purchase = MakePurchase(p => p.QuantityPurchased = 10);
        var sales = new List<Sale>
        {
            MakeSale(s => { s.Id = "V001"; s.SaleDate = "2026-02-15"; }),
            MakeSale(s => { s.Id = "V002"; s.SaleDate = "2026-02-01"; }),
            MakeSale(s => { s.Id = "V003"; s.SaleDate = "2026-02-20"; }),
        };
        var r = Calculations.CalculatePurchase(purchase, sales, MakeSettings(), Now);
        Assert.Equal("2026-02-01", r.FirstSale);
        Assert.Equal("2026-02-20", r.LastSale);
    }

    [Fact]
    public void CalculatePurchase_AverageMarginNullWhenNoRevenue()
    {
        var r = Calculations.CalculatePurchase(MakePurchase(), [], MakeSettings(), Now);
        Assert.Null(r.AverageMargin);
    }

    [Fact]
    public void CalculatePurchase_FallbackToPurchaseDateForStart()
    {
        var purchase = MakePurchase(p => { p.PurchaseDate = "2026-01-01"; p.ReceiptDate = null; p.QuantityPurchased = 10; });
        var sales = new List<Sale> { MakeSale(s => { s.QuantitySold = 10; s.SaleDate = "2026-02-10"; }) };
        var r = Calculations.CalculatePurchase(purchase, sales, MakeSettings(), Now);
        Assert.Equal(40, r.DaysInStock);
    }

    [Fact]
    public void CalculatePurchase_UsesLastSaleAsEndRefWhenSoldOut()
    {
        var purchase = MakePurchase(p => { p.ReceiptDate = "2026-01-05"; p.QuantityPurchased = 5; });
        var sales = new List<Sale> { MakeSale(s => { s.QuantitySold = 5; s.SaleDate = "2026-01-15"; }) };
        var r = Calculations.CalculatePurchase(purchase, sales, MakeSettings(), Now);
        Assert.Equal(0, r.CurrentStock);
        Assert.Equal(10, r.DaysInStock);
    }

    [Fact]
    public void CalculatePurchase_IdleValue()
    {
        var purchase = MakePurchase(p => { p.QuantityPurchased = 10; p.UnitCost = 100; p.PurchaseShipping = 0; p.OtherCosts = 0; });
        var sales = new List<Sale> { MakeSale(s => s.QuantitySold = 4) };
        var r = Calculations.CalculatePurchase(purchase, sales, MakeSettings(), Now);
        Assert.Equal(600, r.IdleValue);
    }

    // --- calculateSale ---

    [Fact]
    public void CalculateSale_ZeroCostWhenBatchMissing()
    {
        var r = Calculations.CalculateSale(MakeSale(s => s.BatchId = "C999"), []);
        Assert.Equal(0, r.ActualUnitCost);
        Assert.Equal(0, r.ProportionalCost);
    }

    [Fact]
    public void CalculateSale_ActualUnitCostFromBatch()
    {
        var purchase = MakePurchase(p => { p.Id = "C001"; p.QuantityPurchased = 10; p.UnitCost = 100; p.PurchaseShipping = 50; p.OtherCosts = 0; });
        var sale = MakeSale(s => { s.BatchId = "C001"; s.QuantitySold = 2; s.UnitPrice = 200; });
        var r = Calculations.CalculateSale(sale, [purchase]);
        Assert.Equal(105, r.ActualUnitCost);
        Assert.Equal(210, r.ProportionalCost);
    }

    [Fact]
    public void CalculateSale_FlexRefundPositive()
    {
        var sale = MakeSale(s => { s.ShippingType = "flex"; s.FlexRefund = 15; s.SellerShipping = 99; s.QuantitySold = 1; s.UnitPrice = 100; s.FeePercentage = 0; s.Discount = 0; s.OtherCosts = 0; });
        var r = Calculations.CalculateSale(sale, []);
        Assert.Equal(115, r.NetRevenue);
    }

    [Fact]
    public void CalculateSale_FlexRefundDefaultsToZero()
    {
        var sale = MakeSale(s => { s.ShippingType = "flex"; s.FlexRefund = null; s.SellerShipping = 99; s.QuantitySold = 1; s.UnitPrice = 100; s.FeePercentage = 0; s.Discount = 0; s.OtherCosts = 0; });
        var r = Calculations.CalculateSale(sale, []);
        Assert.Equal(100, r.NetRevenue);
    }

    [Fact]
    public void CalculateSale_SubtractsSellerShippingWhenNotFlex()
    {
        var sale = MakeSale(s => { s.ShippingType = "correios"; s.SellerShipping = 20; s.QuantitySold = 1; s.UnitPrice = 100; s.FeePercentage = 0; s.Discount = 0; s.OtherCosts = 0; });
        var r = Calculations.CalculateSale(sale, []);
        Assert.Equal(80, r.NetRevenue);
    }

    [Fact]
    public void CalculateSale_FeeAmountProportional()
    {
        var sale = MakeSale(s => { s.QuantitySold = 2; s.UnitPrice = 100; s.FeePercentage = 0.15; });
        var r = Calculations.CalculateSale(sale, []);
        Assert.Equal(200, r.GrossRevenue);
        Assert.Equal(30, r.FeeAmount, 10);
    }

    [Fact]
    public void CalculateSale_NetMarginZeroWhenNoRevenue()
    {
        var r = Calculations.CalculateSale(MakeSale(s => { s.QuantitySold = 0; s.UnitPrice = 0; }), []);
        Assert.Equal(0, r.GrossRevenue);
        Assert.Equal(0, r.NetMargin);
    }

    [Fact]
    public void CalculateSale_RealisticScenario()
    {
        var purchase = MakePurchase(p => { p.Id = "C001"; p.QuantityPurchased = 10; p.UnitCost = 50; p.PurchaseShipping = 0; p.OtherCosts = 0; });
        var sale = MakeSale(s => { s.BatchId = "C001"; s.QuantitySold = 1; s.UnitPrice = 100; s.FeePercentage = 0.1; s.ShippingType = "correios"; s.SellerShipping = 10; s.Discount = 0; s.OtherCosts = 0; });
        var r = Calculations.CalculateSale(sale, [purchase]);
        Assert.Equal(50, r.GrossProfit);
        Assert.Equal(30, r.NetProfit);
        Assert.Equal(0.3, r.NetMargin, 10);
    }

    // --- calculateKpis ---

    private static ComputedSale MakeComputedSale(double grossRevenue, double netProfit, string status, double quantitySold = 1)
    {
        var sale = MakeSale(s => { s.Status = status; s.QuantitySold = quantitySold; });
        return new ComputedSale { Sale = sale, GrossRevenue = grossRevenue, NetProfit = netProfit };
    }

    [Fact]
    public void CalculateKpis_OnlyCompletedSales()
    {
        var sales = new List<ComputedSale>
        {
            MakeComputedSale(100, 30, SaleStatus.Concluida, quantitySold: 1),
            MakeComputedSale(999, 999, SaleStatus.Cancelada, quantitySold: 1),
        };
        var r = Calculations.CalculateKpis([], sales);
        Assert.Equal(100, r.GrossRevenue);
        Assert.Equal(30, r.NetProfit);
        Assert.Equal(1, r.TotalSold);
    }

    [Fact]
    public void CalculateKpis_AverageTicketZeroWhenNoSales()
    {
        var r = Calculations.CalculateKpis([], []);
        Assert.Equal(0, r.AverageTicket);
    }

    [Fact]
    public void CalculateKpis_NetMarginZeroWhenNoRevenue()
    {
        var sales = new List<ComputedSale> { MakeComputedSale(0, 0, SaleStatus.Concluida) };
        var r = Calculations.CalculateKpis([], sales);
        Assert.Equal(0, r.NetMargin);
    }

    [Fact]
    public void CalculateKpis_BatchCounts()
    {
        var purchases = new List<ComputedPurchase>
        {
            new() { Purchase = MakePurchase(p => p.Id = "C001"), CurrentStock = 5 },
            new() { Purchase = MakePurchase(p => p.Id = "C002"), CurrentStock = 0 },
            new() { Purchase = MakePurchase(p => p.Id = "C003"), CurrentStock = -1 },
        };
        var r = Calculations.CalculateKpis(purchases, []);
        Assert.Equal(3, r.TotalBatches);
        Assert.Equal(1, r.BatchesInStock);
        Assert.Equal(2, r.SoldBatches);
    }

    [Fact]
    public void CalculateKpis_SumsInvestedIdleAndAverageTicket()
    {
        var purchases = new List<ComputedPurchase>
        {
            new() { Purchase = MakePurchase(), TotalActualCost = 100, IdleValue = 50 },
            new() { Purchase = MakePurchase(), TotalActualCost = 200, IdleValue = 100 },
        };
        var sales = new List<ComputedSale>
        {
            MakeComputedSale(100, 0, SaleStatus.Concluida),
            MakeComputedSale(300, 0, SaleStatus.Concluida),
        };
        var r = Calculations.CalculateKpis(purchases, sales);
        Assert.Equal(300, r.TotalInvested);
        Assert.Equal(150, r.IdleCapital);
        Assert.Equal(200, r.AverageTicket);
    }

    // --- nextId ---

    [Fact]
    public void NextId_EmptyListReturnsFirst() => Assert.Equal("C001", Calculations.NextId([], "C"));

    [Fact]
    public void NextId_NextAfterMax() => Assert.Equal("C011", Calculations.NextId(["C001", "C002", "C010"], "C"));

    [Fact]
    public void NextId_IgnoresOtherPrefixes() => Assert.Equal("C004", Calculations.NextId(["V001", "V050", "C003"], "C"));

    [Fact]
    public void NextId_CustomPadding()
    {
        Assert.Equal("C00001", Calculations.NextId([], "C", 5));
        Assert.Equal("C00043", Calculations.NextId(["C00042"], "C", 5));
    }

    [Fact]
    public void NextId_IgnoresMalformed() => Assert.Equal("C003", Calculations.NextId(["C001", "CXX", "C-bad", "C002"], "C"));

    [Fact]
    public void NextId_WorksWithAnyPrefix() => Assert.Equal("V100", Calculations.NextId(["V099"], "V"));
}
