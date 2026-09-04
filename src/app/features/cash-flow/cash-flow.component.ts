import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import {
  Recebivel,
  SituacaoDoRecebivel,
  juntarRecebiveis,
  resumirCaixa,
} from '../../core/ml/payouts';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';

type Filtro = 'pendentes' | 'todos' | SituacaoDoRecebivel;

/**
 * Fluxo de caixa dos recebíveis do Mercado Pago.
 *
 * O resto do app responde "quanto eu lucrei". Esta tela responde "quanto entra,
 * e quando" — e as duas respostas são diferentes de propósito: aqui não entram
 * os seus custos próprios (embalagem, etiqueta), porque esse dinheiro nunca
 * passou pelo Mercado Pago. Caixa não é resultado.
 */
@Component({
  selector: 'app-cash-flow',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink,
    PageHeaderComponent, EmptyStateComponent, SkeletonComponent, KpiCardComponent,
    ButtonComponent, IconComponent, SelectComponent, OptionComponent, FieldComponent,
    BrlPipe, BrDatePipe, TranslateModule,
  ],
  templateUrl: './cash-flow.component.html',
  styleUrl: './cash-flow.component.scss',
})
export class CashFlowComponent {
  protected readonly ml = inject(MlIntegrationService);
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

  protected readonly sincronizando = signal(false);
  protected readonly filtro = signal<Filtro>('pendentes');

  /** Refeito quando a venda muda: corrigiu o razão, o caixa corrige junto. */
  protected readonly recebiveis = computed<Recebivel[]>(() =>
    juntarRecebiveis(this.ml.recebiveis() ?? [], this.data.computedSales()),
  );

  protected readonly resumo = computed(() => resumirCaixa(this.recebiveis()));

  protected readonly visiveis = computed<Recebivel[]>(() => {
    const f = this.filtro();
    const todos = this.recebiveis();
    if (f === 'todos') return todos;
    if (f === 'pendentes') return todos.filter(r => r.situacao !== 'liberado');
    return todos.filter(r => r.situacao === f);
  });

  /**
   * O maior dia da linha do tempo, para a barra ter escala.
   * Sem isso, um dia de R$ 5 e outro de R$ 5.000 sairiam do mesmo tamanho.
   */
  protected readonly maiorDia = computed(() =>
    this.resumo().porDia.reduce((m, d) => Math.max(m, d.valor), 0),
  );

  protected largura(valor: number): string {
    const maior = this.maiorDia();
    return maior > 0 ? `${Math.max(2, (valor / maior) * 100)}%` : '0%';
  }

  /**
   * Quantas vendas do Mercado Livre ainda não carregam o número do pedido.
   *
   * É o que explica uma tela vazia: sem esse número não há como ligar o
   * depósito à venda. Mostrar isso evita a conclusão errada de que a
   * integração não funcionou.
   */
  protected readonly semVinculo = computed(
    () =>
      this.data
        .computedSales()
        .filter(v => v.channel === 'Mercado Livre' && !v.mlOrderId).length,
  );

  protected async sincronizar(): Promise<void> {
    this.sincronizando.set(true);
    try {
      const total = await this.ml.syncPayouts();
      this.notify.success(this.t.instant('cashFlow.synced', { total }));
    } catch (err) {
      logError('[CashFlow] sincronizar falhou:', err);
      this.notify.error(this.t.instant('cashFlow.syncError'));
    } finally {
      this.sincronizando.set(false);
    }
  }
}
