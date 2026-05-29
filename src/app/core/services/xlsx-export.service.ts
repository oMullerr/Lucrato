import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx-js-style';

const FMT = {
  brl: 'R$ #,##0.00',
  percent: '0.0%',
  int: '#,##0',
} as const;

const C = {
  brand: '0A6E5C',
  accent: 'C9A35C',
  surface: 'F4F4EF',
  zebra: 'FAFAF7',
  white: 'FFFFFF',
  text: '0A0A0B',
  muted: '71717A',
  border: 'D4D4D8',
  success: '16A34A',
  successBg: 'DCFCE7',
  warning: 'D97706',
  warningBg: 'FEF3C7',
  danger: 'DC2626',
  dangerBg: 'FEE2E2',
  info: '2563EB',
  infoBg: 'DBEAFE',
  neutralBg: 'E5E7EB',
} as const;

const thinBorder = (rgb: string = C.border) => {
  const b = { style: 'thin' as const, color: { rgb } };
  return { top: b, bottom: b, left: b, right: b };
};

const S = {
  titleBand: {
    font: { bold: true, sz: 16, color: { rgb: C.white }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.brand } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
  },
  subtitle: {
    font: { italic: true, sz: 10, color: { rgb: C.muted }, name: 'Calibri' },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
  },
  sheetTitle: {
    font: { bold: true, sz: 13, color: { rgb: C.white }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.accent } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
  },
  header: {
    font: { bold: true, sz: 11, color: { rgb: C.white }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.brand } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const, wrapText: true },
    border: thinBorder(C.brand),
  },
  cell: {
    font: { sz: 11, color: { rgb: C.text }, name: 'Calibri' },
    alignment: { vertical: 'center' as const },
    border: thinBorder(),
  },
  cellZebra: {
    font: { sz: 11, color: { rgb: C.text }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.zebra } },
    alignment: { vertical: 'center' as const },
    border: thinBorder(),
  },
  totals: {
    font: { bold: true, sz: 11, color: { rgb: C.text }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.surface } },
    alignment: { vertical: 'center' as const },
    border: { ...thinBorder(), top: { style: 'medium' as const, color: { rgb: C.accent } } },
  },
  resumoBlockTitle: {
    font: { bold: true, sz: 12, color: { rgb: C.white }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.accent } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  },
  resumoLabel: {
    font: { sz: 11, color: { rgb: C.text }, name: 'Calibri' },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
    border: thinBorder(),
  },
  resumoValue: {
    font: { bold: true, sz: 11, color: { rgb: C.brand }, name: 'Calibri' },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const, indent: 1 },
    border: thinBorder(),
  },
};

export type CellType = 'text' | 'int' | 'brl' | 'percent';
export type Tone = 'success' | 'warning' | 'danger';

export interface Column<T> {
  header: string;
  key: keyof T & string;
  type: CellType;
  width?: number;
  total?: 'sum' | 'weightedAvg' | 'none';
  numKey?: keyof T & string;
  denKey?: keyof T & string;
  toneFn?: (row: T) => Tone | undefined;
  bgFn?: (row: T) => string | undefined;
}

export interface SheetSpec<T> {
  name: string;
  title: string;
  columns: Column<T>[];
  rows: T[];
}

export interface ResumoBlockRow {
  label: string;
  value: number;
  kind: 'brl' | 'percent' | 'count';
}

export interface ResumoSpec {
  title: string;
  generatedAt: Date;
  blocks: Array<{ title: string; rows: ResumoBlockRow[] }>;
}

@Injectable({ providedIn: 'root' })
export class XlsxExportService {
  download(filename: string, sheets: Array<SheetSpec<any>>, resumo?: ResumoSpec): void {
    const wb = XLSX.utils.book_new();
    if (resumo) {
      const ws = this.buildResumoSheet(resumo);
      XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    }
    for (const spec of sheets) {
      const ws = this.buildDataSheet(spec);
      XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName(spec.name));
    }
    const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    XLSX.writeFile(wb, finalName);
  }

  private buildResumoSheet(spec: ResumoSpec): XLSX.WorkSheet {
    const blockCount = spec.blocks.length;
    const totalCols = Math.max(6, blockCount * 2);
    const maxRows = Math.max(...spec.blocks.map(b => b.rows.length));

    const aoa: any[][] = [];
    aoa.push([spec.title, ...Array(totalCols - 1).fill('')]);
    aoa.push([this.formatGeneratedAt(spec.generatedAt), ...Array(totalCols - 1).fill('')]);
    aoa.push(Array(totalCols).fill(''));

    const titleRow: any[] = [];
    for (const block of spec.blocks) {
      titleRow.push(block.title, '');
    }
    while (titleRow.length < totalCols) titleRow.push('');
    aoa.push(titleRow);

    for (let i = 0; i < maxRows; i++) {
      const row: any[] = [];
      for (const block of spec.blocks) {
        const r = block.rows[i];
        if (r) {
          row.push(r.label, r.value);
        } else {
          row.push('', '');
        }
      }
      while (row.length < totalCols) row.push('');
      aoa.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const merges: XLSX.Range[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    ];
    for (let b = 0; b < blockCount; b++) {
      merges.push({ s: { r: 3, c: b * 2 }, e: { r: 3, c: b * 2 + 1 } });
    }
    ws['!merges'] = merges;

    ws['!rows'] = [{ hpx: 36 }, { hpx: 22 }, { hpx: 8 }, { hpx: 28 }];

    const cols: XLSX.ColInfo[] = [];
    for (let b = 0; b < blockCount; b++) {
      cols.push({ wch: 26 }, { wch: 18 });
    }
    ws['!cols'] = cols;

    this.setStyle(ws, 0, 0, S.titleBand);
    this.setStyle(ws, 1, 0, S.subtitle);
    for (let b = 0; b < blockCount; b++) {
      this.setStyle(ws, 3, b * 2, S.resumoBlockTitle);
    }
    for (let i = 0; i < maxRows; i++) {
      const r = 4 + i;
      for (let b = 0; b < blockCount; b++) {
        const row = spec.blocks[b].rows[i];
        if (!row) continue;
        this.setStyle(ws, r, b * 2, S.resumoLabel);
        this.setStyle(ws, r, b * 2 + 1, S.resumoValue);
        const z = row.kind === 'brl' ? FMT.brl : row.kind === 'percent' ? FMT.percent : FMT.int;
        this.setNumberFormat(ws, r, b * 2 + 1, z);
      }
    }

    (ws as any)['!views'] = [{ state: 'frozen', ySplit: 4, xSplit: 0 }];
    return ws;
  }

  private buildDataSheet<T extends Record<string, any>>(spec: SheetSpec<T>): XLSX.WorkSheet {
    const colCount = spec.columns.length;
    const aoa: any[][] = [];

    aoa.push([spec.title, ...Array(colCount - 1).fill('')]);
    aoa.push([this.formatGeneratedAt(new Date()), ...Array(colCount - 1).fill('')]);
    aoa.push(Array(colCount).fill(''));
    aoa.push(spec.columns.map(c => c.header));

    const headerRowIdx = 3;
    const dataStart = headerRowIdx + 1;

    for (const row of spec.rows) {
      aoa.push(spec.columns.map(c => row[c.key] ?? ''));
    }
    const dataEnd = dataStart + spec.rows.length - 1;

    let totalsRowIdx = -1;
    const hasTotals = spec.columns.some(c => c.total && c.total !== 'none');
    if (hasTotals && spec.rows.length > 0) {
      aoa.push(Array(colCount).fill(''));
      const totalsRow: any[] = spec.columns.map((c, idx) => {
        if (idx === 0) return 'TOTAIS';
        if (!c.total || c.total === 'none') return '';
        if (c.total === 'sum') {
          return spec.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
        }
        if (c.total === 'weightedAvg' && c.numKey && c.denKey) {
          const num = spec.rows.reduce((s, r) => s + (Number(r[c.numKey as string]) || 0), 0);
          const den = spec.rows.reduce((s, r) => s + (Number(r[c.denKey as string]) || 0), 0);
          return den > 0 ? num / den : 0;
        }
        return '';
      });
      aoa.push(totalsRow);
      totalsRowIdx = aoa.length - 1;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    ];

    ws['!rows'] = [{ hpx: 28 }, { hpx: 20 }, { hpx: 8 }, { hpx: 26 }];

    ws['!cols'] = spec.columns.map((c, idx) => ({
      wch: c.width ?? this.autoColumnWidth(c, spec.rows, idx === 0),
    }));

    const lastDataRow = Math.max(dataStart, dataEnd);
    ws['!autofilter'] = {
      ref: `${XLSX.utils.encode_cell({ r: headerRowIdx, c: 0 })}:${XLSX.utils.encode_cell({ r: lastDataRow, c: colCount - 1 })}`,
    };

    (ws as any)['!views'] = [{ state: 'frozen', ySplit: dataStart, xSplit: 0 }];

    this.setStyle(ws, 0, 0, S.sheetTitle);
    this.setStyle(ws, 1, 0, S.subtitle);
    for (let c = 0; c < colCount; c++) {
      this.setStyle(ws, headerRowIdx, c, S.header);
    }

    for (let i = 0; i < spec.rows.length; i++) {
      const r = dataStart + i;
      const zebra = i % 2 === 1;
      const baseStyle = zebra ? S.cellZebra : S.cell;
      for (let c = 0; c < colCount; c++) {
        const col = spec.columns[c];
        const row = spec.rows[i];
        let style: any = { ...baseStyle };

        const tone = col.toneFn?.(row);
        if (tone) {
          const colorMap = {
            success: { fg: C.success, bg: C.successBg },
            warning: { fg: C.warning, bg: C.warningBg },
            danger: { fg: C.danger, bg: C.dangerBg },
          };
          style = {
            ...style,
            font: { ...baseStyle.font, bold: true, color: { rgb: colorMap[tone].fg } },
            fill: { fgColor: { rgb: colorMap[tone].bg } },
          };
        }

        const bg = col.bgFn?.(row);
        if (bg) {
          style = {
            ...style,
            font: { ...style.font, bold: true },
            fill: { fgColor: { rgb: bg } },
            alignment: { ...(style.alignment ?? {}), horizontal: 'center' as const },
          };
        }

        if (col.type !== 'text') {
          style = { ...style, alignment: { ...(style.alignment ?? {}), horizontal: 'right' as const } };
        } else if (!bg) {
          const horizontal = c === 0 ? 'left' as const : 'left' as const;
          style = { ...style, alignment: { ...(style.alignment ?? {}), horizontal, indent: c === 0 ? 1 : 0 } };
        }

        this.setStyle(ws, r, c, style);
        this.setNumberFormat(ws, r, c, this.fmtFor(col.type));
      }
    }

    if (totalsRowIdx >= 0) {
      for (let c = 0; c < colCount; c++) {
        const col = spec.columns[c];
        const align = col.type === 'text' ? 'left' as const : 'right' as const;
        const indent = c === 0 ? 1 : 0;
        const style = {
          ...S.totals,
          alignment: { ...S.totals.alignment, horizontal: align, indent },
        };
        this.setStyle(ws, totalsRowIdx, c, style);
        if (c > 0 && col.total && col.total !== 'none') {
          this.setNumberFormat(ws, totalsRowIdx, c, this.fmtFor(col.type));
        }
      }
    }

    return ws;
  }

  private setStyle(ws: XLSX.WorkSheet, r: number, c: number, style: any): void {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr] ?? { t: 's', v: '' };
    (cell as any).s = style;
    ws[addr] = cell;
  }

  private setNumberFormat(ws: XLSX.WorkSheet, r: number, c: number, z: string | undefined): void {
    if (!z) return;
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (!cell) return;
    if (typeof cell.v === 'number') {
      (cell as any).z = z;
      (cell as any).t = 'n';
    }
  }

  private fmtFor(type: CellType): string | undefined {
    switch (type) {
      case 'brl': return FMT.brl;
      case 'percent': return FMT.percent;
      case 'int': return FMT.int;
      default: return undefined;
    }
  }

  private autoColumnWidth<T>(col: Column<T>, rows: T[], firstCol: boolean): number {
    const max = rows.reduce((m, r) => {
      const v = (r as any)[col.key];
      const s = v == null ? '' : String(v);
      return Math.max(m, s.length);
    }, col.header.length);
    const padding = firstCol ? 4 : 2;
    return Math.max(10, Math.min(40, max + padding));
  }

  private sanitizeSheetName(name: string): string {
    const cleaned = name.replace(/[\[\]\*\/\\\?:]/g, ' ').slice(0, 31).trim();
    return cleaned.length > 0 ? cleaned : 'Sheet';
  }

  private formatGeneratedAt(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const dd = pad(d.getDate());
    const mm = pad(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `Gerado em ${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }
}
