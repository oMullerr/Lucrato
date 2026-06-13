/**
 * Builders de domínio para testes — defaults mínimos e realistas.
 * Specs antigos têm builders locais próprios; specs novos importam daqui.
 */
import type { Purchase, Sale } from '../app/core/models/models';

export function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'C001',
    product: 'Produto',
    category: 'Eletrônicos',
    supplier: 'Fornecedor',
    purchaseDate: '2026-01-01',
    receiptDate: '2026-01-05',
    quantityPurchased: 10,
    unitCost: 100,
    purchaseShipping: 0,
    otherCosts: 0,
    ...overrides,
  };
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'V001',
    batchId: 'C001',
    product: 'Produto',
    quantitySold: 1,
    unitPrice: 200,
    saleDate: '2026-02-01',
    channel: 'Mercado Livre',
    feePercentage: 0.1,
    shippingType: 'correios',
    sellerShipping: 10,
    discount: 0,
    otherCosts: 0,
    status: 'Concluída',
    ...overrides,
  };
}
