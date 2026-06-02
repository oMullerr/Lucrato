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
  templateUrl: './sale-form.dialog.html',
  styleUrl: './sale-form.dialog.scss',
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
