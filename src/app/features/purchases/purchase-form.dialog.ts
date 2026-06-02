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
  templateUrl: './purchase-form.dialog.html',
  styleUrl: './purchase-form.dialog.scss',
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
