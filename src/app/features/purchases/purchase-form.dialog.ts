import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Purchase } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { CurrencyInputDirective } from '../../shared/directives/currency-input.directive';

export interface PurchaseDialogData {
  purchase?: Purchase;
}

@Component({
  selector: 'app-purchase-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatDatepickerModule, MatTooltipModule, BrlPipe,
    CurrencyInputDirective,
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
            [min]="purchaseDateAsDate()"
            [max]="today"
            name="receiptDate"
          />
          <mat-datepicker-toggle matIconSuffix [for]="pickerReceipt"></mat-datepicker-toggle>
          <mat-datepicker #pickerReceipt></mat-datepicker>
          @if (receiptDateInFuture()) {
            <mat-hint class="error-hint">A data de recebimento não pode ser maior que hoje.</mat-hint>
          } @else {
            <mat-hint>O prazo de alerta conta a partir desta data.</mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Quantidade Comprada</mat-label>
          <input matInput type="number" step="1" inputmode="numeric"
            [ngModel]="model().quantityPurchased"
            (ngModelChange)="setInt('quantityPurchased', $event, 1)"
            name="quantityPurchased" min="1" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Custo Unitário</mat-label>
          <span matTextPrefix>R$&nbsp;</span>
          <input matInput appCurrencyInput inputmode="numeric"
            [ngModel]="model().unitCost"
            (ngModelChange)="setNum('unitCost', $event)"
            name="unitCost" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Frete da Compra</mat-label>
          <span matTextPrefix>R$&nbsp;</span>
          <input matInput appCurrencyInput inputmode="numeric"
            [ngModel]="model().purchaseShipping"
            (ngModelChange)="setNum('purchaseShipping', $event)"
            name="purchaseShipping" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Outros Custos</mat-label>
          <span matTextPrefix>R$&nbsp;</span>
          <input matInput appCurrencyInput inputmode="numeric"
            [ngModel]="model().otherCosts"
            (ngModelChange)="setNum('otherCosts', $event)"
            name="otherCosts" />
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
      <button
        mat-flat-button
        color="primary"
        (click)="save()"
        [disabled]="!isValid()"
        [matTooltip]="isValid() ? '' : 'Preencha todos os campos obrigatórios'"
        matTooltipPosition="above"
      >
        <mat-icon>save</mat-icon>
        {{ isEdit() ? 'Salvar' : 'Adicionar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Geist', 'Inter', sans-serif;
      font-weight: 600;
      letter-spacing: -0.015em;
    }
    h2 mat-icon { color: var(--brand-primary); }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding-top: 8px;
      align-items: start;
    }

    .form-grid .full { grid-column: 1 / -1; }

    .preview {
      margin-top: 16px;
      padding: 18px;
      background: linear-gradient(135deg, var(--bg-surface-2) 0%, var(--tint-brand) 100%);
      border: 1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent);
      border-radius: var(--radius-lg);
    }

    .preview-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--brand-primary);
      margin-bottom: 14px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .preview-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }

    .preview-stats > div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .preview-stats span {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .preview-stats strong {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      margin-top: 2px;
    }

    .error-hint {
      color: var(--color-danger) !important;
      font-weight: 600;
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

  /** Upper bound for the receipt-date picker — disables any date after today. */
  protected readonly today = (() => {
    const t = new Date();
    t.setHours(23, 59, 59, 999);
    return t;
  })();

  /** True when the current receiptDate is strictly in the future. */
  protected readonly receiptDateInFuture = computed(() => {
    const r = this.model().receiptDate;
    if (!r) return false;
    return r > this.dateAsString(new Date());
  });

  protected set(field: string, value: unknown): void {
    this.model.update(m => ({ ...m, [field]: value }));
  }

  protected setNum(field: string, value: string | number | null, min = 0): void {
    const num = +(value ?? 0) || 0;
    this.model.update(m => ({ ...m, [field]: Math.max(min, num) }));
  }

  protected setInt(field: string, value: string | number | null, min = 0): void {
    const num = Math.floor(+(value ?? 0) || 0);
    this.model.update(m => ({ ...m, [field]: Math.max(min, num) }));
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

  private readonly idPattern = /^C\d{3,}$/;

  protected readonly isValid = computed<boolean>(() => {
    const m = this.model();
    if (!m.id || !this.idPattern.test(m.id)) return false;
    if (!m.product || m.product.trim().length === 0) return false;
    if (!m.category || !m.supplier || !m.purchaseDate) return false;
    if (m.quantityPurchased < 1 || !Number.isInteger(m.quantityPurchased)) return false;
    if (m.unitCost <= 0) return false;
    if (m.receiptDate && m.receiptDate < m.purchaseDate) return false;
    if (m.receiptDate && m.receiptDate > this.dateAsString(new Date())) return false;
    return true;
  });

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
