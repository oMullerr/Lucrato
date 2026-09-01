import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Return, ComputedReturn, ReturnStatus } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ColorPillComponent } from '../../shared/components/color-pill.component';
import { DateRangePickerComponent, RangeBounds, RangeChange } from '../../shared/components/date-range-picker.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { ReturnFormDialogComponent, ReturnDialogData } from './return-form.dialog';
import { BreakpointService } from '../../shared/ui/breakpoint.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { MoneyComponent } from '../../shared/ui/money/money.component';
import { SortDirective, SortState } from '../../shared/ui/sort/sort.directive';
import { SortHeaderComponent } from '../../shared/ui/sort/sort-header.component';
import { PaginatorComponent, PageChangeEvent } from '../../shared/ui/paginator/paginator.component';
import { RecordCardComponent, RecordCardFigure } from '../../shared/ui/record-card/record-card.component';

type ReturnFilter = 'all' | 'pending' | 'finished' | 'loss';

@Component({
  selector: 'app-returns',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, TranslateModule,
    PageHeaderComponent, StatusBadgeComponent, KpiCardComponent,
    EmptyStateComponent, SkeletonComponent, ColorPillComponent, DateRangePickerComponent,
    BrlPipe, BrDatePipe,
    ButtonComponent, IconComponent, TooltipDirective, ChipComponent,
    FieldComponent, InputDirective, SelectComponent, OptionComponent,
    MoneyComponent, SortDirective, SortHeaderComponent, PaginatorComponent, RecordCardComponent,
  ],
  templateUrl: './returns.component.html',
  styleUrl: './returns.component.scss',
})
export class ReturnsComponent {
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(DialogService);
  private readonly t = inject(TranslateService);
  protected readonly bp = inject(BreakpointService);

  protected readonly textFilter = signal('');
  protected readonly destinationFilter = signal('all');
  protected readonly quickFilter = signal<ReturnFilter>('all');
  protected readonly dateBounds = signal<RangeBounds | null>(null);
  protected readonly expandedRow = signal<string | null>(null);

  protected readonly returns = this.data.computedReturns;

  protected readonly destinations = ['Estoque', 'Perda', 'Fornecedor', 'Ressarcido'];

  protected readonly sortState = signal<SortState>({ active: '', direction: '' });
  protected readonly pageState = signal<PageChangeEvent>({ pageIndex: 0, pageSize: 15, length: 0 });
  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];

  protected readonly mobileSortOptions = [
    { value: '', labelKey: 'returns.sortDefault' },
    { value: 'product:asc', labelKey: 'returns.colProduct' },
    { value: 'lossAmount:desc', labelKey: 'returns.colLoss' },
    { value: 'quantity:desc', labelKey: 'returns.colQty' },
    { value: 'resolutionDays:desc', labelKey: 'returns.colResolutionDays' },
  ];

  protected readonly mobileSortValue = computed(() => {
    const s = this.sortState();
    return s.active && s.direction ? `${s.active}:${s.direction}` : '';
  });

  /** Pendentes primeiro: são as que ainda exigem ação do usuário. */
  private readonly STATUS_PRIORITY: Record<ReturnStatus, number> = {
    'Solicitado': 0,
    'Finalizado': 1,
  };

  private readonly SORT_ACCESSORS: Record<string, (row: ComputedReturn) => string | number> = {
    id: row => row.id,
    saleId: row => row.saleId,
    product: row => row.product,
    channel: row => row.channel,
    quantity: row => row.quantity,
    requestDate: row => row.requestDate,
    arrivalDate: row => row.arrivalDate ?? '',
    resolutionDays: row => row.resolutionDays ?? -1,
    destination: row => row.destination,
    reason: row => row.reason,
    returnShipping: row => row.returnShipping,
    refundedAmount: row => row.refundedAmount ?? 0,
    // Solicitadas exibem '—' na coluna; ordenar pelo valor projetado as jogaria
    // para o topo de uma coluna visualmente vazia. Ordena como 0.
    lossAmount: row => (row.status === 'Finalizado' ? row.lossAmount : 0),
    status: row => this.STATUS_PRIORITY[row.status] ?? 99,
  };

  constructor() {
    effect(() => {
      this.textFilter();
      this.destinationFilter();
      this.quickFilter();
      this.dateBounds();
      this.pageState.update(p => ({ ...p, pageIndex: 0 }));
    }, { allowSignalWrites: true });
  }

  protected onSortChange(sort: SortState): void {
    this.sortState.set(sort);
  }

  protected onMobileSort(value: string): void {
    if (!value) {
      this.sortState.set({ active: '', direction: '' });
      return;
    }
    const [active, direction] = value.split(':');
    this.sortState.set({ active, direction: direction as SortState['direction'] });
  }

  protected onPage(evt: PageChangeEvent): void {
    this.pageState.set(evt);
  }

  protected onRangeChange(e: RangeChange): void {
    this.dateBounds.set(e.bounds);
  }

  /**
   * Filtro por período usa a data da SOLICITAÇÃO — é quando o evento aconteceu
   * do ponto de vista de quem está olhando a lista. (O impacto financeiro, esse
   * sim, é atribuído ao mês da venda original pelo motor de cálculo.)
   */
  private readonly filteredBase = computed(() => {
    let rs = this.returns();

    if (this.destinationFilter() !== 'all') {
      rs = rs.filter(r => r.destination === this.destinationFilter());
    }

    const text = this.textFilter().trim().toLowerCase();
    if (text) {
      rs = rs.filter(r =>
        r.product.toLowerCase().includes(text) ||
        r.id.toLowerCase().includes(text) ||
        r.saleId.toLowerCase().includes(text)
      );
    }

    const b = this.dateBounds();
    if (b) {
      rs = rs.filter(r => {
        const d = new Date(r.requestDate);
        return d >= b.start && d <= b.end;
      });
    }

    const qf = this.quickFilter();
    if (qf === 'pending') rs = rs.filter(r => r.status === 'Solicitado');
    else if (qf === 'finished') rs = rs.filter(r => r.status === 'Finalizado');
    else if (qf === 'loss') rs = rs.filter(r => r.status === 'Finalizado' && r.lossAmount > 0);

    return [...rs].sort((a, b) => {
      const byStatus = (this.STATUS_PRIORITY[a.status] ?? 99) - (this.STATUS_PRIORITY[b.status] ?? 99);
      if (byStatus !== 0) return byStatus;
      const byDate = b.requestDate.localeCompare(a.requestDate);
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
  });

  protected readonly filteredReturns = computed(() => {
    const base = this.filteredBase();
    const s = this.sortState();
    if (!s.active || !s.direction) return base;
    const accessor = this.SORT_ACCESSORS[s.active];
    if (!accessor) return base;
    const dir = s.direction === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  });

  protected readonly pagedReturns = computed(() => {
    const list = this.filteredReturns();
    const { pageIndex, pageSize } = this.pageState();
    const start = pageIndex * pageSize;
    return list.slice(start, start + pageSize);
  });

  /** KPIs do cabeçalho, sobre a lista FILTRADA (acompanha o que está na tela). */
  protected readonly summary = computed(() => {
    const list = this.filteredReturns();
    const finalized = list.filter(r => r.status === 'Finalizado');
    const pending = list.filter(r => r.status === 'Solicitado');
    return {
      total: list.length,
      pending: pending.length,
      units: finalized.reduce((s, r) => s + r.quantity, 0),
      // Nunca clampar: ressarcimento integral pode deixar o saldo positivo.
      loss: finalized.reduce((s, r) => s + r.lossAmount, 0),
      atRisk: pending.reduce((s, r) => s + r.returnedRevenue, 0),
      shipping: finalized.reduce((s, r) => s + r.returnShipping, 0),
      refunds: finalized.reduce((s, r) => s + (r.refundedAmount ?? 0), 0),
    };
  });

  /** Taxa de devolução global — unidades devolvidas sobre unidades vendidas. */
  protected readonly returnRate = computed(() => this.data.kpis().returnRate);
  protected readonly grossUnitsSold = computed(() => this.data.kpis().grossUnitsSold);

  protected readonly quickCounts = computed(() => {
    const all = this.returns();
    return {
      all: all.length,
      pending: all.filter(r => r.status === 'Solicitado').length,
      finished: all.filter(r => r.status === 'Finalizado').length,
      loss: all.filter(r => r.status === 'Finalizado' && r.lossAmount > 0).length,
    };
  });

  protected setQuickFilter(f: ReturnFilter): void {
    this.quickFilter.set(f);
  }

  protected toggleRow(id: string, event: Event): void {
    event.stopPropagation();
    this.expandedRow.update(curr => curr === id ? null : id);
  }

  protected lossClass(value: number): string {
    return value > 0 ? 'text-danger' : value < 0 ? 'text-success' : '';
  }

  protected statusKindFor(r: ComputedReturn): string {
    return r.status === 'Finalizado' ? 'success' : 'warning';
  }

  protected figuresFor(r: ComputedReturn): RecordCardFigure[] {
    // Pendente ainda não descontou nada: mostra o valor em risco, não a projeção
    // de prejuízo — senão o card mobile diria algo que o desktop exibe como '—'.
    const money: RecordCardFigure = r.status === 'Finalizado'
      ? { label: this.t.instant('returns.colLoss'), value: -r.lossAmount, tone: 'auto' }
      : { label: this.t.instant('returns.kpiAtRisk'), value: r.returnedRevenue, tone: 'neutral' };
    return [
      { label: this.t.instant('returns.colQty'), text: `${r.quantity}×` },
      money,
      { label: this.t.instant('returns.colDestination'), text: this.t.instant('returns.destination.' + r.destination) },
    ];
  }

  protected openNew(): void {
    this.openForm();
  }

  protected edit(r: ComputedReturn, event: Event): void {
    event.stopPropagation();
    this.openForm(this.data.findReturn(r.id));
  }

  protected editFromCard(r: ComputedReturn): void {
    this.openForm(this.data.findReturn(r.id));
  }

  protected confirmRemove(r: ComputedReturn, event: Event): void {
    event.stopPropagation();
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.t.instant('returns.removeTitle'),
          message: this.t.instant('returns.removeMsg', { id: r.id, product: r.product }),
          danger: true,
          confirmText: this.t.instant('common.remove'),
        },
        size: 'sm',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (!confirmed) return;
        /* Snapshot cru ANTES de remover — é ele que o desfazer restaura. */
        const raw = this.data.findReturn(r.id);
        this.data.removeReturn(r.id);
        if (raw) {
          this.notify.withUndo(
            this.t.instant('returns.deletedUndo', { id: r.id }),
            () => this.data.addReturn(raw),
          );
        } else {
          this.notify.success(this.t.instant('returns.removed', { id: r.id }));
        }
      });
  }

  private openForm(ret?: Return): void {
    this.dialog
      .open<ReturnFormDialogComponent, ReturnDialogData, Return | null>(
        ReturnFormDialogComponent,
        { data: { ret }, size: 'xl' }
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (ret) {
          this.data.updateReturn(ret.id, result);
          this.notify.success(this.t.instant('returns.updated', { id: result.id }));
        } else {
          if (this.data.findReturn(result.id)) {
            this.notify.error(this.t.instant('returns.idExists', { id: result.id }));
            return;
          }
          this.data.addReturn(result);
          this.notify.success(this.t.instant('returns.registered', { id: result.id }));
        }
      });
  }
}
