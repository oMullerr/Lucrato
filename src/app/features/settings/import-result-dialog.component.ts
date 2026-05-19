import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ImportResultDialogData {
  purchaseCount: number;
  saleCount: number;
  errors: string[];
}

@Component({
  selector: 'app-import-result-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon [class.warn]="data.errors.length > 0">
        {{ data.errors.length ? 'warning' : 'check_circle' }}
      </mat-icon>
      Resultado da Importação
    </h2>
    <mat-dialog-content>
      <p class="summary">
        <strong>{{ data.purchaseCount }}</strong>
        {{ data.purchaseCount === 1 ? 'compra' : 'compras' }} e
        <strong>{{ data.saleCount }}</strong>
        {{ data.saleCount === 1 ? 'venda' : 'vendas' }} importadas com sucesso.
      </p>
      @if (data.errors.length > 0) {
        <p class="errors-title">Linhas ignoradas ({{ data.errors.length }}):</p>
        <ul class="errors-list">
          @for (err of data.errors; track $index) {
            <li>{{ err }}</li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" (click)="ref.close()" cdkFocusInitial>
        Fechar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 { display: flex; align-items: center; gap: 10px; }
    h2 mat-icon { color: var(--clr-blue); }
    h2 mat-icon.warn { color: #f59e0b; }
    .summary { color: var(--txt-primary); margin: 0 0 12px; line-height: 1.5; }
    .errors-title { font-size: 13px; color: var(--txt-secondary); margin: 0 0 8px; font-weight: 600; }
    .errors-list {
      margin: 0;
      padding-left: 16px;
      font-size: 13px;
      color: var(--txt-secondary);
      line-height: 1.7;
      max-height: 260px;
      overflow-y: auto;
    }
  `],
})
export class ImportResultDialogComponent {
  readonly ref = inject(MatDialogRef);
  readonly data = inject<ImportResultDialogData>(MAT_DIALOG_DATA);
}
