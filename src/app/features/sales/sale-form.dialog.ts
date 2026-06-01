import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Sale } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { calculateSale } from '../../core/services/calculations';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { CurrencyInputDirective } from '../../shared/directives/currency-input.directive';

export interface SaleDialogData {
  sale?: Sale;
}

@Component({
  selector: 'app-sale-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatTooltipModule,
    MatDatepickerModule, MatSlideToggleModule, BrlPipe,
    CurrencyInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ isEdit() ? 'edit' : 'sell' }}</mat-icon>
      <span class="title-text">{{ isEdit() ? 'Editar Venda' : 'Nova Venda' }}</span>
      <span class="id-badge" matTooltip="ID gerado automaticamente">{{ model().id }}</span>
    </h2>

    <mat-dialog-content>
      <form #form="ngForm" class="form-grid">
        <mat-form-field class="full">
          <mat-label>ID Lote (da aba Compras)</mat-label>
          <mat-select
            [ngModel]="model().batchId"
            (ngModelChange)="onBatchIdChange($event)"
            name="batchId"
            cdkFocusInitial
            required
          >
            @for (batch of availableBatches(); track batch.id) {
              <mat-option [value]="batch.id">
                {{ batch.id }} — {{ batch.product }}
                @if (batch.currentStock <= 0) {
                  (esgotado)
                } @else {
                  ({{ batch.currentStock }} disp.)
                }
              </mat-option>
            }
            @if (availableBatches().length === 0) {
              <mat-option disabled>
                Nenhum lote disponível. Cadastre uma compra com Data de Recebimento preenchida.
              </mat-option>
            }
          </mat-select>
          @if (!hasBatch()) {
            <mat-hint>Selecione o lote para liberar os demais campos</mat-hint>
          }
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Produto</mat-label>
          <input matInput [value]="model().product" name="product" readonly />
          <mat-hint>Preenchido automaticamente pelo lote</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data da Venda</mat-label>
          <input
            matInput
            [matDatepicker]="pickerSale"
            [ngModel]="saleDateAsDate()"
            (ngModelChange)="setSaleDate($event)"
            [disabled]="!hasBatch()"
            name="saleDate"
            [min]="minSaleDate()"
            required
          />
          <mat-datepicker-toggle matIconSuffix [for]="pickerSale" [disabled]="!hasBatch()"></mat-datepicker-toggle>
          <mat-datepicker #pickerSale></mat-datepicker>
          @if (saleBeforePurchase()) {
            <mat-hint class="error-hint">
              Não pode ser anterior à data da compra do lote
            </mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Canal</mat-label>
          <mat-select
            [ngModel]="model().channel"
            (ngModelChange)="set('channel', $event)"
            [disabled]="!hasBatch()"
            name="channel" required>
            @for (c of channels(); track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Qtd. Vendida</mat-label>
          <input matInput type="number"
            [ngModel]="model().quantitySold"
            (ngModelChange)="setNum('quantitySold', $event)"
            [disabled]="!hasBatch()"
            name="quantitySold" min="1" required />
          @if (exceedsStock()) {
            <mat-hint class="error-hint">
              Excede o estoque: máximo {{ maxAvailable() }} un. disponíveis
            </mat-hint>
          } @else if (maxAvailable() !== null) {
            <mat-hint>Disponível: {{ maxAvailable() }} un.</mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Preço Unitário</mat-label>
          <span matTextPrefix>R$&nbsp;</span>
          <input matInput appCurrencyInput inputmode="numeric"
            [ngModel]="model().unitPrice"
            (ngModelChange)="setNum('unitPrice', $event)"
            [disabled]="!hasBatch()"
            name="unitPrice" required />
        </mat-form-field>

        <!-- Taxa customizada -->
        <div class="taxa-field full">
          <div class="taxa-header">
            <span class="taxa-label">
              <mat-icon>local_offer</mat-icon>
              Taxa Mercado Livre (%)
            </span>
            <button
              type="button"
              mat-icon-button
              (click)="resetFee()"
              [disabled]="!hasBatch()"
              matTooltip="Resetar para padrão ({{ (defaultFee() * 100).toFixed(1) }}%)"
            >
              <mat-icon>restart_alt</mat-icon>
            </button>
          </div>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <input
              matInput
              type="number"
              step="0.01"
              min="0"
              max="100"
              [(ngModel)]="feeInput"
              name="feeInput"
              (ngModelChange)="onFeeChange()"
              [disabled]="!hasBatch()"
              required
            />
            <span matSuffix class="percent-suffix">%</span>
          </mat-form-field>
          <small class="taxa-hint">
            Padrão: {{ (defaultFee() * 100).toFixed(1) }}% · Edite para essa venda específica
          </small>
        </div>

        <!-- Shipping type toggle -->
        <div class="shipping-toggle full">
          <mat-icon>local_shipping</mat-icon>
          <span [class.active]="!isFlexShipping()">Correios</span>
          <mat-slide-toggle
            [checked]="isFlexShipping()"
            (change)="setShippingType($event.checked)"
            [disabled]="!hasBatch()"
            color="primary"
          ></mat-slide-toggle>
          <span [class.active]="isFlexShipping()">Flex</span>
        </div>

        @if (!isFlexShipping()) {
          <mat-form-field>
            <mat-label>Frete Vendedor</mat-label>
            <span matTextPrefix>R$&nbsp;</span>
            <input matInput appCurrencyInput inputmode="numeric"
              [ngModel]="model().sellerShipping"
              (ngModelChange)="setNum('sellerShipping', $event)"
              [disabled]="!hasBatch()"
              name="sellerShipping" />
          </mat-form-field>
        } @else {
          <mat-form-field>
            <mat-label>Estorno Envio Flex</mat-label>
            <span matTextPrefix>R$&nbsp;</span>
            <input matInput appCurrencyInput inputmode="numeric"
              [ngModel]="model().flexRefund ?? 0"
              (ngModelChange)="setNum('flexRefund', $event)"
              [disabled]="!hasBatch()"
              name="flexRefund" />
            <mat-hint>Valor devolvido pelo ML — somado à receita</mat-hint>
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>Desconto / Cupom</mat-label>
          <span matTextPrefix>R$&nbsp;</span>
          <input matInput appCurrencyInput inputmode="numeric"
            [ngModel]="model().discount"
            (ngModelChange)="setNum('discount', $event)"
            [disabled]="!hasBatch()"
            name="discount" />
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Outros Custos</mat-label>
          <span matTextPrefix>R$&nbsp;</span>
          <input matInput appCurrencyInput inputmode="numeric"
            [ngModel]="model().otherCosts"
            (ngModelChange)="setNum('otherCosts', $event)"
            [disabled]="!hasBatch()"
            name="otherCosts" />
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Observações</mat-label>
          <textarea matInput rows="2"
            [ngModel]="model().notes"
            (ngModelChange)="set('notes', $event)"
            [disabled]="!hasBatch()"
            name="notes"></textarea>
        </mat-form-field>
      </form>

      <!-- Preview -->
      <div class="preview">
        <div class="preview-title">
          <mat-icon>calculate</mat-icon>
          Resultado calculado
        </div>
        <div class="preview-stats">
          <div>
            <span>Receita Bruta</span>
            <strong class="text-info">{{ preview().grossRevenue | brl }}</strong>
          </div>
          <div>
            <span>Taxa L</span>
            <strong class="text-warning">- {{ preview().feeAmount | brl }}</strong>
          </div>
          <div>
            <span>Receita Líquida</span>
            <strong>{{ preview().netRevenue | brl }}</strong>
          </div>
          <div>
            <span>Custo Produto</span>
            <strong class="text-danger">- {{ preview().proportionalCost | brl }}</strong>
          </div>
          <div>
            <span>Lucro Líquido</span>
            <strong [class]="profitClass()">
              {{ preview().netProfit | brl }}
            </strong>
          </div>
          <div>
            <span>Margem Líquida</span>
            <strong [class]="marginClass()">
              {{ (preview().netMargin * 100).toFixed(1) }}%
            </strong>
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
    h2 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Geist', 'Inter', sans-serif;
      font-weight: 600;
      letter-spacing: -0.015em;
    }
    h2 mat-icon { color: var(--brand-primary); }

    .id-badge {
      margin-left: auto;
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--text-muted);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: 999px;
      padding: 4px 12px;
      font-variant-numeric: tabular-nums;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding-top: 8px;
      align-items: start;
    }

    .form-grid .full { grid-column: 1 / -1; }

    .shipping-toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);

      mat-icon { color: var(--text-secondary); font-size: 20px; width: 20px; height: 20px; }

      span {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-muted);
        transition: color var(--dur-fast) var(--ease-out);
      }

      span.active { color: var(--text-primary); font-weight: 600; }
    }

    .taxa-field {
      padding: 14px 16px;
      background: var(--tint-warning);
      border: 1px solid color-mix(in srgb, var(--color-warning) 25%, transparent);
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .taxa-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .taxa-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-warning);

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .taxa-hint {
      font-size: 11px;
      color: var(--color-warning);
    }

    .taxa-field .percent-suffix {
      margin-right: 12px;
    }

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

      mat-icon { font-size: 16px; width: 16px; height: 16px; }
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
export class SaleFormDialogComponent {
  private readonly dataService = inject(DataService);
  protected readonly ref = inject<MatDialogRef<SaleFormDialogComponent, Sale | null>>(MatDialogRef);
  private readonly data = inject<SaleDialogData>(MAT_DIALOG_DATA);

  protected readonly isEdit = signal(!!this.data.sale);
  protected readonly model = signal<Sale>(this.initialModel());
  protected feeInput = (this.data.sale?.feePercentage ?? this.dataService.settings()?.defaultMlFee ?? 0.12) * 100;

  protected readonly isFlexShipping = computed(() => this.model().shippingType === 'flex');
  protected readonly hasBatch = computed(() => !!this.model().batchId);

  protected setShippingType(isFlex: boolean): void {
    this.model.update(m => ({ ...m, shippingType: isFlex ? 'flex' : 'correios' }));
  }

  protected readonly channels = computed(() => this.dataService.settings()?.channels ?? []);
  protected readonly defaultFee = computed(() => this.dataService.settings()?.defaultMlFee ?? 0.12);

  protected readonly availableBatches = computed(() => {
    const editingBatchId = this.isEdit() ? this.model().batchId : null;
    return this.dataService.computedPurchases().filter(c => {
      const eligible = c.currentStock > 0
                    && c.status !== 'Em trânsito'
                    && c.status !== 'Vendido';
      const preservedForEdit = editingBatchId !== null && c.id === editingBatchId;
      return eligible || preservedForEdit;
    });
  });

  protected readonly maxAvailable = computed(() => {
    const m = this.model();
    if (!m.batchId) return null;
    const batch = this.dataService.purchases().find(p => p.id === m.batchId);
    if (!batch) return null;

    const editingSaleId = this.isEdit() ? (this.data.sale?.id ?? null) : null;
    const usedByOthers = this.dataService.sales()
      .filter(s => s.batchId === m.batchId
                && s.status === 'Concluída'
                && s.id !== editingSaleId)
      .reduce((sum, s) => sum + s.quantitySold, 0);

    return batch.quantityPurchased - usedByOthers;
  });

  protected readonly exceedsStock = computed(() => {
    const m = this.model();
    if (m.status !== 'Concluída') return false;
    const max = this.maxAvailable();
    if (max === null) return false;
    return m.quantitySold > max;
  });

  protected readonly minSaleDate = computed(() => {
    const m = this.model();
    if (!m.batchId) return null;
    const batch = this.dataService.purchases().find(p => p.id === m.batchId);
    if (!batch?.purchaseDate) return null;
    const [y, mo, d] = batch.purchaseDate.split('-').map(Number);
    return !y || !mo || !d ? null : new Date(y, mo - 1, d);
  });

  protected readonly saleBeforePurchase = computed(() => {
    const m = this.model();
    if (!m.saleDate || !m.batchId) return false;
    const batch = this.dataService.purchases().find(p => p.id === m.batchId);
    if (!batch?.purchaseDate) return false;
    return m.saleDate < batch.purchaseDate;
  });

  protected readonly preview = computed(() => {
    return calculateSale(this.model(), this.dataService.purchases());
  });

  protected profitClass(): string {
    const p = this.preview().netProfit;
    return p < 0 ? 'text-danger' : p > 0 ? 'text-success' : '';
  }

  protected marginClass(): string {
    const m = this.preview().netMargin;
    if (m < 0) return 'text-danger';
    const cfg = this.dataService.settings();
    if (cfg && m < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }

  protected onFeeChange(): void {
    const clamped = Math.max(0, this.feeInput || 0);
    if (clamped !== this.feeInput) this.feeInput = clamped;
    this.model.update(m => ({ ...m, feePercentage: clamped / 100 }));
  }

  protected resetFee(): void {
    this.feeInput = this.defaultFee() * 100;
    this.onFeeChange();
  }

  protected readonly saleDateAsDate = computed(() => {
    const s = this.model().saleDate;
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return !y || !m || !d ? null : new Date(y, m - 1, d);
  });

  protected setSaleDate(d: Date | null): void {
    const newStr = this.dateAsString(d);
    if (newStr === this.model().saleDate) return;
    this.model.update(m => ({ ...m, saleDate: newStr }));
  }

  private dateAsString(d: Date | null): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  protected set(field: string, value: unknown): void {
    this.model.update(m => ({ ...m, [field]: value }));
  }

  protected setNum(field: string, value: string | number | null): void {
    const num = +(value ?? 0) || 0;
    this.model.update(m => ({ ...m, [field]: Math.max(0, num) }));
  }

  protected onBatchIdChange(batchId: string): void {
    const batch = this.dataService.findPurchase(batchId);
    this.model.update(m => ({ ...m, batchId, product: batch?.product ?? m.product }));
  }

  protected isValid(): boolean {
    const m = this.model();
    if (!(m.id && m.batchId && m.product && m.quantitySold > 0 &&
          m.unitPrice > 0 && m.saleDate && m.channel && m.status)) {
      return false;
    }

    if (!this.isEdit()) {
      const batch = this.dataService.computedPurchases().find(c => c.id === m.batchId);
      if (!batch) return false;
      if (batch.status === 'Em trânsito' || batch.status === 'Vendido') return false;
    }

    if (this.exceedsStock()) return false;
    if (this.saleBeforePurchase()) return false;

    if (m.unitPrice < 0 || m.feePercentage < 0 ||
        m.sellerShipping < 0 || (m.flexRefund ?? 0) < 0 ||
        m.discount < 0 || m.otherCosts < 0) {
      return false;
    }

    return true;
  }

  protected save(): void {
    if (!this.isValid()) return;
    this.ref.close({ ...this.model() });
  }

  private initialModel(): Sale {
    if (this.data.sale) return { ...this.data.sale, status: 'Concluída' };
    const cfg = this.dataService.settings();
    return {
      id: this.dataService.nextSaleId(),
      batchId: '',
      product: '',
      quantitySold: 1,
      unitPrice: 0,
      saleDate: new Date().toISOString().split('T')[0]!,
      channel: cfg?.defaultChannel ?? 'Mercado Livre',
      feePercentage: cfg?.defaultMlFee ?? 0.12,
      shippingType: 'correios',
      sellerShipping: 0,
      flexRefund: 0,
      discount: 0,
      otherCosts: 0,
      status: 'Concluída',
      notes: '',
    };
  }
}
