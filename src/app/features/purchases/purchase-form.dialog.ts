import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Purchase } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

export interface PurchaseDialogData {
  purchase?: Purchase;
}

@Component({
  selector: 'app-purchase-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatDatepickerModule, BrlPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ isEdit() ? 'edit' : 'add_circle' }}</mat-icon>
      {{ isEdit() ? 'Editar Compra' : 'Nova Compra' }}
    </h2>

    <mat-dialog-content>
      <form #form="ngForm" class="form-grid">
        <mat-form-field>
          <mat-label>ID Lote</mat-label>
          <input
            matInput
            [ngModel]="model().id"
            (ngModelChange)="set('id', $event)"
            name="id"
            required
            pattern="C[0-9]{3,}"
            [readonly]="isEdit()"
          />
          <mat-hint>Formato: C001, C002...</mat-hint>
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Produto</mat-label>
          <input matInput
            [ngModel]="model().product"
            (ngModelChange)="set('product', $event)"
            name="product" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Categoria</mat-label>
          <mat-select
            [ngModel]="model().category"
            (ngModelChange)="set('category', $event)"
            name="category" required>
            @for (cat of categories(); track cat) {
              <mat-option [value]="cat">{{ cat }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Fornecedor</mat-label>
          <mat-select
            [ngModel]="model().supplier"
            (ngModelChange)="set('supplier', $event)"
            name="supplier" required>
            @for (s of suppliers(); track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data da Compra</mat-label>
          <input
            matInput
            [matDatepicker]="pickerPurchase"
            [ngModel]="purchaseDateAsDate()"
            (ngModelChange)="setPurchaseDate($event)"
            name="purchaseDate"
            required
          />
          <mat-datepicker-toggle matIconSuffix [for]="pickerPurchase"></mat-datepicker-toggle>
          <mat-datepicker #pickerPurchase></mat-datepicker>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data de Recebimento (opcional)</mat-label>
          <input
            matInput
            [matDatepicker]="pickerReceipt"
            [ngModel]="receiptDateAsDate()"
            (ngModelChange)="setReceiptDate($event)"
            name="receiptDate"
          />
          <mat-datepicker-toggle matIconSuffix [for]="pickerReceipt"></mat-datepicker-toggle>
          <mat-datepicker #pickerReceipt></mat-datepicker>
          <mat-hint>O prazo de alerta conta a partir desta data.</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Quantidade Comprada</mat-label>
          <input matInput type="number"
            [ngModel]="model().quantityPurchased"
            (ngModelChange)="setNum('quantityPurchased', $event)"
            name="quantityPurchased" min="1" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Custo Unitário (R$)</mat-label>
          <input matInput type="number" step="0.01"
            [ngModel]="model().unitCost"
            (ngModelChange)="setNum('unitCost', $event)"
            name="unitCost" min="0" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Frete da Compra (R$)</mat-label>
          <input matInput type="number" step="0.01"
            [ngModel]="model().purchaseShipping"
            (ngModelChange)="setNum('purchaseShipping', $event)"
            name="purchaseShipping" min="0" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Outros Custos (R$)</mat-label>
          <input matInput type="number" step="0.01"
            [ngModel]="model().otherCosts"
            (ngModelChange)="setNum('otherCosts', $event)"
            name="otherCosts" min="0" />
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Link da Compra (opcional)</mat-label>
          <input matInput type="url"
            [ngModel]="model().link"
            (ngModelChange)="set('link', $event)"
            name="link" placeholder="https://..." />
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Observações</mat-label>
          <textarea matInput rows="2"
            [ngModel]="model().notes"
            (ngModelChange)="set('notes', $event)"
            name="notes"></textarea>
        </mat-form-field>
      </form>

      <div class="preview">
        <div class="preview-title">
          <mat-icon>calculate</mat-icon>
          Cálculo automático
        </div>
        <div class="preview-stats">
          <div>
            <span>Custo Total</span>
            <strong>{{ totalPurchaseCost() | brl }}</strong>
          </div>
          <div>
            <span>Custo Total Real</span>
            <strong>{{ totalActualCost() | brl }}</strong>
          </div>
          <div>
            <span>Custo Unit. Real</span>
            <strong>{{ actualUnitCost() | brl }}</strong>
          </div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!isValid()">
        <mat-icon>save</mat-icon>
        {{ isEdit() ? 'Salvar' : 'Adicionar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 { display: flex; align-items: center; gap: 10px; }
    h2 mat-icon { color: var(--clr-blue); }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding-top: 8px;
    }

    .form-grid .full { grid-column: 1 / -1; }

    .preview {
      margin-top: 16px;
      padding: 16px;
      background: var(--bg-blue);
      border: 1px solid var(--clr-blue);
      border-radius: 10px;
    }

    .preview-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--clr-blue);
      margin-bottom: 12px;
      letter-spacing: 0.3px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .preview-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .preview-stats > div {
      display: flex;
      flex-direction: column;
    }

    .preview-stats span {
      font-size: 11px;
      color: var(--txt-secondary);
    }

    .preview-stats strong {
      font-size: 15px;
      color: var(--clr-blue);
      margin-top: 2px;
    }

    @media (max-width: 600px) {
      .form-grid { grid-template-columns: 1fr; }
      .preview-stats { grid-template-columns: 1fr; }
    }
  `]
})
export class PurchaseFormDialogComponent {
  private readonly dataService = inject(DataService);
  protected readonly ref = inject<MatDialogRef<PurchaseFormDialogComponent, Purchase | null>>(MatDialogRef);
  private readonly data = inject<PurchaseDialogData>(MAT_DIALOG_DATA);

  protected readonly isEdit = signal(!!this.data.purchase);
  protected readonly model = signal<Purchase>(this.initialModel());

  protected readonly categories = computed(() => this.dataService.settings()?.categories ?? []);
  protected readonly suppliers = computed(() => this.dataService.settings()?.suppliers ?? []);

  protected readonly totalPurchaseCost = computed(() =>
    (this.model().quantityPurchased ?? 0) * (this.model().unitCost ?? 0)
  );
  protected readonly totalActualCost = computed(() =>
    this.totalPurchaseCost() + (this.model().purchaseShipping ?? 0) + (this.model().otherCosts ?? 0)
  );
  protected readonly actualUnitCost = computed(() => {
    const m = this.model();
    return m.quantityPurchased > 0 ? this.totalActualCost() / m.quantityPurchased : 0;
  });

  protected readonly purchaseDateAsDate = computed(() => {
    const s = this.model().purchaseDate;
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return !y || !m || !d ? null : new Date(y, m - 1, d);
  });

  protected readonly receiptDateAsDate = computed(() => {
    const s = this.model().receiptDate;
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return !y || !m || !d ? null : new Date(y, m - 1, d);
  });

  protected set(field: string, value: unknown): void {
    this.model.update(m => ({ ...m, [field]: value }));
  }

  protected setNum(field: string, value: string | number | null): void {
    this.model.update(m => ({ ...m, [field]: +(value ?? 0) || 0 }));
  }

  protected setPurchaseDate(d: Date | null): void {
    const newStr = this.dateAsString(d);
    if (newStr === this.model().purchaseDate) return;
    this.model.update(m => ({ ...m, purchaseDate: newStr }));
  }

  protected setReceiptDate(d: Date | null): void {
    const newStr = this.dateAsString(d);
    if (newStr === this.model().receiptDate) return;
    this.model.update(m => ({ ...m, receiptDate: newStr }));
  }

  private dateAsString(d: Date | null): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  protected isValid(): boolean {
    const m = this.model();
    return !!(m.id && m.product && m.category && m.supplier &&
              m.purchaseDate && m.quantityPurchased > 0 && m.unitCost >= 0);
  }

  protected save(): void {
    if (!this.isValid()) return;
    this.ref.close({ ...this.model() });
  }

  private initialModel(): Purchase {
    if (this.data.purchase) return { ...this.data.purchase };
    const cfg = this.dataService.settings();
    return {
      id: this.dataService.nextPurchaseId(),
      product: '',
      category: cfg?.categories[0] ?? 'Eletrônicos',
      supplier: cfg?.suppliers[0] ?? 'Amazon BR',
      link: '',
      purchaseDate: new Date().toISOString().split('T')[0]!,
      receiptDate: '',
      quantityPurchased: 1,
      unitCost: 0,
      purchaseShipping: cfg?.defaultShipping ?? 0,
      otherCosts: 0,
      notes: '',
    };
  }
}
