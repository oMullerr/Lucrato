// Mock xlsx-js-style — capture workbook calls so we can assert structure.
const bookNewMock = jest.fn(() => ({ SheetNames: [] as string[], Sheets: {} as Record<string, any> }));
const aoaToSheetMock = jest.fn((aoa: any[][]) => {
  const ws: any = {};
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < aoa[r].length; c++) {
      const v = aoa[r][c];
      if (v === '' || v == null) continue;
      const addr = encodeCellPure({ r, c });
      ws[addr] = typeof v === 'number'
        ? { t: 'n', v }
        : { t: 's', v: String(v) };
    }
  }
  return ws;
});
const bookAppendSheetMock = jest.fn((wb: any, ws: any, name: string) => {
  wb.SheetNames.push(name);
  wb.Sheets[name] = ws;
});
const writeFileMock = jest.fn();

function encodeCellPure(addr: { r: number; c: number }): string {
  let col = '';
  let n = addr.c;
  do {
    col = String.fromCharCode(65 + (n % 26)) + col;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${col}${addr.r + 1}`;
}

jest.mock('xlsx-js-style', () => ({
  utils: {
    book_new: bookNewMock,
    aoa_to_sheet: aoaToSheetMock,
    book_append_sheet: bookAppendSheetMock,
    encode_cell: (addr: { r: number; c: number }) => encodeCellPure(addr),
  },
  writeFile: writeFileMock,
}));

import { XlsxExportService, SheetSpec, ResumoSpec } from './xlsx-export.service';

interface Row {
  product: string;
  qty: number;
  revenue: number;
  netProfit: number;
  margin: number;
}

function sampleSheet(rows: Row[] = []): SheetSpec<Row> {
  return {
    name: 'Produtos',
    title: 'Ranking de produtos',
    columns: [
      { header: 'Produto',     key: 'product',   type: 'text' },
      { header: 'Qtd',         key: 'qty',       type: 'int',     total: 'sum' },
      { header: 'Receita',     key: 'revenue',   type: 'brl',     total: 'sum' },
      { header: 'Lucro',       key: 'netProfit', type: 'brl',     total: 'sum' },
      { header: 'Margem',      key: 'margin',    type: 'percent', total: 'weightedAvg', numKey: 'netProfit', denKey: 'revenue' },
    ],
    rows,
  };
}

function sampleResumo(): ResumoSpec {
  return {
    title: 'Análises Lucrato',
    generatedAt: new Date(2026, 4, 28, 14, 30),
    blocks: [
      {
        title: 'Investimento',
        rows: [
          { label: 'Investido', value: 1000, kind: 'brl' },
          { label: 'Lotes',     value: 5,    kind: 'count' },
        ],
      },
      {
        title: 'Resultado',
        rows: [
          { label: 'Lucro',  value: 250.5, kind: 'brl' },
          { label: 'Margem', value: 0.25,  kind: 'percent' },
        ],
      },
    ],
  };
}

describe('XlsxExportService', () => {
  let service: XlsxExportService;

  beforeEach(() => {
    bookNewMock.mockClear();
    aoaToSheetMock.mockClear();
    bookAppendSheetMock.mockClear();
    writeFileMock.mockClear();
    service = new XlsxExportService();
  });

  describe('download', () => {
    it('cria workbook, monta sheet e chama writeFile com extensão .xlsx', () => {
      service.download('teste', [sampleSheet([])]);
      expect(bookNewMock).toHaveBeenCalledTimes(1);
      expect(writeFileMock).toHaveBeenCalledTimes(1);
      expect(writeFileMock.mock.calls[0][1]).toBe('teste.xlsx');
    });

    it('preserva ".xlsx" quando já está no filename', () => {
      service.download('relatorio.xlsx', [sampleSheet([])]);
      expect(writeFileMock.mock.calls[0][1]).toBe('relatorio.xlsx');
    });

    it('adiciona sheet Resumo primeiro quando resumo informado', () => {
      service.download('teste', [sampleSheet([])], sampleResumo());
      const names = bookAppendSheetMock.mock.calls.map(c => c[2]);
      expect(names[0]).toBe('Resumo');
      expect(names[1]).toBe('Produtos');
    });

    it('não inclui Resumo quando não informado', () => {
      service.download('teste', [sampleSheet([])]);
      const names = bookAppendSheetMock.mock.calls.map(c => c[2]);
      expect(names).not.toContain('Resumo');
    });

    it('inclui todas as sheets passadas no array', () => {
      const a = { ...sampleSheet([]), name: 'Produtos' };
      const b = { ...sampleSheet([]), name: 'Categorias' };
      service.download('tudo', [a, b]);
      const names = bookAppendSheetMock.mock.calls.map(c => c[2]);
      expect(names).toEqual(['Produtos', 'Categorias']);
    });

    it('trunca o nome da sheet em 31 caracteres', () => {
      const long = { ...sampleSheet([]), name: 'a'.repeat(50) };
      service.download('t', [long]);
      const name = bookAppendSheetMock.mock.calls[0][2] as string;
      expect(name.length).toBe(31);
    });
  });

  describe('formato e estilos', () => {
    it('aplica cell-format BRL em colunas type "brl" para valores numéricos', () => {
      service.download('t', [sampleSheet([
        { product: 'A', qty: 1, revenue: 100, netProfit: 25, margin: 0.25 },
      ])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      // header row index 3 (title, subtitle, blank, header), data starts row 4
      const revenueCell = ws['C5']; // col C = index 2 = "Receita", row index 4 = row 5
      expect(revenueCell.t).toBe('n');
      expect(revenueCell.v).toBe(100);
      expect(revenueCell.z).toBe('R$ #,##0.00');
    });

    it('aplica cell-format percent com valor decimal (0–1) na coluna de margem', () => {
      service.download('t', [sampleSheet([
        { product: 'A', qty: 1, revenue: 100, netProfit: 25, margin: 0.25 },
      ])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      const marginCell = ws['E5']; // col E = index 4 = "Margem"
      expect(marginCell.t).toBe('n');
      expect(marginCell.v).toBe(0.25);
      expect(marginCell.z).toBe('0.0%');
    });

    it('aplica cell-format inteiro em colunas type "int"', () => {
      service.download('t', [sampleSheet([
        { product: 'A', qty: 7, revenue: 100, netProfit: 25, margin: 0.25 },
      ])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      const qtyCell = ws['B5'];
      expect(qtyCell.t).toBe('n');
      expect(qtyCell.v).toBe(7);
      expect(qtyCell.z).toBe('#,##0');
    });

    it('cabeçalho recebe estilo bold + fill brand', () => {
      service.download('t', [sampleSheet([
        { product: 'A', qty: 1, revenue: 100, netProfit: 25, margin: 0.25 },
      ])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      const headerCell = ws['A4']; // row index 3 (title, subtitle, blank, header)
      expect(headerCell.s.font.bold).toBe(true);
      expect(headerCell.s.fill.fgColor.rgb).toBe('0A6E5C');
    });

    it('aplica toneFn (success/warning/danger) na coluna alvo', () => {
      const sheet = sampleSheet([
        { product: 'A', qty: 1, revenue: 100, netProfit: -5, margin: -0.05 },
      ]);
      sheet.columns[4].toneFn = (r) => r.margin < 0 ? 'danger' : 'success';
      service.download('t', [sheet]);
      const ws = aoaToSheetMock.mock.results[0].value;
      const marginCell = ws['E5'];
      expect(marginCell.s.font.color.rgb).toBe('DC2626');
      expect(marginCell.s.fill.fgColor.rgb).toBe('FEE2E2');
    });

    it('aplica bgFn na coluna alvo (badge de status)', () => {
      interface S { name: string; status: string; }
      const sheet: SheetSpec<S> = {
        name: 'Lotes',
        title: 'Lotes',
        columns: [
          { header: 'Nome', key: 'name', type: 'text' },
          { header: 'Status', key: 'status', type: 'text', bgFn: r => r.status === 'Parado' ? 'FEE2E2' : undefined },
        ],
        rows: [{ name: 'X', status: 'Parado' }],
      };
      service.download('t', [sheet]);
      const ws = aoaToSheetMock.mock.results[0].value;
      const statusCell = ws['B5'];
      expect(statusCell.s.fill.fgColor.rgb).toBe('FEE2E2');
    });
  });

  describe('totais', () => {
    it('linha de totais soma colunas com total "sum"', () => {
      service.download('t', [sampleSheet([
        { product: 'A', qty: 2, revenue: 100, netProfit: 25, margin: 0.25 },
        { product: 'B', qty: 3, revenue: 200, netProfit: 50, margin: 0.25 },
      ])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      // data rows: 5, 6; blank: 7; totals: 8
      const totalQty = ws['B8'];
      const totalRevenue = ws['C8'];
      expect(totalQty.v).toBe(5);
      expect(totalRevenue.v).toBe(300);
    });

    it('linha de totais calcula média ponderada quando total="weightedAvg"', () => {
      service.download('t', [sampleSheet([
        { product: 'A', qty: 1, revenue: 100, netProfit: 10, margin: 0.10 },
        { product: 'B', qty: 1, revenue: 200, netProfit: 50, margin: 0.25 },
      ])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      const totalMargin = ws['E8']; // 60 / 300 = 0.20
      expect(totalMargin.v).toBeCloseTo(0.2, 5);
      expect(totalMargin.z).toBe('0.0%');
    });

    it('não adiciona linha de totais quando rows está vazio', () => {
      service.download('t', [sampleSheet([])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      expect(ws['A8']).toBeUndefined();
      expect(ws['A5']).toBeUndefined();
    });

    it('label "TOTAIS" na primeira coluna da linha de totais', () => {
      service.download('t', [sampleSheet([
        { product: 'A', qty: 1, revenue: 100, netProfit: 25, margin: 0.25 },
      ])]);
      const ws = aoaToSheetMock.mock.results[0].value;
      // data row 5; blank 6; totals 7
      const label = ws['A7'];
      expect(label.v).toBe('TOTAIS');
    });
  });

  describe('Resumo sheet', () => {
    it('monta título + linha de geração + blocos de KPI', () => {
      service.download('t', [sampleSheet([])], sampleResumo());
      const resumoWs = bookAppendSheetMock.mock.calls[0][1];
      expect(resumoWs['A1'].v).toBe('Análises Lucrato');
      expect(String(resumoWs['A2'].v)).toContain('Gerado em 28/05/2026');
      // Block titles at row 4 (index 3)
      expect(resumoWs['A4'].v).toBe('Investimento');
      expect(resumoWs['C4'].v).toBe('Resultado');
    });

    it('valores do Resumo recebem cell-format conforme kind', () => {
      service.download('t', [sampleSheet([])], sampleResumo());
      const resumoWs = bookAppendSheetMock.mock.calls[0][1];
      // First block: row 5 (index 4) = Investido (brl), row 6 = Lotes (count)
      expect(resumoWs['B5'].z).toBe('R$ #,##0.00');
      expect(resumoWs['B6'].z).toBe('#,##0');
      // Second block: row 6 = Margem (percent), col D
      expect(resumoWs['D6'].z).toBe('0.0%');
    });
  });
});
