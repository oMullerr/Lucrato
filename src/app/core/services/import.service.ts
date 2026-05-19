import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { Purchase, Sale, Settings, SaleChannel, SaleStatus } from '../models/models';

export interface ImportResult {
  purchases: Purchase[];
  sales: Sale[];
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class ImportService {

  downloadTemplate(settings: Settings): void {
    const wb = XLSX.utils.book_new();

    // ── Instruções sheet (primeira aba) ────────────────────
    const wsInstrucoes = XLSX.utils.aoa_to_sheet([
      ['MODELO DE IMPORTAÇÃO — LUCRATO'],
      [],
      ['COMO USAR'],
      ['1.', 'Abra a aba "Compras" e preencha seus lotes a partir da linha 3 (a linha 2 é apenas um exemplo e pode ser apagada).'],
      ['2.', 'Abra a aba "Vendas" e preencha suas vendas a partir da linha 3.'],
      ['3.', 'Na aba Vendas, o campo "ID do Lote" deve referenciar um ID já existente no sistema OU uma compra adicionada neste mesmo arquivo.'],
      ['4.', 'Salve o arquivo e importe em Configurações → Importar Planilha.'],
      [],
      ['REGRAS IMPORTANTES'],
      ['Datas', 'Use sempre o formato DD/MM/AAAA (ex: 15/05/2025). Células formatadas como data no Excel também são aceitas.'],
      ['Decimais', 'Use ponto ou vírgula como separador (ex: 25.50 ou 25,50).'],
      ['Exemplo', 'A linha 2 de cada aba é apenas um exemplo. Apague-a antes de importar ou simplesmente deixe — linhas com o texto "EXEMPLO" são ignoradas pelo sistema.'],
      ['Tipo de Envio', 'O tipo de envio da venda é detectado automaticamente: se "Estorno Flex (R$)" for maior que 0, o envio será registrado como Flex; caso contrário, como Correios.'],
      [],
      ['COLUNAS DA ABA COMPRAS'],
      ['Coluna', 'Obrigatório', 'Descrição'],
      ['Produto', 'Sim', 'Nome do produto ou item comprado.'],
      ['Categoria', 'Sim', 'Categoria do produto (ex: Eletrônicos, Roupas).'],
      ['Fornecedor', 'Não', 'Nome do fornecedor ou marketplace onde comprou.'],
      ['Data da Compra (DD/MM/AAAA)', 'Sim', 'Data em que a compra foi realizada.'],
      ['Data de Recebimento (DD/MM/AAAA)', 'Não', 'Data em que o produto foi recebido.'],
      ['Quantidade Comprada', 'Sim', 'Número inteiro, mínimo 1.'],
      ['Custo Unitário (R$)', 'Sim', 'Preço pago por unidade.'],
      ['Frete da Compra (R$)', 'Não', 'Custo do frete pago na compra. Padrão: 0.'],
      ['Outros Custos (R$)', 'Não', 'Outros custos associados à compra (impostos, embalagem etc.). Padrão: 0.'],
      ['Link', 'Não', 'URL do produto no site do fornecedor.'],
      ['Observações', 'Não', 'Anotações livres sobre o lote.'],
      [],
      ['COLUNAS DA ABA VENDAS'],
      ['Coluna', 'Obrigatório', 'Descrição'],
      ['ID do Lote', 'Sim', 'ID do lote de compra vinculado (ex: C001, C002). Deve existir no sistema ou neste arquivo.'],
      ['Data da Venda (DD/MM/AAAA)', 'Sim', 'Data em que a venda foi realizada.'],
      ['Canal', 'Não', `Canal de venda (ex: ${settings.channels.slice(0, 3).join(', ')}). Padrão: ${settings.defaultChannel}.`],
      ['Quantidade Vendida', 'Sim', 'Número inteiro, mínimo 1.'],
      ['Preço Unitário (R$)', 'Sim', 'Valor cobrado por unidade vendida.'],
      ['Taxa (%)', 'Não', `Percentual de taxa do canal (ex: 12 para 12%). Padrão: ${(settings.defaultMlFee * 100).toFixed(1)}%.`],
      ['Frete Vendedor (R$)', 'Não', 'Custo do frete pago pelo vendedor via Correios. Padrão: 0.'],
      ['Estorno Flex (R$)', 'Não', 'Valor do estorno de frete Flex recebido. Se preenchido (> 0), o envio é registrado como Flex. Padrão: 0.'],
      ['Desconto (R$)', 'Não', 'Valor de cupom ou desconto concedido ao comprador. Padrão: 0.'],
      ['Outros Custos (R$)', 'Não', 'Outros custos relacionados à venda. Padrão: 0.'],
      ['Status', 'Não', 'Status da venda: Concluída, Cancelada, Devolvida, Em disputa. Padrão: Concluída.'],
      ['Observações', 'Não', 'Anotações livres sobre a venda.'],
    ]);
    wsInstrucoes['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'Instruções');

    // ── Compras sheet ──────────────────────────────────────
    const purchaseHeaders = [
      'Produto',
      'Categoria',
      'Fornecedor',
      'Data da Compra (DD/MM/AAAA)',
      'Data de Recebimento (DD/MM/AAAA)',
      'Quantidade Comprada',
      'Custo Unitário (R$)',
      'Frete da Compra (R$)',
      'Outros Custos (R$)',
      'Link',
      'Observações',
    ];
    const purchaseExample = [
      'Camiseta Preta',
      settings.categories[0] ?? 'Eletrônicos',
      settings.suppliers[0] ?? 'Amazon BR',
      '15/05/2025',
      '20/05/2025',
      10,
      25.50,
      15.00,
      0,
      'https://exemplo.com/produto',
      'EXEMPLO — apague esta linha antes de importar',
    ];
    const wsCompras = XLSX.utils.aoa_to_sheet([purchaseHeaders, purchaseExample]);
    wsCompras['!cols'] = [
      { wch: 25 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 30 },
      { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 35 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsCompras, 'Compras');

    // ── Vendas sheet ───────────────────────────────────────
    const saleHeaders = [
      'ID do Lote',
      'Data da Venda (DD/MM/AAAA)',
      'Canal',
      'Quantidade Vendida',
      'Preço Unitário (R$)',
      'Taxa (%)',
      'Frete Vendedor (R$)',
      'Estorno Flex (R$)',
      'Desconto (R$)',
      'Outros Custos (R$)',
      'Status',
      'Observações',
    ];
    const saleExample = [
      'C001',
      '20/05/2025',
      settings.defaultChannel,
      2,
      45.00,
      +(settings.defaultMlFee * 100).toFixed(2),
      0,
      0,
      0,
      0,
      'Concluída',
      'EXEMPLO — apague esta linha antes de importar',
    ];
    const wsVendas = XLSX.utils.aoa_to_sheet([saleHeaders, saleExample]);
    wsVendas['!cols'] = [
      { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 20 },
      { wch: 10 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsVendas, 'Vendas');

    XLSX.writeFile(wb, 'modelo-lucrato.xlsx');
  }

  async parseFile(
    file: File,
    currentPurchases: Purchase[],
    currentSales: Sale[],
    settings: Settings,
  ): Promise<ImportResult> {
    const errors: string[] = [];

    let workbook: XLSX.WorkBook;
    try {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
    } catch {
      return { purchases: [], sales: [], errors: ['Arquivo inválido ou corrompido.'] };
    }

    // ── Parse purchases ────────────────────────────────────
    const newPurchases = this.parsePurchases(
      workbook.Sheets['Compras'],
      currentPurchases,
      errors,
    );

    // ── Parse sales ────────────────────────────────────────
    const newSales = this.parseSales(
      workbook.Sheets['Vendas'],
      currentPurchases,
      newPurchases,
      currentSales,
      settings,
      errors,
    );

    return { purchases: newPurchases, sales: newSales, errors };
  }

  // ── Private ────────────────────────────────────────────

  private parsePurchases(
    ws: XLSX.WorkSheet | undefined,
    existing: Purchase[],
    errors: string[],
  ): Purchase[] {
    if (!ws) return [];

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const result: Purchase[] = [];
    let nextNum = this.extractNextNum(existing.map(p => p.id), 'C');

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (this.isEmptyRow(row)) continue;

      const lineNum = i + 1;
      const product   = this.str(row[0]);
      const category  = this.str(row[1]);
      const supplier  = this.str(row[2]);
      const purchaseDateRaw = row[3];
      const receiptDateRaw  = row[4];
      const quantityPurchased = this.num(row[5]);
      const unitCost          = this.num(row[6]);
      const purchaseShipping  = this.num(row[7]);
      const otherCosts        = this.num(row[8]);
      const link  = this.str(row[9])  || undefined;
      const notes = this.str(row[10]) || undefined;

      if (!product)  { errors.push(`Compra linha ${lineNum}: "Produto" é obrigatório.`);               continue; }
      if (!category) { errors.push(`Compra linha ${lineNum}: "Categoria" é obrigatória.`);             continue; }
      if (!purchaseDateRaw) { errors.push(`Compra linha ${lineNum}: "Data da Compra" é obrigatória.`); continue; }
      if (quantityPurchased < 1) { errors.push(`Compra linha ${lineNum}: "Quantidade Comprada" deve ser ≥ 1.`); continue; }

      const purchaseDate = this.parseDate(purchaseDateRaw);
      if (!purchaseDate) { errors.push(`Compra linha ${lineNum}: data inválida "${purchaseDateRaw}". Use DD/MM/AAAA.`); continue; }

      const receiptDate = receiptDateRaw ? (this.parseDate(receiptDateRaw) ?? undefined) : undefined;

      const id = 'C' + String(nextNum).padStart(3, '0');
      nextNum++;

      result.push({
        id,
        product,
        category,
        supplier,
        link,
        purchaseDate,
        receiptDate,
        quantityPurchased,
        unitCost,
        purchaseShipping,
        otherCosts,
        notes,
      });
    }

    return result;
  }

  private parseSales(
    ws: XLSX.WorkSheet | undefined,
    existingPurchases: Purchase[],
    newPurchases: Purchase[],
    existingSales: Sale[],
    settings: Settings,
    errors: string[],
  ): Sale[] {
    if (!ws) return [];

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const result: Sale[] = [];

    const allPurchases = [...existingPurchases, ...newPurchases];
    const validBatchIds = new Set(allPurchases.map(p => p.id));
    let nextNum = this.extractNextNum(existingSales.map(s => s.id), 'V');

    const validStatuses: SaleStatus[] = ['Concluída', 'Cancelada', 'Devolvida', 'Em disputa'];

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (this.isEmptyRow(row)) continue;

      const lineNum = i + 1;
      const batchId       = this.str(row[0]);
      const saleDateRaw   = row[1];
      const channelRaw    = this.str(row[2]) || settings.defaultChannel;
      const quantitySold  = this.num(row[3]);
      const unitPrice     = this.num(row[4]);
      const feePct        = row[5] !== '' && row[5] != null ? this.num(row[5]) : settings.defaultMlFee * 100;
      const sellerShipping = this.num(row[6]);
      const flexRefund    = this.num(row[7]);
      const discount      = this.num(row[8]);
      const otherCosts    = this.num(row[9]);
      const statusRaw     = this.str(row[10]) || 'Concluída';
      const notes         = this.str(row[11]) || undefined;

      if (!batchId)          { errors.push(`Venda linha ${lineNum}: "ID do Lote" é obrigatório.`);        continue; }
      if (!validBatchIds.has(batchId)) { errors.push(`Venda linha ${lineNum}: ID do Lote "${batchId}" não encontrado.`); continue; }
      if (!saleDateRaw)      { errors.push(`Venda linha ${lineNum}: "Data da Venda" é obrigatória.`);     continue; }
      if (quantitySold < 1)  { errors.push(`Venda linha ${lineNum}: "Quantidade Vendida" deve ser ≥ 1.`); continue; }
      if (unitPrice <= 0)    { errors.push(`Venda linha ${lineNum}: "Preço Unitário" deve ser > 0.`);     continue; }

      const saleDate = this.parseDate(saleDateRaw);
      if (!saleDate) { errors.push(`Venda linha ${lineNum}: data inválida "${saleDateRaw}". Use DD/MM/AAAA.`); continue; }

      const status: SaleStatus = validStatuses.includes(statusRaw as SaleStatus)
        ? (statusRaw as SaleStatus)
        : 'Concluída';

      const channel = channelRaw as SaleChannel;
      const product = allPurchases.find(p => p.id === batchId)?.product ?? '';
      const shippingType: 'correios' | 'flex' = flexRefund > 0 ? 'flex' : 'correios';

      const id = 'V' + String(nextNum).padStart(3, '0');
      nextNum++;

      result.push({
        id,
        batchId,
        product,
        quantitySold,
        unitPrice,
        saleDate,
        channel,
        feePercentage: feePct / 100,
        shippingType,
        sellerShipping: shippingType === 'correios' ? sellerShipping : 0,
        flexRefund: shippingType === 'flex' ? flexRefund : undefined,
        discount,
        otherCosts,
        status,
        notes,
      });
    }

    return result;
  }

  private extractNextNum(ids: string[], prefix: string): number {
    const re = new RegExp(`^${prefix}(\\d+)$`);
    let max = 0;
    for (const id of ids) {
      const m = id.match(re);
      if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
  }

  private parseDate(value: any): string | null {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    if (typeof value === 'number') {
      // Excel serial date — days since Dec 30, 1899
      const date = new Date(new Date(1899, 11, 30).getTime() + value * 86_400_000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    const s = String(value).trim();

    const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    return null;
  }

  private num(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    const n = parseFloat(String(value).replace(',', '.').trim());
    return isNaN(n) ? 0 : n;
  }

  private str(value: any): string {
    return value != null ? String(value).trim() : '';
  }

  private isEmptyRow(row: any[]): boolean {
    return row.every(c => c === null || c === undefined || c === '');
  }
}
