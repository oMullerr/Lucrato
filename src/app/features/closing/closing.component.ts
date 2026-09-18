import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { LanguageService } from '../../core/services/language.service';
import { XlsxExportService } from '../../core/services/xlsx-export.service';
import {
  LinhaDoFechamento, fechar, mesesDisponiveis, variacao,
} from '../../core/fechamento';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

/** Uma linha do relatório, já pronta para desenhar. */
interface LinhaNaTela {
  chave: string;
  valor: number;
  anterior: number | null;
  variacao: number | null;
  tipo: 'brl' | 'percent' | 'count';
  /** Custo: variação para cima é ruim. */
  inverso?: boolean;
  destaque?: boolean;
}

/**
 * Fechamento do mês.
 *
 * O resto do app responde "como vai o negócio", com números que se mexem a cada
 * venda. Esta tela responde "quanto eu lucrei em março" — a pergunta de quem vai
 * pagar imposto, comparar meses ou entender por que a margem caiu.
 *
 * A conta mora em `core/fechamento.ts`, pura e testada. Aqui só se escolhe o mês
 * e se desenha.
 */
@Component({
  selector: 'app-closing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PageHeaderComponent, EmptyStateComponent, SkeletonComponent,
    ButtonComponent, IconComponent, FieldComponent, SelectComponent, OptionComponent,
    BrlPipe, TranslateModule,
  ],
  templateUrl: './closing.component.html',
  styleUrl: './closing.component.scss',
})
export class ClosingComponent {
  protected readonly data = inject(DataService);
  private readonly xlsx = inject(XlsxExportService);
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  protected readonly meses = computed(() =>
    mesesDisponiveis(this.data.computedSales(), this.data.computedPurchases()),
  );

  private readonly escolhido = signal('');

  /** Mês em foco; sem escolha, o mais recente com movimento. */
  protected readonly mes = computed(() => {
    const lista = this.meses();
    const m = this.escolhido();
    return m && lista.includes(m) ? m : (lista[0] ?? '');
  });

  protected readonly fechamento = computed(() =>
    fechar(this.mes(), this.data.computedSales(), this.data.computedPurchases()),
  );

  protected escolher(m: string): void { this.escolhido.set(m); }

  /** 'YYYY-MM' → 'março/2026', no idioma atual. */
  protected rotulo(mes: string): string {
    this.lang.lang();
    const [a, m] = mes.split('-');
    const nomes = this.t.instant('dashboard.months') as string[];
    const nome = nomes?.[Number(m) - 1] ?? m;
    return `${nome}/${a}`;
  }

  /**
   * As linhas do relatório, na ordem em que a conta é feita.
   *
   * A ordem não é estética: é a demonstração de resultado descendo da receita
   * bruta até o lucro, com cada dedução no caminho. Ler de cima para baixo
   * responde "para onde foi o dinheiro" sem precisar de outra tela.
   */
  protected readonly linhas = computed<LinhaNaTela[]>(() => {
    const { atual, anterior } = this.fechamento();

    const linha = (
      chave: keyof LinhaDoFechamento,
      tipo: LinhaNaTela['tipo'],
      extras: Partial<LinhaNaTela> = {},
    ): LinhaNaTela => ({
      chave,
      valor: atual[chave] as number,
      anterior: anterior ? (anterior[chave] as number) : null,
      variacao: variacao(atual[chave] as number, anterior?.[chave] as number | undefined),
      tipo,
      ...extras,
    });

    return [
      linha('receitaBruta', 'brl'),
      linha('comissao', 'brl', { inverso: true }),
      linha('frete', 'brl', { inverso: true }),
      linha('descontos', 'brl', { inverso: true }),
      linha('outrosCustos', 'brl', { inverso: true }),
      linha('receitaLiquida', 'brl'),
      linha('cmv', 'brl', { inverso: true }),
      linha('perdaComDevolucoes', 'brl', { inverso: true }),
      linha('lucroLiquido', 'brl', { destaque: true }),
      linha('margem', 'percent', { destaque: true }),
      linha('vendas', 'count'),
      linha('unidades', 'count'),
      linha('ticketMedio', 'brl'),
      linha('devolucoes', 'count', { inverso: true }),
      linha('investido', 'brl'),
    ];
  });

  protected readonly temMovimento = computed(() => this.meses().length > 0);

  /** Verde quando melhorou. Em linha de custo, melhorar é cair. */
  protected tomDaVariacao(l: LinhaNaTela): 'up' | 'down' | 'flat' {
    if (l.variacao === null || Math.abs(l.variacao) < 0.001) return 'flat';
    const subiu = l.variacao > 0;
    return (l.inverso ? !subiu : subiu) ? 'up' : 'down';
  }

  protected exportar(): void {
    const { atual, anterior } = this.fechamento();
    const blocos = [
      {
        title: this.t.instant('closing.title'),
        rows: this.linhas().map(l => ({
          label: this.t.instant('closing.row.' + l.chave),
          value: l.valor,
          kind: l.tipo,
        })),
      },
    ];

    if (anterior) {
      blocos.push({
        title: this.rotulo(anterior.mes),
        rows: this.linhas().map(l => ({
          label: this.t.instant('closing.row.' + l.chave),
          value: l.anterior ?? 0,
          kind: l.tipo,
        })),
      });
    }

    this.xlsx.download(`fechamento-${this.mes()}`, [], {
      title: `${this.t.instant('closing.title')} — ${this.rotulo(this.mes())}`,
      generatedAt: new Date(),
      blocks: blocos,
    });
  }
}
