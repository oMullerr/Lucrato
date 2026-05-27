import { Injectable } from '@angular/core';

/**
 * Lightweight CSV export — UTF-8 BOM + `;` separator for Excel pt-BR compatibility.
 * Numbers formatted with comma decimal.
 */
@Injectable({ providedIn: 'root' })
export class CsvExportService {
  /**
   * Download `rows` as a CSV file named `filename`.
   * `headers` are the column labels (also used as row keys unless `keys` is provided).
   */
  download(filename: string, headers: string[], rows: Array<Record<string, unknown>>, keys?: string[]): void {
    const cols = keys ?? headers;
    const lines: string[] = [];
    lines.push(headers.map(this.escape).join(';'));
    for (const row of rows) {
      lines.push(cols.map(k => this.escape(this.formatCell(row[k]))).join(';'));
    }
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Convert any value to its CSV-cell representation. */
  private formatCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      // Brazilian locale: comma decimal, 2 decimals when fractional
      return Number.isInteger(value)
        ? String(value)
        : value.toFixed(2).replace('.', ',');
    }
    if (value instanceof Date) {
      const d = String(value.getDate()).padStart(2, '0');
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const y = value.getFullYear();
      return `${d}/${m}/${y}`;
    }
    return String(value);
  }

  /** Escape a CSV cell — wrap in quotes if it contains `;`, `"`, or newline. */
  private escape = (value: string): string => {
    if (/[;"\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
}
