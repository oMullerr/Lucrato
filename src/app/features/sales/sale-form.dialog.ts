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
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ isEdit() ? 'edit' : 'sell' }}</mat-icon>
      {{ isEdit() ? 'Editar Venda' : 'Nova Venda' }}
    </h2>

    <mat-dialog-content>
      <form #form="ngForm" class="form-grid">
        <mat-form-field>
          <mat-label>ID Venda</mat-label>
          <input
            matInput
            [ngModel]="model().id"
            (ngModelChange)="set('id', $event)"
            name="id"
            required
            pattern="V[0-9]{3,}"
            [readonly]="isEdit()"
          />
          <mat-hint>Formato: V001, V002...</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>ID Lote (da aba Compras)</mat-label>
          <mat-select
            [ngModel]="model().batchId"
            (ngModelChange)="onBatchIdChange($event)"
            name="batchId"
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
            name="saleDate"
            required
          />
          <mat-datepicker-toggle matIconSuffix [for]="pickerSale"></mat-datepicker-toggle>
          <mat-datepicker #pickerSale></mat-datepicker>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Canal</mat-label>
          <mat-select
            [ngModel]="model().channel"
            (ngModelChange)="set('channel', $event)"
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
            name="quantitySold" min="1" required />
          @if (availableStock() !== null) {
            <mat-hint>Disponível: {{ availableStock() }} un.</mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Preço Unitário (R$)</mat-label>
          <input matInput type="number" step="0.01"
            [ngModel]="model().unitPrice"
            (ngModelChange)="setNum('unitPrice', $event)"
            name="unitPrice" min="0.01" required />
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
              required
            />
            <span matSuffix>%</span>
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
            color="primary"
          ></mat-slide-toggle>
          <span [class.active]="isFlexShipping()">Flex</span>
        </div>

        @if (!isFlexShipping()) {
          <mat-form-field>
            <mat-label>Frete Vendedor (R$)</mat-label>
            <input matInput type="number" step="0.01"
              [ngModel]="model().sellerShipping"
              (ngModelChange)="setNum('sellerShipping', $event)"
              name="sellerShipping" min="0" />
          </mat-form-field>
        } @else {
          <mat-form-field>
            <mat-label>Estorno Envio Flex (R$)</mat-label>
            <input matInput type="number" step="0.01"
              [ngModel]="model().flexRefund ?? 0"
              (ngModelChange)="setNum('flexRefund', $event)"
              name="flexRefund" min="0" />
            <mat-hint>Valor devolvido pelo ML — somado à receita</mat-hint>
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>Desconto / Cupom (R$)</mat-label>
          <input matInput type="number" step="0.01"
            [ngModel]="model().discount"
            (ngModelChange)="setNum('discount', $event)"
            name="discount" min="0" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Outros Custos (R$)</mat-label>
          <input matInput type="number" step="0.01"
            [ngModel]="model().otherCosts"
            (ngModelChange)="setNum('otherCosts', $event)"
            name="otherCosts" min="0" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Status</mat-label>
          <mat-select
            [ngModel]="model().status"
            (ngModelChange)="set('status', $event)"
            name="status" required>
            <mat-option value="Concluída">Concluída</mat-option>
            <mat-option value="Cancelada">Cancelada</mat-option>
            <mat-option value="Devolvida">Devolvida</mat-option>
            <mat-option value="Em disputa">Em disputa</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Observações</mat-label>
          <textarea matInput rows="2"
            [ngModel]="model().notes"
            (ngModelChange)="set('notes', $event)"
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
    h2 { display: flex; align-items: center; gap: 10px; }
    h2 mat-icon { color: var(--clr-green); }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding-top: 8px;
    }

    .form-grid .full { grid-column: 1 / -1; }

    .shipping-toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: var(--bg-elevated-2);
      border-radius: 10px;

      mat-icon { color: var(--txt-secondary); font-size: 20px; width: 20px; height: 20px; }

      span {
        font-size: 13px;
        font-weight: 500;
        color: var(--txt-secondary);
        transition: color 0.2s;
      }

      span.active { color: var(--txt-primary); font-weight: 600; }
    }

    .taxa-field {
      padding: 12px 16px;
      background: var(--bg-amber);
      border: 1px solid var(--clr-amber);
      border-radius: 10px;
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
      color: var(--clr-amber);

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .taxa-hint {
      font-size: 11px;
      color: var(--clr-amber);
    }

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

      mat-icon { font-size: 16px; width: 16px; height: 16px; }
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
      font-size: 14px;
      margin-top: 2px;
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

  protected readonly availableStock = computed(() => {
    const batchId = this.model().batchId;
    if (!batchId) return null;
    const batch = this.dataService.computedPurchases().find(c => c.id === batchId);
    return batch ? batch.currentStock : null;
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
    this.model.update(m => ({ ...m, feePercentage: (this.feeInput || 0) / 100 }));
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
    this.model.update(m => ({ ...m, [field]: +(value ?? 0) || 0 }));
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

    return true;
  }

  protected save(): void {
    if (!this.isValid()) return;
    this.ref.close({ ...this.model() });
  }

  private initialModel(): Sale {
    if (this.data.sale) return { ...this.data.sale };
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
