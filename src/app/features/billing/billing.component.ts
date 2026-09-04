import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import {
  Confronto,
  ConfrontoDoPedido,
  LinhaDoFaturamento,
  PeriodoDeFaturamento,
  confrontar,
} from '../../core/ml/billing';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { SwitchComponent } from '../../shared/ui/switch/switch.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';

/**
 * Conciliação com a fatura do Mercado Livre.
 *
 * A pergunta que esta tela responde é uma só: o que o Mercado Livre cobrou
 * bate com o que o Lucrato registrou? Tudo aqui existe para não deixar essa
 * resposta ambígua — por isso o que não é comparável (pedido sem venda, cobrança
 * sem pedido) fica fora do número principal e é mostrado à parte, em vez de
 * inflar uma diferença que não é erro de ninguém.
 */
@Component({
  selector: 'app-billing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink,
    PageHeaderComponent, EmptyStateComponent, SkeletonComponent, KpiCardComponent,
    ButtonComponent, IconComponent, SelectComponent, OptionComponent,
    FieldComponent, SwitchComponent,
    BrlPipe, BrDatePipe, TranslateModule,
  ],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent {
  protected readonly ml = inject(MlIntegrationService);
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

  protected readonly sincronizando = signal(false);
  /** Período escolhido; vazio significa "o mais recente". */
  private readonly escolhido = signal('');
  /** Esconder o que já bate deixa visível só o que precisa de conferência. */
  protected readonly soDivergentes = signal(true);

  protected readonly periodos = computed(() => this.ml.faturamento() ?? []);

  protected readonly periodo = computed<PeriodoDeFaturamento | null>(() => {
    const lista = this.periodos();
    if (lista.length === 0) return null;
    const chave = this.escolhido();
    return lista.find(p => p.key === chave) ?? lista[0];
  });

  /** Refeito a cada mudança nas vendas: corrigiu a venda, o número corrige. */
  protected readonly confronto = computed<Confronto | null>(() => {
    const p = this.periodo();
    return p ? confrontar(p, this.data.computedSales()) : null;
  });

  protected readonly linhas = computed<LinhaDoFaturamento[]>(
    () => this.periodo()?.porRotulo ?? [],
  );

  protected readonly pedidos = computed<ConfrontoDoPedido[]>(() => {
    const todos = this.confronto()?.pedidos ?? [];
    return this.soDivergentes() ? todos.filter(p => p.veredito === 'divergente') : todos;
  });

  /** Total da fatura conforme o Mercado Livre, para as partes fecharem. */
  protected readonly totalCobrado = computed(() => {
    const c = this.periodo()?.cobrado;
    return c ? c.comissao + c.frete + c.outros : 0;
  });

  /**
   * Quanto do total do Mercado Livre a coleta não explica.
   *
   * A varredura pede só as faturas (`BILL`); nota de crédito é outro documento.
   * Numa tela de conciliação, dinheiro sem explicação não pode ficar escondido
   * atrás de um total que parece fechar.
   */
  protected readonly naoExplicado = computed(() => {
    const p = this.periodo();
    if (!p) return 0;
    return Math.round((p.totalMl - this.totalCobrado()) * 100) / 100;
  });

  /** Diferença a favor de quem: muda a cor do cartão, não só o sinal. */
  protected readonly tomDaDiferenca = computed(() => {
    const d = this.confronto()?.diferenca ?? 0;
    if (Math.abs(d) < 0.01) return 'success' as const;
    return d > 0 ? 'danger' as const : 'warning' as const;
  });

  protected escolher(key: string): void {
    this.escolhido.set(key);
  }

  protected rotuloDoPeriodo(p: PeriodoDeFaturamento): string {
    const chave = p.status === 'OPEN' ? 'billing.periodOpen' : 'billing.periodClosed';
    return this.t.instant(chave, { de: this.dia(p.dateFrom), ate: this.dia(p.dateTo) });
  }

  /** 'YYYY-MM-DD' → 'DD/MM'. Sem `new Date`, que trocaria o dia pelo fuso. */
  private dia(iso: string): string {
    const [, mes, dia] = (iso ?? '').split('-');
    return mes && dia ? `${dia}/${mes}` : (iso ?? '');
  }

  protected async sincronizar(): Promise<void> {
    this.sincronizando.set(true);
    try {
      const { total, faltam } = await this.ml.syncBilling();
      // O Mercado Livre bloqueia por IP quem varre os doze períodos de uma vez.
      // Avisar que faltou é melhor do que fingir que terminou.
      if (faltam > 0) {
        this.notify.warning(this.t.instant('billing.syncedPartial', { total, faltam }));
      } else {
        this.notify.success(this.t.instant('billing.synced', { total }));
      }
    } catch (err) {
      logError('[Billing] sincronizar falhou:', err);
      this.notify.error(this.t.instant('billing.syncError'));
    } finally {
      this.sincronizando.set(false);
    }
  }
}
