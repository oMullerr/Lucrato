import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { MlIntegrationService, MlItem } from '../../core/services/ml-integration.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import {
  ProdutoCandidato,
  normalizarChaveProduto,
  sugerirProduto,
} from '../../core/ml/matching';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { PaginatorComponent, PageChangeEvent } from '../../shared/ui/paginator/paginator.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

/** Uma linha da tela: anúncio + o que sabemos sobre o vínculo dele. */
export interface LinhaAnuncio {
  item: MlItem;
  /** Produto escolhido agora (vínculo salvo, sugestão ou vazio). */
  escolha: string;
  /** Vínculo já gravado no servidor, para saber o que mudou. */
  salvo: string;
  /** Como a escolha apareceu, quando não veio de um vínculo salvo. */
  sugestao: 'sku' | 'titulo' | null;
  /** Estoque do lote correspondente no Lucrato; `null` quando não há vínculo. */
  estoqueLucrato: number | null;
}

/** Filtro de vínculo aplicado à lista. */
export type FiltroVinculo = 'todos' | 'sem' | 'com';

const TAMANHOS_DE_PAGINA = [25, 50, 100];

@Component({
  selector: 'app-listings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink,
    PageHeaderComponent, EmptyStateComponent, SkeletonComponent,
    ButtonComponent, IconComponent, SelectComponent, OptionComponent,
    FieldComponent, InputDirective, TooltipDirective, PaginatorComponent,
    BrlPipe, TranslateModule,
  ],
  templateUrl: './listings.component.html',
  styleUrl: './listings.component.scss',
})
export class ListingsComponent {
  protected readonly ml = inject(MlIntegrationService);
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

  /** Escolhas mexidas pelo usuário nesta sessão, por id de anúncio. */
  private readonly escolhas = signal<Record<string, string>>({});
  protected readonly salvando = signal(false);

  /* ---------- filtros ---------- */
  protected readonly busca = signal('');
  protected readonly precoMin = signal<number | null>(null);
  protected readonly precoMax = signal<number | null>(null);
  protected readonly estoqueMin = signal<number | null>(null);
  protected readonly estoqueMax = signal<number | null>(null);
  protected readonly filtroVinculo = signal<FiltroVinculo>('todos');

  protected readonly pagina = signal<PageChangeEvent>({
    pageIndex: 0,
    pageSize: TAMANHOS_DE_PAGINA[0],
    length: 0,
  });
  protected readonly tamanhosDePagina = TAMANHOS_DE_PAGINA;

  constructor() {
    // Mudou o filtro e a página atual deixou de existir: volta para a primeira.
    effect(() => {
      const total = this.filtradas().length;
      const p = this.pagina();
      if (p.pageIndex > 0 && p.pageIndex * p.pageSize >= total) {
        this.pagina.set({ ...p, pageIndex: 0, length: total });
      }
    }, { allowSignalWrites: true });
  }

  /** Produtos disponíveis para vincular: nomes distintos vindos das compras. */
  protected readonly produtos = computed<ProdutoCandidato[]>(() => {
    const porChave = new Map<string, ProdutoCandidato>();
    for (const c of this.data.purchases()) {
      const chave = normalizarChaveProduto(c.product);
      if (!chave) continue;
      const atual = porChave.get(chave);
      // Mantém o primeiro nome visto e completa o SKU se aparecer depois.
      if (!atual) porChave.set(chave, { produto: c.product, sku: c.sku });
      else if (!atual.sku && c.sku) atual.sku = c.sku;
    }
    return [...porChave.values()].sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));
  });

  protected readonly nomesDeProdutos = computed(() => this.produtos().map(p => p.produto));

  /** Estoque atual por chave de produto, somando os lotes. */
  private readonly estoquePorChave = computed(() => {
    const mapa = new Map<string, number>();
    for (const lote of this.data.computedPurchases()) {
      const chave = normalizarChaveProduto(lote.product);
      if (!chave) continue;
      mapa.set(chave, (mapa.get(chave) ?? 0) + lote.currentStock);
    }
    return mapa;
  });

  protected readonly linhas = computed<LinhaAnuncio[]>(() => {
    const itens = this.ml.items() ?? [];
    const vinculos = this.ml.linksByItem();
    const mexidas = this.escolhas();
    const candidatos = this.produtos();
    const estoques = this.estoquePorChave();

    const linhas = itens.map(item => {
      const salvo = vinculos.get(item.id)?.produto ?? '';
      let escolha = salvo;
      let sugestao: 'sku' | 'titulo' | null = null;

      if (!salvo) {
        const s = sugerirProduto({ title: item.title, sku: item.sku }, candidatos);
        if (s) {
          escolha = s.produto;
          sugestao = s.origem;
        }
      }
      if (item.id in mexidas) escolha = mexidas[item.id];

      const chave = normalizarChaveProduto(escolha);
      return {
        item,
        escolha,
        salvo,
        sugestao,
        estoqueLucrato: chave ? estoques.get(chave) ?? 0 : null,
      };
    });

    // Ativos primeiro — é neles que se mexe — e dentro de cada grupo, alfabético.
    return linhas.sort((a, b) => {
      const ativoA = a.item.status === 'active' ? 0 : 1;
      const ativoB = b.item.status === 'active' ? 0 : 1;
      if (ativoA !== ativoB) return ativoA - ativoB;
      return (a.item.title ?? '').localeCompare(b.item.title ?? '', 'pt-BR');
    });
  });

  protected readonly filtradas = computed<LinhaAnuncio[]>(() => {
    const termo = normalizarChaveProduto(this.busca());
    const pMin = this.precoMin();
    const pMax = this.precoMax();
    const eMin = this.estoqueMin();
    const eMax = this.estoqueMax();
    const vinculo = this.filtroVinculo();

    return this.linhas().filter(l => {
      if (termo) {
        // Busca no título, no SKU e no id — é por um dos três que se procura.
        const alvo = normalizarChaveProduto(
          `${l.item.title} ${l.item.sku ?? ''} ${l.item.id}`,
        );
        if (!alvo.includes(termo)) return false;
      }
      if (pMin !== null && l.item.price < pMin) return false;
      if (pMax !== null && l.item.price > pMax) return false;
      if (eMin !== null && l.item.availableQuantity < eMin) return false;
      if (eMax !== null && l.item.availableQuantity > eMax) return false;
      if (vinculo === 'sem' && l.escolha) return false;
      if (vinculo === 'com' && !l.escolha) return false;
      return true;
    });
  });

  protected readonly visiveis = computed<LinhaAnuncio[]>(() => {
    const { pageIndex, pageSize } = this.pagina();
    const inicio = pageIndex * pageSize;
    return this.filtradas().slice(inicio, inicio + pageSize);
  });

  protected readonly temFiltro = computed(() =>
    this.busca().trim() !== '' ||
    this.precoMin() !== null || this.precoMax() !== null ||
    this.estoqueMin() !== null || this.estoqueMax() !== null ||
    this.filtroVinculo() !== 'todos',
  );

  /** O que ainda não está gravado — é o que o botão salvar envia. */
  protected readonly pendentes = computed(() =>
    this.linhas().filter(l => l.escolha !== l.salvo),
  );

  protected readonly semVinculo = computed(() =>
    this.linhas().filter(l => !l.escolha).length,
  );

  /** Anúncio vinculado cujo estoque no ML não bate com o do Lucrato. */
  protected divergente(l: LinhaAnuncio): boolean {
    return l.estoqueLucrato !== null && l.escolha !== '' && l.item.availableQuantity !== l.estoqueLucrato;
  }

  protected escolher(itemId: string, produto: string): void {
    this.escolhas.update(m => ({ ...m, [itemId]: produto ?? '' }));
  }

  /** Campos numéricos ficam nulos quando vazios, para não filtrar por zero. */
  protected numeroOuNulo(valor: string): number | null {
    const n = Number(valor);
    return valor.trim() === '' || !isFinite(n) ? null : n;
  }

  protected limparFiltros(): void {
    this.busca.set('');
    this.precoMin.set(null);
    this.precoMax.set(null);
    this.estoqueMin.set(null);
    this.estoqueMax.set(null);
    this.filtroVinculo.set('todos');
  }

  protected async sincronizar(): Promise<void> {
    try {
      const total = await this.ml.syncItems();
      this.notify.success(this.t.instant('listings.synced', { total }));
    } catch (err) {
      logError('[Listings] sincronizacao falhou:', err);
      this.notify.error(this.t.instant('listings.syncError'));
    }
  }

  protected async salvar(): Promise<void> {
    const mudancas = this.pendentes().map(l => ({ itemId: l.item.id, produto: l.escolha }));
    if (mudancas.length === 0) return;

    this.salvando.set(true);
    try {
      await this.ml.setLinks(mudancas);
      this.escolhas.set({});
      this.notify.success(this.t.instant('listings.linksSaved', { total: mudancas.length }));
    } catch (err) {
      logError('[Listings] salvar vinculos falhou:', err);
      this.notify.error(this.t.instant('listings.linksError'));
    } finally {
      this.salvando.set(false);
    }
  }
}
