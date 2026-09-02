import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslateModule } from '@ngx-translate/core';
import {
  Return, ReturnDestination, ReturnReason, ComputedSale,
} from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import {
  calculateSale, computeReturn, countsAsRevenue, remainingReturnable,
} from '../../core/services/calculations';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { CurrencyInputDirective } from '../../shared/directives/currency-input.directive';
import { DialogShellComponent } from '../../shared/ui/dialog/dialog-shell.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { DateInputComponent } from '../../shared/ui/date-input/date-input.component';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';

export interface ReturnDialogData {
  ret?: Return;
  /** Pré-seleciona a venda (usado pela ação de linha na tela de Vendas). */
  saleId?: string;
}

const MS_PER_DAY = 86_400_000;

export const RETURN_DESTINATIONS: ReturnDestination[] =
  ['Estoque', 'Perda', 'Fornecedor', 'Ressarcido'];

export const RETURN_REASONS: ReturnReason[] = [
  'Defeito', 'Não conforme', 'Arrependimento', 'Avaria no transporte',
  'Atraso na entrega', 'Erro de envio', 'Outro',
];

@Component({
  selector: 'app-return-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, A11yModule, TranslateModule, BrlPipe, BrDatePipe, CurrencyInputDirective,
    DialogShellComponent, ButtonComponent, IconComponent,
    FieldComponent, InputDirective, SelectComponent, OptionComponent,
    DateInputComponent, TooltipDirective,
  ],
  templateUrl: './return-form.dialog.html',
  styleUrl: './return-form.dialog.scss',
})
export class ReturnFormDialogComponent {
  private readonly dataService = inject(DataService);
  protected readonly ref = inject<DialogRef<Return | null>>(DialogRef);
  private readonly data = inject<ReturnDialogData>(DIALOG_DATA);

  protected readonly isEdit = signal(!!this.data.ret);
  protected readonly model = signal<Return>(this.initialModel());

  /**
   * Marca que o usuário editou o valor ressarcido à mão. Sem isso, trocar de
   * destino ou de quantidade sobrescreveria um valor digitado.
   */
  private readonly refundTouched = signal(!!this.data.ret?.refundedAmount);

  protected readonly destinations = RETURN_DESTINATIONS;
  protected readonly reasons = RETURN_REASONS;

  protected readonly returnWindowDays = computed(
    () => this.dataService.settings()?.returnWindowDays ?? 30,
  );

  /** Meia-noite UTC do dia de calendário local — mesma âncora do motor de cálculo. */
  private todayAnchor(): number {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * Vendas elegíveis: dentro da janela de devolução, contabilizadas como receita
   * e com unidades ainda devolvíveis. Na edição, a venda original é preservada
   * mesmo fora da janela — senão o formulário se recusaria a reabrir.
   */
  protected readonly availableSales = computed<ComputedSale[]>(() => {
    const editingSaleId = this.isEdit() ? (this.data.ret?.saleId ?? null) : null;
    const returns = this.dataService.returns();
    const cutoff = this.todayAnchor() - this.returnWindowDays() * MS_PER_DAY;
    const excludeId = this.data.ret?.id;

    return this.dataService.computedSales().filter(s => {
      if (s.id === editingSaleId) return true;
      if (!countsAsRevenue(s, returns)) return false;
      if (remainingReturnable(s, returns, excludeId) <= 0) return false;
      return new Date(s.saleDate).getTime() >= cutoff;
    });
  });

  protected readonly selectedSale = computed<ComputedSale | null>(() => {
    const id = this.model().saleId;
    if (!id) return null;
    return this.dataService.computedSales().find(s => s.id === id) ?? null;
  });

  protected readonly hasSale = computed(() => this.selectedSale() !== null);

  /** Quantidade máxima devolvível da venda escolhida. */
  protected readonly maxQuantity = computed(() => {
    const sale = this.selectedSale();
    if (!sale) return null;
    return remainingReturnable(sale, this.dataService.returns(), this.data.ret?.id);
  });

  protected readonly exceedsQuantity = computed(() => {
    const max = this.maxQuantity();
    if (max === null) return false;
    return this.model().quantity > max;
  });

  protected readonly requestBeforeSale = computed(() => {
    const sale = this.selectedSale();
    const m = this.model();
    if (!sale || !m.requestDate) return false;
    return m.requestDate < sale.saleDate;
  });

  protected readonly arrivalBeforeRequest = computed(() => {
    const m = this.model();
    if (!m.arrivalDate || !m.requestDate) return false;
    return m.arrivalDate < m.requestDate;
  });

  protected readonly arrivalInFuture = computed(() => {
    const m = this.model();
    if (!m.arrivalDate) return false;
    return new Date(m.arrivalDate).getTime() > this.todayAnchor();
  });

  /** 'Estoque' é o único destino que não admite ressarcimento. */
  protected readonly showRefund = computed(() => this.model().destination !== 'Estoque');

  protected readonly isFinalized = computed(() => !!this.model().arrivalDate);

  /**
   * Impacto na venda: lucro sem esta devolução vs. com ela. Enquanto o status
   * for 'Solicitado' os dois lados são idênticos por construção — aí a modal
   * mostra o valor em risco em vez do prejuízo.
   */
  protected readonly preview = computed(() => {
    const sale = this.selectedSale();
    if (!sale) return null;
    const m = this.model();
    const purchases = this.dataService.purchases();
    const others = this.dataService.returns().filter(r => r.id !== m.id);

    const before = calculateSale(sale, purchases, others);
    const after = calculateSale(sale, purchases, [...others, m]);
    const detail = computeReturn(m, this.dataService.sales(), purchases);

    return {
      before,
      after,
      detail,
      loss: before.netProfit - after.netProfit,
      atRisk: m.quantity * sale.unitPrice,
      stockBack: m.destination === 'Estoque' && !!m.arrivalDate,
    };
  });

  protected lossClass(): string {
    const p = this.preview();
    if (!p) return '';
    // Prejuízo negativo = o ressarcimento cobriu mais do que a venda rendia.
    return p.loss > 0 ? 'text-danger' : p.loss < 0 ? 'text-success' : '';
  }

  protected profitClass(value: number): string {
    return value < 0 ? 'text-danger' : value > 0 ? 'text-success' : '';
  }

  /* ── Handlers ──────────────────────────────────────────────────────────── */

  protected onSaleChange(saleId: string): void {
    const sale = this.dataService.computedSales().find(s => s.id === saleId);
    this.model.update(m => ({
      ...m,
      saleId,
      // Denormaliza da venda: permite relatórios por canal/produto sem join.
      batchId: sale?.batchId ?? '',
      product: sale?.product ?? '',
      channel: sale?.channel ?? m.channel,
    }));
    this.syncSuggestedRefund();
  }

  protected onQuantityChange(value: string | number | null): void {
    const num = Math.max(1, Math.floor(+(value ?? 1) || 1));
    this.model.update(m => ({ ...m, quantity: num }));
    this.syncSuggestedRefund();
  }

  protected onDestinationChange(destination: ReturnDestination): void {
    this.model.update(m => ({
      ...m,
      destination,
      // 'Estoque' não tem ressarcimento: o custo já volta pelo estoque.
      refundedAmount: destination === 'Estoque' ? undefined : m.refundedAmount,
    }));
    this.syncSuggestedRefund();
  }

  protected onRefundChange(value: string | number | null): void {
    this.refundTouched.set(true);
    this.model.update(m => ({ ...m, refundedAmount: Math.max(0, +(value ?? 0) || 0) }));
  }

  /**
   * 'Ressarcido' pressupõe que a plataforma devolveu o valor da venda, então o
   * campo já vem preenchido — mas só enquanto o usuário não o editou.
   */
  private syncSuggestedRefund(): void {
    if (this.refundTouched()) return;
    const m = this.model();
    if (m.destination !== 'Ressarcido') return;
    const sale = this.selectedSale();
    if (!sale) return;
    this.model.update(cur => ({ ...cur, refundedAmount: cur.quantity * sale.unitPrice }));
  }

  protected set(field: string, value: unknown): void {
    this.model.update(m => ({ ...m, [field]: value }));
  }

  protected setNum(field: string, value: string | number | null): void {
    const num = +(value ?? 0) || 0;
    this.model.update(m => ({ ...m, [field]: Math.max(0, num) }));
  }

  protected readonly requestDateAsDate = computed(() => this.toDate(this.model().requestDate));
  protected readonly arrivalDateAsDate = computed(() => this.toDate(this.model().arrivalDate));

  protected setRequestDate(d: Date | null): void {
    this.set('requestDate', this.dateAsString(d));
  }

  protected setArrivalDate(d: Date | null): void {
    const str = this.dateAsString(d);
    this.model.update(m => ({ ...m, arrivalDate: str || undefined }));
  }

  protected readonly maxDate = new Date();

  private toDate(s: string | undefined): Date | null {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return !y || !m || !d ? null : new Date(y, m - 1, d);
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
    if (!m.id || !m.saleId || !m.destination || !m.reason) return false;
    if (!this.hasSale()) return false;
    if (!m.requestDate) return false;
    if (!Number.isInteger(m.quantity) || m.quantity < 1) return false;
    if (this.exceedsQuantity()) return false;
    if (this.requestBeforeSale()) return false;
    if (this.arrivalBeforeRequest()) return false;
    if (this.arrivalInFuture()) return false;
    if (m.returnShipping < 0 || (m.refundedAmount ?? 0) < 0) return false;
    return true;
  }

  protected save(): void {
    if (!this.isValid()) return;
    const m = { ...this.model() };
    // Firestore rejeita `undefined`: campos vazios saem do objeto.
    if (!m.arrivalDate) delete m.arrivalDate;
    if (m.destination === 'Estoque' || m.refundedAmount === undefined) delete m.refundedAmount;
    if (!m.customerReason) delete m.customerReason;
    if (!m.resolution) delete m.resolution;
    if (!m.notes) delete m.notes;
    this.ref.close(m);
  }

  private initialModel(): Return {
    if (this.data.ret) return { ...this.data.ret };
    const preselected = this.data.saleId
      ? this.dataService.computedSales().find(s => s.id === this.data.saleId)
      : undefined;
    return {
      id: this.dataService.nextReturnId(),
      saleId: preselected?.id ?? '',
      batchId: preselected?.batchId ?? '',
      product: preselected?.product ?? '',
      channel: preselected?.channel ?? 'Mercado Livre',
      quantity: 1,
      requestDate: this.dateAsString(new Date()),
      returnShipping: 0,
      destination: 'Estoque',
      reason: 'Defeito',
      customerReason: '',
      resolution: '',
      notes: '',
    };
  }
}
