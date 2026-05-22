import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx-js-style';
import { Purchase, Sale, Settings, SaleChannel, SaleStatus } from '../models/models';
import { calculatePurchase } from './calculations';

export interface ImportResult {
  purchases: Purchase[];
  sales: Sale[];
  errors: string[];
}

const COLORS = {
  primaryDark: '305496',
  primaryLight: 'B4C7E7',
  titleText: 'FFFFFF',
  sectionText: '1F3864',
  required: 'C00000',
  optional: '7F7F7F',
  exampleBg: 'F2F2F2',
  exampleText: '7F7F7F',
  border: 'BFBFBF',
  numberBold: '305496',
};

const thinBorder = () => {
  const b = { style: 'thin' as const, color: { rgb: COLORS.border } };
  return { top: b, bottom: b, left: b, right: b };
};

const STYLES = {
  title: {
    font: { bold: true, sz: 18, color: { rgb: COLORS.titleText } },
    fill: { fgColor: { rgb: COLORS.primaryDark } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: thinBorder(),
  },
  sectionHeader: {
    font: { bold: true, sz: 13, color: { rgb: COLORS.sectionText } },
    fill: { fgColor: { rgb: COLORS.primaryLight } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
    border: thinBorder(),
  },
  tableHeader: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.titleText } },
    fill: { fgColor: { rgb: COLORS.primaryDark } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const, wrapText: true },
    border: thinBorder(),
  },
  requiredIndicator: {
    font: { bold: true, italic: true, sz: 9, color: { rgb: COLORS.required } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: thinBorder(),
  },
  optionalIndicator: {
    font: { italic: true, sz: 9, color: { rgb: COLORS.optional } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: thinBorder(),
  },
  exampleCell: {
    font: { italic: true, color: { rgb: COLORS.exampleText } },
    fill: { fgColor: { rgb: COLORS.exampleBg } },
    alignment: { vertical: 'center' as const },
    border: thinBorder(),
  },
  stepNumber: {
    font: { bold: true, sz: 12, color: { rgb: COLORS.numberBold } },
    alignment: { horizontal: 'center' as const, vertical: 'top' as const },
    border: thinBorder(),
  },
  instructionLabel: {
    font: { bold: true, sz: 11 },
    alignment: { vertical: 'top' as const, wrapText: true },
    border: thinBorder(),
  },
  instructionText: {
    font: { sz: 11 },
    alignment: { vertical: 'top' as const, wrapText: true },
    border: thinBorder(),
  },
  requiredCell: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.required } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: thinBorder(),
  },
  optionalCell: {
    font: { italic: true, sz: 11, color: { rgb: COLORS.optional } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: thinBorder(),
  },
};

function applyStyle(ws: XLSX.WorkSheet, addr: string, style: object): void {
  if (!ws[addr]) ws[addr] = { v: '', t: 's' };
  ws[addr].s = style;
}

function applyNumberFormat(ws: XLSX.WorkSheet, addr: string, fmt: string): void {
  if (ws[addr]) ws[addr].z = fmt;
}

function colLetter(col: number): string {
  let s = '';
  let n = col;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function cellAddr(row: number, col: number): string {
  return `${colLetter(col)}${row + 1}`;
}

@Injectable({ providedIn: 'root' })
export class ImportService {

  downloadTemplate(settings: Settings): void {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, this.buildInstrucoesSheet(), 'Instruções');
    XLSX.utils.book_append_sheet(wb, this.buildComprasSheet(settings), 'Compras');
    XLSX.utils.book_append_sheet(wb, this.buildVendasSheet(settings), 'Vendas');
    XLSX.writeFile(wb, 'modelo-lucrato.xlsx');
  }

  private buildInstrucoesSheet(): XLSX.WorkSheet {
    const purchaseColumns: Array<[string, boolean, string]> = [
      ['Produto', true, 'Nome do produto ou item comprado.'],
      ['Categoria', true, 'Categoria do produto (ex: Eletrônicos, Roupas).'],
      ['Fornecedor', false, 'Nome do fornecedor ou marketplace onde comprou.'],
      ['Data da Compra (DD/MM/AAAA)', true, 'Data em que a compra foi realizada.'],
      ['Data de Recebimento (DD/MM/AAAA)', false, 'Data em que o produto foi recebido.'],
      ['Quantidade Comprada', true, 'Número inteiro, mínimo 1.'],
      ['Custo Unitário (R$)', true, 'Preço pago por unidade.'],
      ['Frete da Compra (R$)', false, 'Custo do frete pago na compra. Padrão: 0.'],
      ['Outros Custos (R$)', false, 'Outros custos associados à compra (impostos, embalagem etc.). Padrão: 0.'],
      ['Link', false, 'URL do produto no site do fornecedor.'],
      ['Observações', false, 'Anotações livres sobre o lote.'],
    ];

    const saleColumns: Array<[string, boolean, string]> = [
      ['ID do Lote', true, 'ID do lote de compra vinculado (ex: C001, C002). Deve existir no sistema ou neste arquivo.'],
      ['Data da Venda (DD/MM/AAAA)', true, 'Data em que a venda foi realizada.'],
      ['Canal', false, 'Canal de venda (ex: Mercado Livre, Shopee). Padrão: canal configurado no sistema.'],
      ['Quantidade Vendida', true, 'Número inteiro, mínimo 1.'],
      ['Preço Unitário (R$)', true, 'Valor cobrado por unidade vendida.'],
      ['Taxa (%)', false, 'Percentual de taxa do canal (ex: 12 para 12%). Padrão: taxa configurada no sistema.'],
      ['Frete Vendedor (R$)', false, 'Custo do frete pago pelo vendedor via Correios. Padrão: 0.'],
      ['Estorno Flex (R$)', false, 'Valor do estorno de frete Flex recebido. Se preenchido (> 0), o envio é registrado como Flex. Padrão: 0.'],
      ['Desconto (R$)', false, 'Valor de cupom ou desconto concedido ao comprador. Padrão: 0.'],
      ['Outros Custos (R$)', false, 'Outros custos relacionados à venda. Padrão: 0.'],
      ['Status', false, 'Status da venda: Concluída, Cancelada, Devolvida, Em disputa. Padrão: Concluída.'],
      ['Observações', false, 'Anotações livres sobre a venda.'],
    ];

    const aoa: any[][] = [];
    aoa.push(['MODELO DE IMPORTAÇÃO — LUCRATO', '', '']);
    aoa.push(['', '', '']);
    aoa.push(['COMO USAR', '', '']);
    aoa.push(['1.', 'Abra a aba "Compras" e preencha seus lotes a partir da LINHA 4 (linhas 1-3 são o cabeçalho).', '']);
    aoa.push(['2.', 'Abra a aba "Vendas" e preencha suas vendas a partir da LINHA 4.', '']);
    aoa.push(['3.', 'Na aba Vendas, o campo "ID do Lote" deve referenciar um ID já existente no sistema OU uma compra adicionada neste mesmo arquivo.', '']);
    aoa.push(['4.', 'Salve o arquivo e importe em Configurações → Importar Planilha.', '']);
    aoa.push(['', '', '']);
    aoa.push(['REGRAS IMPORTANTES', '', '']);
    aoa.push(['Datas', 'Use sempre o formato DD/MM/AAAA (ex: 15/05/2025). Células formatadas como data no Excel também são aceitas.', '']);
    aoa.push(['Decimais', 'Use ponto ou vírgula como separador (ex: 25.50 ou 25,50).', '']);
    aoa.push(['Exemplo', 'A linha 3 de cada aba é apenas um exemplo. Apague-a antes de importar ou simplesmente deixe — linhas com o texto "EXEMPLO" são ignoradas pelo sistema.', '']);
    aoa.push(['Tipo de Envio', 'O tipo de envio da venda é detectado automaticamente: se "Estorno Flex (R$)" for maior que 0, o envio será registrado como Flex; caso contrário, como Correios.', '']);
    aoa.push(['', '', '']);
    aoa.push(['COLUNAS DA ABA COMPRAS', '', '']);
    aoa.push(['Coluna', 'Obrigatório', 'Descrição']);
    const comprasStartRow = aoa.length;
    for (const [col, req, desc] of purchaseColumns) {
      aoa.push([col, req ? 'Sim' : 'Não', desc]);
    }
    const comprasEndRow = aoa.length - 1;
    aoa.push(['', '', '']);
    aoa.push(['COLUNAS DA ABA VENDAS', '', '']);
    aoa.push(['Coluna', 'Obrigatório', 'Descrição']);
    const vendasStartRow = aoa.length;
    for (const [col, req, desc] of saleColumns) {
      aoa.push([col, req ? 'Sim' : 'Não', desc]);
    }
    const vendasEndRow = aoa.length - 1;

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 80 }];

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
      { s: { r: 8, c: 0 }, e: { r: 8, c: 2 } },
      { s: { r: 14, c: 0 }, e: { r: 14, c: 2 } },
      { s: { r: comprasEndRow + 2, c: 0 }, e: { r: comprasEndRow + 2, c: 2 } },
    ];

    const rows: { hpx: number }[] = [];
    rows[0] = { hpx: 36 };
    rows[2] = { hpx: 24 };
    rows[8] = { hpx: 24 };
    rows[14] = { hpx: 24 };
    rows[comprasEndRow + 2] = { hpx: 24 };
    ws['!rows'] = rows;

    applyStyle(ws, 'A1', STYLES.title);
    applyStyle(ws, 'B1', STYLES.title);
    applyStyle(ws, 'C1', STYLES.title);

    [2, 8, 14, comprasEndRow + 2].forEach(r => {
      applyStyle(ws, cellAddr(r, 0), STYLES.sectionHeader);
      applyStyle(ws, cellAddr(r, 1), STYLES.sectionHeader);
      applyStyle(ws, cellAddr(r, 2), STYLES.sectionHeader);
    });

    for (let r = 3; r <= 6; r++) {
      applyStyle(ws, cellAddr(r, 0), STYLES.stepNumber);
      applyStyle(ws, cellAddr(r, 1), STYLES.instructionText);
      applyStyle(ws, cellAddr(r, 2), STYLES.instructionText);
    }

    for (let r = 9; r <= 12; r++) {
      applyStyle(ws, cellAddr(r, 0), STYLES.instructionLabel);
      applyStyle(ws, cellAddr(r, 1), STYLES.instructionText);
      applyStyle(ws, cellAddr(r, 2), STYLES.instructionText);
    }

    [15, comprasEndRow + 3].forEach(r => {
      applyStyle(ws, cellAddr(r, 0), STYLES.tableHeader);
      applyStyle(ws, cellAddr(r, 1), STYLES.tableHeader);
      applyStyle(ws, cellAddr(r, 2), STYLES.tableHeader);
    });

    for (let r = comprasStartRow; r <= comprasEndRow; r++) {
      applyStyle(ws, cellAddr(r, 0), STYLES.instructionLabel);
      const reqValue = (ws[cellAddr(r, 1)] as XLSX.CellObject)?.v;
      applyStyle(ws, cellAddr(r, 1), reqValue === 'Sim' ? STYLES.requiredCell : STYLES.optionalCell);
      applyStyle(ws, cellAddr(r, 2), STYLES.instructionText);
    }

    for (let r = vendasStartRow; r <= vendasEndRow; r++) {
      applyStyle(ws, cellAddr(r, 0), STYLES.instructionLabel);
      const reqValue = (ws[cellAddr(r, 1)] as XLSX.CellObject)?.v;
      applyStyle(ws, cellAddr(r, 1), reqValue === 'Sim' ? STYLES.requiredCell : STYLES.optionalCell);
      applyStyle(ws, cellAddr(r, 2), STYLES.instructionText);
    }

    return ws;
  }

  private buildComprasSheet(settings: Settings): XLSX.WorkSheet {
    const headers = [
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
    const required = [true, true, false, true, false, true, true, false, false, false, false];
    const example = [
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
    const numberFormats: Record<number, string> = {
      5: '0',
      6: 'R$ #,##0.00',
      7: 'R$ #,##0.00',
      8: 'R$ #,##0.00',
    };
    const colWidths = [25, 18, 18, 22, 24, 14, 16, 16, 16, 32, 32];

    return this.buildDataSheet(headers, required, example, numberFormats, colWidths);
  }

  private buildVendasSheet(settings: Settings): XLSX.WorkSheet {
    const headers = [
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
    const required = [true, true, false, true, true, false, false, false, false, false, false, false];
    const example = [
      'C001',
      '20/05/2025',
      settings.defaultChannel || 'Mercado Livre',
      2,
      45.00,
      +(settings.defaultMlFee * 100).toFixed(2) || 12,
      0,
      0,
      0,
      0,
      'Concluída',
      'EXEMPLO — apague esta linha antes de importar',
    ];
    const numberFormats: Record<number, string> = {
      3: '0',
      4: 'R$ #,##0.00',
      5: '0.00"%"',
      6: 'R$ #,##0.00',
      7: 'R$ #,##0.00',
      8: 'R$ #,##0.00',
      9: 'R$ #,##0.00',
    };
    const colWidths = [12, 22, 16, 16, 18, 12, 18, 16, 14, 16, 14, 32];

    return this.buildDataSheet(headers, required, example, numberFormats, colWidths);
  }

  private buildDataSheet(
    headers: string[],
    required: boolean[],
    example: any[],
    numberFormats: Record<number, string>,
    colWidths: number[],
  ): XLSX.WorkSheet {
    const indicators = required.map(r => r ? 'OBRIGATÓRIO' : 'OPCIONAL');
    const aoa = [headers, indicators, example];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    ws['!rows'] = [{ hpx: 30 }, { hpx: 18 }, { hpx: 22 }];
    ws['!views'] = [{ state: 'frozen', ySplit: 3 }];
    ws['!autofilter'] = { ref: `A1:${colLetter(headers.length - 1)}1` };

    for (let c = 0; c < headers.length; c++) {
      applyStyle(ws, cellAddr(0, c), STYLES.tableHeader);
      applyStyle(ws, cellAddr(1, c), required[c] ? STYLES.requiredIndicator : STYLES.optionalIndicator);
      applyStyle(ws, cellAddr(2, c), STYLES.exampleCell);
      const fmt = numberFormats[c];
      if (fmt) applyNumberFormat(ws, cellAddr(2, c), fmt);
    }

    return ws;
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

    try {
      const newPurchases = this.parsePurchases(
        workbook.Sheets['Compras'],
        currentPurchases,
        errors,
      );

      const newSales = this.parseSales(
        workbook.Sheets['Vendas'],
        currentPurchases,
        newPurchases,
        currentSales,
        settings,
        errors,
      );

      return { purchases: newPurchases, sales: newSales, errors };
    } catch (err) {
      console.error('[Import] parseFile crashed:', err);
      return { purchases: [], sales: [], errors: ['Arquivo inválido ou corrompido.'] };
    }
  }

  private parsePurchases(
    ws: XLSX.WorkSheet | undefined,
    existing: Purchase[],
    errors: string[],
  ): Purchase[] {
    if (!ws) return [];

    const MAX_ROWS = 5000;
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length - 3 > MAX_ROWS) {
      errors.push(`Aba "Compras" excede o limite de ${MAX_ROWS} linhas. Divida em arquivos menores.`);
      return [];
    }

    const result: Purchase[] = [];
    let nextNum = this.extractNextNum(existing.map(p => p.id), 'C');

    for (let i = 3; i < rows.length; i++) {
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

      if (notes && /EXEMPLO/i.test(notes)) continue;

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

    const MAX_ROWS = 5000;
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length - 3 > MAX_ROWS) {
      errors.push(`Aba "Vendas" excede o limite de ${MAX_ROWS} linhas. Divida em arquivos menores.`);
      return [];
    }

    const result: Sale[] = [];

    const allPurchases = [...existingPurchases, ...newPurchases];
    const validBatchIds = new Set(allPurchases.map(p => p.id));
    let nextNum = this.extractNextNum(existingSales.map(s => s.id), 'V');

    const validStatuses: SaleStatus[] = ['Concluída', 'Cancelada', 'Devolvida', 'Em disputa'];

    for (let i = 3; i < rows.length; i++) {
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

      if (notes && /EXEMPLO/i.test(notes)) continue;

      if (!batchId)          { errors.push(`Venda linha ${lineNum}: "ID do Lote" é obrigatório.`);        continue; }
      if (!validBatchIds.has(batchId)) { errors.push(`Venda linha ${lineNum}: ID do Lote "${batchId}" não encontrado.`); continue; }

      const batch = allPurchases.find(p => p.id === batchId);
      if (batch) {
        const computed = calculatePurchase(batch, existingSales, settings);
        if (computed.status === 'Em trânsito') {
          errors.push(`Venda linha ${lineNum}: lote "${batchId}" ainda está em trânsito (sem Data de Recebimento). Não pode receber vendas.`);
          continue;
        }
        if (computed.status === 'Vendido') {
          errors.push(`Venda linha ${lineNum}: lote "${batchId}" já está esgotado (todas as unidades vendidas).`);
          continue;
        }
      }

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
