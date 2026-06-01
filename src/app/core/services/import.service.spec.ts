// Mock de xlsx-js-style — usado só para ESCRITA (modelo/exportação).
jest.mock('xlsx-js-style', () => ({
  utils: {
    book_new: jest.fn(() => ({})),
    book_append_sheet: jest.fn(),
    aoa_to_sheet: jest.fn(() => ({})),
  },
  writeFile: jest.fn(),
}));

// Mock de xlsx (build corrigida do SheetJS) — usado só para LEITURA de uploads.
jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(() => []),
  },
}));

import * as XLSX from 'xlsx-js-style';
import * as XLSXRead from 'xlsx';
import { ImportService } from './import.service';
import { Purchase, Sale, Settings } from '../models/models';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    defaultMlFee: 0.12,
    yellowAlertDays: 25,
    redAlertDays: 30,
    minimumMargin: 0.10,
    lowStockAlert: 1,
    defaultShipping: 0,
    defaultChannel: 'Mercado Livre',
    categories: ['Eletrônicos'],
    suppliers: ['Amazon BR'],
    channels: ['Mercado Livre'],
    ...overrides,
  };
}

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'C001',
    product: 'Produto X',
    category: 'Eletrônicos',
    supplier: 'Fornecedor Y',
    purchaseDate: '2025-01-01',
    receiptDate: '2025-01-05',
    quantityPurchased: 10,
    unitCost: 100,
    purchaseShipping: 0,
    otherCosts: 0,
    ...overrides,
  };
}

describe('ImportService', () => {
  let service: ImportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImportService();
  });

  // ─── Helpers puros ─────────────────────────────────

  describe('parseDate (via cast)', () => {
    const parseDate = (v: unknown) => (service as any).parseDate(v) as string | null;

    it('retorna null para null/undefined/string vazia', () => {
      expect(parseDate(null)).toBeNull();
      expect(parseDate(undefined)).toBeNull();
      expect(parseDate('')).toBeNull();
    });

    it('aceita instância Date e retorna ISO YYYY-MM-DD', () => {
      expect(parseDate(new Date(2025, 11, 31))).toBe('2025-12-31');
      expect(parseDate(new Date(2025, 0, 5))).toBe('2025-01-05');
    });

    it('retorna null para Date inválida', () => {
      expect(parseDate(new Date('banana'))).toBeNull();
    });

    it('converte serial Excel (number) para ISO', () => {
      // Excel serial 45292 ≈ 2024-01-01
      const iso = parseDate(45292);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('aceita string DD/MM/AAAA e retorna ISO', () => {
      expect(parseDate('31/12/2025')).toBe('2025-12-31');
      expect(parseDate('5/1/2025')).toBe('2025-01-05');
    });

    it('aceita string YYYY-MM-DD e mantém', () => {
      expect(parseDate('2025-12-31')).toBe('2025-12-31');
    });

    it('retorna null para string em formato inválido', () => {
      expect(parseDate('banana')).toBeNull();
      expect(parseDate('2025/12/31')).toBeNull();
    });
  });

  describe('num (via cast)', () => {
    const num = (v: unknown) => (service as any).num(v) as number;

    it('retorna 0 para null/undefined/string vazia', () => {
      expect(num(null)).toBe(0);
      expect(num(undefined)).toBe(0);
      expect(num('')).toBe(0);
    });

    it('mantém number direto', () => {
      expect(num(10)).toBe(10);
      expect(num(10.5)).toBe(10.5);
      expect(num(-3)).toBe(-3);
    });

    it('converte string com ponto decimal', () => {
      expect(num('10.5')).toBe(10.5);
    });

    it('converte string com vírgula decimal', () => {
      expect(num('10,5')).toBe(10.5);
    });

    it('retorna 0 para string inválida', () => {
      expect(num('abc')).toBe(0);
    });

    it('faz trim de espaços', () => {
      expect(num('  10.5  ')).toBe(10.5);
    });
  });

  describe('str (via cast)', () => {
    const str = (v: unknown) => (service as any).str(v) as string;

    it('faz trim de strings', () => {
      expect(str('  hello  ')).toBe('hello');
    });

    it('retorna "" para null/undefined', () => {
      expect(str(null)).toBe('');
      expect(str(undefined)).toBe('');
    });

    it('coage números para string', () => {
      expect(str(10)).toBe('10');
    });
  });

  describe('isEmptyRow (via cast)', () => {
    const isEmptyRow = (r: unknown[]) => (service as any).isEmptyRow(r) as boolean;

    it('retorna true para array só com null/undefined/string vazia', () => {
      expect(isEmptyRow([null, undefined, ''])).toBe(true);
      expect(isEmptyRow([])).toBe(true);
    });

    it('retorna false quando há qualquer valor', () => {
      expect(isEmptyRow([null, 'x', null])).toBe(false);
      expect(isEmptyRow([0])).toBe(false);
    });
  });

  describe('formatDateBr (via cast)', () => {
    const formatDateBr = (iso: string) => (service as any).formatDateBr(iso) as string;

    it('converte ISO YYYY-MM-DD para DD/MM/YYYY', () => {
      expect(formatDateBr('2025-12-31')).toBe('31/12/2025');
      expect(formatDateBr('2025-01-05')).toBe('05/01/2025');
    });
  });

  describe('extractNextNum (via cast)', () => {
    const extractNextNum = (ids: string[], prefix: string) =>
      (service as any).extractNextNum(ids, prefix) as number;

    it('retorna 1 para lista vazia', () => {
      expect(extractNextNum([], 'C')).toBe(1);
    });

    it('retorna max + 1', () => {
      expect(extractNextNum(['C001', 'C002', 'C010'], 'C')).toBe(11);
    });

    it('ignora IDs com prefixo diferente', () => {
      expect(extractNextNum(['V099', 'C003'], 'C')).toBe(4);
    });

    it('ignora IDs malformados', () => {
      expect(extractNextNum(['CXX', 'C-bad', 'C005'], 'C')).toBe(6);
    });
  });

  // ─── parsePurchases via cast ─────────────────────────

  describe('parsePurchases (via cast, mockando sheet_to_json)', () => {
    function callParse(rows: any[][], existing: Purchase[] = []): { result: Purchase[]; errors: string[] } {
      (XLSXRead.utils.sheet_to_json as jest.Mock).mockReturnValue(rows);
      const errors: string[] = [];
      const result = (service as any).parsePurchases({}, existing, errors) as Purchase[];
      return { result, errors };
    }

    it('retorna [] quando ws é undefined', () => {
      const errors: string[] = [];
      const result = (service as any).parsePurchases(undefined, [], errors);
      expect(result).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('ignora linhas vazias (a partir da linha 4)', () => {
      const { result, errors } = callParse([
        ['header1', 'header2'],
        ['indicador'],
        ['exemplo'],
        [null, undefined, ''],
        [null, null, null],
      ]);
      expect(result).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('ignora linhas com nota contendo "EXEMPLO"', () => {
      const { result, errors } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['Produto X', 'Cat', 'Forn', '01/01/2025', '', 10, 100, 0, 0, '', 'EXEMPLO — apague'],
      ]);
      expect(result).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('acumula erro quando "Produto" está vazio', () => {
      const { errors } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['', 'Cat', 'Forn', '01/01/2025', '', 10, 100, 0, 0, '', ''],
      ]);
      expect(errors[0]).toMatch(/linha 4.+Produto/);
    });

    it('acumula erro quando "Categoria" está vazia', () => {
      const { errors } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['Prod', '', 'Forn', '01/01/2025', '', 10, 100, 0, 0, '', ''],
      ]);
      expect(errors[0]).toMatch(/Categoria/);
    });

    it('acumula erro quando "Data da Compra" está vazia', () => {
      const { errors } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['Prod', 'Cat', 'Forn', '', '', 10, 100, 0, 0, '', ''],
      ]);
      expect(errors[0]).toMatch(/Data da Compra/);
    });

    it('acumula erro quando quantidade < 1', () => {
      const { errors } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['Prod', 'Cat', 'Forn', '01/01/2025', '', 0, 100, 0, 0, '', ''],
      ]);
      expect(errors[0]).toMatch(/Quantidade Comprada/);
    });

    it('acumula erro quando data é inválida', () => {
      const { errors } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['Prod', 'Cat', 'Forn', 'data-ruim', '', 10, 100, 0, 0, '', ''],
      ]);
      expect(errors[0]).toMatch(/data inválida/);
    });

    it('gera IDs sequenciais (C001, C002, ...) ignorando IDs existentes', () => {
      const existing: Purchase[] = [makePurchase({ id: 'C005' })];
      const { result } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['Prod1', 'Cat', 'Forn', '01/01/2025', '', 10, 100, 0, 0, '', ''],
        ['Prod2', 'Cat', 'Forn', '02/01/2025', '', 5, 50, 0, 0, '', ''],
      ], existing);
      expect(result.map(p => p.id)).toEqual(['C006', 'C007']);
    });

    it('produz Purchase válido com todos os campos', () => {
      const { result } = callParse([
        ['h1'], ['ind'], ['ex'],
        ['Camisa', 'Roupas', 'Fornecedor X', '15/05/2025', '20/05/2025', 10, 25.5, 15, 0, 'http://x', 'nota livre'],
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'C001',
        product: 'Camisa',
        category: 'Roupas',
        supplier: 'Fornecedor X',
        purchaseDate: '2025-05-15',
        receiptDate: '2025-05-20',
        quantityPurchased: 10,
        unitCost: 25.5,
        purchaseShipping: 15,
        otherCosts: 0,
        link: 'http://x',
        notes: 'nota livre',
      });
    });

    it('rejeita quando excede MAX_ROWS', () => {
      const tooManyRows: any[][] = [
        ['h1'], ['ind'], ['ex'],
        ...Array.from({ length: 5001 }, () => ['Prod', 'Cat', 'Forn', '01/01/2025', '', 10, 100, 0, 0, '', '']),
      ];
      const { result, errors } = callParse(tooManyRows);
      expect(result).toEqual([]);
      expect(errors[0]).toMatch(/limite de 5000/);
    });
  });

  // ─── parseSales via cast ─────────────────────────────

  describe('parseSales (via cast, mockando sheet_to_json)', () => {
    function callParseSales(
      rows: any[][],
      existingPurchases: Purchase[] = [makePurchase()],
      newPurchases: Purchase[] = [],
      existingSales: Sale[] = [],
      settings: Settings = makeSettings(),
    ): { result: Sale[]; errors: string[] } {
      (XLSXRead.utils.sheet_to_json as jest.Mock).mockReturnValue(rows);
      const errors: string[] = [];
      const result = (service as any).parseSales(
        {}, existingPurchases, newPurchases, existingSales, settings, errors,
      ) as Sale[];
      return { result, errors };
    }

    it('retorna [] quando ws é undefined', () => {
      const errors: string[] = [];
      const result = (service as any).parseSales(
        undefined, [], [], [], makeSettings(), errors,
      );
      expect(result).toEqual([]);
    });

    it('rejeita quando batchId está vazio', () => {
      const { errors } = callParseSales([
        ['h'], ['i'], ['e'],
        ['', '01/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, 'Concluída', ''],
      ]);
      expect(errors[0]).toMatch(/ID do Lote.+obrigatório/);
    });

    it('rejeita quando batchId não existe', () => {
      const { errors } = callParseSales([
        ['h'], ['i'], ['e'],
        ['C999', '01/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, 'Concluída', ''],
      ]);
      expect(errors[0]).toMatch(/não encontrado/);
    });

    it('rejeita venda quando lote ainda está em trânsito (sem receiptDate)', () => {
      const inTransit = makePurchase({ id: 'C100', receiptDate: undefined });
      const { errors } = callParseSales(
        [['h'], ['i'], ['e'], ['C100', '01/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, 'Concluída', '']],
        [inTransit],
      );
      expect(errors[0]).toMatch(/em trânsito/);
    });

    it('rejeita quando quantidade excede estoque disponível', () => {
      const batch = makePurchase({ id: 'C001', quantityPurchased: 5 });
      const { errors } = callParseSales(
        [['h'], ['i'], ['e'], ['C001', '01/06/2025', 'ML', 10, 100, 12, 0, 0, 0, 0, 'Concluída', '']],
        [batch],
      );
      expect(errors[0]).toMatch(/excede o estoque/);
    });

    it('rejeita quando saleDate < purchaseDate do lote', () => {
      const batch = makePurchase({ id: 'C001', purchaseDate: '2025-06-15' });
      const { errors } = callParseSales(
        [['h'], ['i'], ['e'], ['C001', '01/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, 'Concluída', '']],
        [batch],
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(' ')).toMatch(/anterior/);
    });

    it('rejeita valores negativos em frete, desconto, taxas', () => {
      const batch = makePurchase({ id: 'C001' });
      const { errors } = callParseSales(
        [['h'], ['i'], ['e'], ['C001', '01/06/2025', 'ML', 1, 100, -5, 0, 0, 0, 0, 'Concluída', '']],
        [batch],
      );
      expect(errors[0]).toMatch(/Taxa.+negativa/);
    });

    it('gera IDs sequenciais (V001, V002, ...)', () => {
      const { result } = callParseSales(
        [['h'], ['i'], ['e'],
          ['C001', '01/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, 'Concluída', ''],
          ['C001', '02/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, 'Concluída', ''],
        ],
        [makePurchase({ id: 'C001', quantityPurchased: 10 })],
      );
      expect(result.map(s => s.id)).toEqual(['V001', 'V002']);
    });

    it('status default é "Concluída" quando omitido', () => {
      const { result } = callParseSales([
        ['h'], ['i'], ['e'],
        ['C001', '01/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, '', ''],
      ]);
      expect(result[0].status).toBe('Concluída');
    });

    it('infere shippingType = "flex" quando flexRefund > 0', () => {
      const { result } = callParseSales([
        ['h'], ['i'], ['e'],
        ['C001', '01/06/2025', 'ML', 1, 100, 12, 0, 15, 0, 0, 'Concluída', ''],
      ]);
      expect(result[0].shippingType).toBe('flex');
      expect(result[0].flexRefund).toBe(15);
      expect(result[0].sellerShipping).toBe(0);
    });

    it('shippingType = "correios" quando flexRefund = 0', () => {
      const { result } = callParseSales([
        ['h'], ['i'], ['e'],
        ['C001', '01/06/2025', 'ML', 1, 100, 12, 5, 0, 0, 0, 'Concluída', ''],
      ]);
      expect(result[0].shippingType).toBe('correios');
      expect(result[0].sellerShipping).toBe(5);
      expect(result[0].flexRefund).toBeUndefined();
    });

    it('usa settings.defaultMlFee quando taxa está vazia', () => {
      const settings = makeSettings({ defaultMlFee: 0.13 });
      const { result } = callParseSales([
        ['h'], ['i'], ['e'],
        ['C001', '01/06/2025', 'ML', 1, 100, '', 0, 0, 0, 0, 'Concluída', ''],
      ], undefined, undefined, undefined, settings);
      expect(result[0].feePercentage).toBeCloseTo(0.13, 5);
    });

    it('converte taxa de % (12) para fração (0.12)', () => {
      const { result } = callParseSales([
        ['h'], ['i'], ['e'],
        ['C001', '01/06/2025', 'ML', 1, 100, 12, 0, 0, 0, 0, 'Concluída', ''],
      ]);
      expect(result[0].feePercentage).toBeCloseTo(0.12, 5);
    });
  });

  // ─── parseFile (orquestração + I/O) ──────────────────

  describe('parseFile', () => {
    function makeFakeFile(): File {
      return {
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      } as unknown as File;
    }

    it('retorna erro quando arquivo é inválido / XLSX.read joga exceção', async () => {
      (XLSXRead.read as jest.Mock).mockImplementation(() => { throw new Error('boom'); });
      const result = await service.parseFile(makeFakeFile(), [], [], makeSettings());
      expect(result.purchases).toEqual([]);
      expect(result.sales).toEqual([]);
      expect(result.errors).toEqual(['Arquivo inválido ou corrompido.']);
    });

    it('retorna sucesso quando XLSX.read e parsers respondem corretamente', async () => {
      (XLSXRead.read as jest.Mock).mockReturnValue({
        Sheets: { Compras: {}, Vendas: {} },
      });
      // Mock retorna [] para os dois sheets — sem dados, sem erros
      (XLSXRead.utils.sheet_to_json as jest.Mock).mockReturnValue([]);
      const result = await service.parseFile(makeFakeFile(), [], [], makeSettings());
      expect(result.purchases).toEqual([]);
      expect(result.sales).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('captura crash inesperado de parser e retorna erro genérico', async () => {
      (XLSXRead.read as jest.Mock).mockReturnValue({
        Sheets: { Compras: {}, Vendas: {} },
      });
      (XLSXRead.utils.sheet_to_json as jest.Mock).mockImplementation(() => { throw new Error('crash'); });
      const result = await service.parseFile(makeFakeFile(), [], [], makeSettings());
      expect(result.errors).toEqual(['Arquivo inválido ou corrompido.']);
    });
  });

  // ─── downloadTemplate ────────────────────────────────

  describe('downloadTemplate', () => {
    it('cria workbook, anexa 3 sheets e chama writeFile', () => {
      service.downloadTemplate(makeSettings());
      expect(XLSX.utils.book_new).toHaveBeenCalled();
      expect(XLSX.utils.book_append_sheet).toHaveBeenCalledTimes(3);
      const sheetNames = (XLSX.utils.book_append_sheet as jest.Mock).mock.calls.map(c => c[2]);
      expect(sheetNames).toEqual(['Instruções', 'Compras', 'Vendas']);
      expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), 'modelo-lucrato.xlsx');
    });
  });
});
