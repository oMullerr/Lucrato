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
import { SortDirective, SortState } from '../../shared/ui/sort/sort.directive';
import { SortHeaderComponent } from '../../shared/ui/sort/sort-header.component';
import {
  RecordCardComponent,
  RecordCardFigure,
} from '../../shared/ui/record-card/record-card.component';
import { BreakpointService } from '../../shared/ui/breakpoint.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { BrDateTimePipe } from '../../shared/pipes/br-date-time.pipe';

type Filtro = 'pendentes' | 'todos' | SituacaoDoRecebivel;

/** Tom do ponto de status no card do celular. */
const TOM_DA_SITUACAO: Readonly<Record<SituacaoDoRecebivel, string>> = {
  retido: 'info',
  liberado: 'success',
  atrasado: 'danger',
};

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
    SortDirective, SortHeaderComponent, RecordCardComponent,
    BrlPipe, BrDatePipe, BrDateTimePipe, TranslateModule,
  ],
  templateUrl: './cash-flow.component.html',
  styleUrl: './cash-flow.component.scss',
})
export class CashFlowComponent {
  protected readonly ml = inject(MlIntegrationService);
  protected readonly data = inject(DataService);
  protected readonly bp = inject(BreakpointService);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

  protected readonly sincronizando = signal(false);
  protected readonly filtro = signal<Filtro>('pendentes');
  protected readonly ordem = signal<SortState>({ active: '', direction: '' });

  /** Refeito quando a venda muda: corrigiu o razão, o caixa corrige junto. */
  protected readonly recebiveis = computed<Recebivel[]>(() =>
    juntarRecebiveis(this.ml.recebiveis() ?? [], this.data.computedSales()),
  );

  protected readonly resumo = computed(() => resumirCaixa(this.recebiveis()));

  private readonly filtrados = computed<Recebivel[]>(() => {
    const f = this.filtro();
    const todos = this.recebiveis();
    if (f === 'todos') return todos;
    if (f === 'pendentes') return todos.filter(r => r.situacao !== 'liberado');
    return todos.filter(r => r.situacao === f);
  });

  /**
   * Ordem escolhida no cabeçalho. Sem escolha, mantém a de `juntarRecebiveis`:
   * o que cai primeiro no topo, que é a ordem em que a pergunta é feita.
   */
  protected readonly visiveis = computed<Recebivel[]>(() => {
    const { active, direction } = this.ordem();
    const lista = this.filtrados();
    if (!active || !direction) return lista;

    const sinal = direction === 'asc' ? 1 : -1;
    // Cópia: `filtrados` devolve o array do computed anterior, e ordenar no
    // lugar mutaria a fonte de outro leitor.
    return [...lista].sort((a, b) => {
      // Fora do `sinal` de propósito: ausência de dado vai para o fim NOS DOIS
      // sentidos. Multiplicada pelo sinal, ela subiria para o topo no
      // decrescente — e "—" no alto de uma lista ordenada por valor leria como
      // o maior depósito.
      const semDado = this.semValor(active, a) - this.semValor(active, b);
      if (semDado !== 0) return semDado;

      return sinal * this.compara(active, a, b);
    });
  });

  /** 1 quando a linha não tem o valor daquela coluna. */
  private semValor(coluna: string, r: Recebivel): number {
    return coluna === 'liquido' && r.liquido === null ? 1 : 0;
  }

  private compara(coluna: string, a: Recebivel, b: Recebivel): number {
    switch (coluna) {
      case 'produto':
        return this.nomeDoRecebivel(a).localeCompare(this.nomeDoRecebivel(b), 'pt-BR');
      case 'bruto':
        return a.bruto - b.bruto;
      case 'liquido':
        return (a.liquido ?? 0) - (b.liquido ?? 0);
      default:
        // O instante, e não o dia: dois recebíveis do mesmo dia têm ordem.
        return a.liberaEmInstante.localeCompare(b.liberaEmInstante);
    }
  }

  /** Como a linha se chama — o mesmo texto no card, no `title` e na ordenação. */
  protected nomeDoRecebivel(r: Recebivel): string {
    if (r.tipo === 'credito') return this.t.instant('cashFlow.creditRow');
    return r.conciliado ? r.produto : this.t.instant('cashFlow.unlinkedRow');
  }

  protected tomDaSituacao(situacao: SituacaoDoRecebivel): string {
    return TOM_DA_SITUACAO[situacao];
  }

  protected valoresDoRecebivel(r: Recebivel): RecordCardFigure[] {
    return [
      { label: this.t.instant('cashFlow.colGross'), value: r.bruto, tone: 'neutral' },
      {
        label: this.t.instant('cashFlow.colNet'),
        // `null` mantém o "—" do `app-money`, em vez de inventar um zero.
        value: r.liquido,
        tone: 'neutral',
      },
    ];
  }

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
