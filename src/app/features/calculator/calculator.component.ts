import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { AnalysesService } from '../../core/services/analyses.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import { pareceItemDoMl } from '../../core/ml/item-id';
import {
  EntradaCalculo,
  calcular,
  custoMaximo,
  precoDeEquilibrio,
  precoParaMargem,
} from '../../core/pricing/pricing';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent, KpiVariant } from '../../shared/components/kpi-card.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SwitchComponent } from '../../shared/ui/switch/switch.component';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

/** Tipos de anúncio do Mercado Livre, com a comissão típica de partida. */
const TIPOS = [
  { id: 'gold_special', rotulo: 'Clássico', comissaoPadrao: 0.12 },
  { id: 'gold_pro', rotulo: 'Premium', comissaoPadrao: 0.17 },
] as const;

type TipoAnuncio = (typeof TIPOS)[number]['id'];

@Component({
  selector: 'app-calculator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PageHeaderComponent, KpiCardComponent,
    ButtonComponent, IconComponent, FieldComponent, InputDirective, SwitchComponent,
    TooltipDirective, BrlPipe, TranslateModule,
  ],
  templateUrl: './calculator.component.html',
  styleUrl: './calculator.component.scss',
})
export class CalculatorComponent {
  protected readonly ml = inject(MlIntegrationService);
  protected readonly data = inject(DataService);
  protected readonly analises = inject(AnalysesService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly t = inject(TranslateService);

  protected readonly tipos = TIPOS;

  /* ---------- entradas ---------- */
  protected readonly link = signal('');
  protected readonly titulo = signal('');
  protected readonly mlItemId = signal('');
  protected readonly precoVenda = signal(0);
  protected readonly custoProduto = signal(0);
  protected readonly custosExtras = signal(0);
  protected readonly quantidade = signal(1);
  protected readonly tipo = signal<TipoAnuncio>('gold_special');
  protected readonly comissaoPct = signal(12);
  protected readonly taxaFixa = signal(0);
  protected readonly freteGratis = signal(true);
  protected readonly frete = signal(0);
  protected readonly impostoPct = signal(0);

  protected readonly buscando = signal(false);
  protected readonly salvando = signal(false);
  /** Comissão e frete que vieram da API, para a tela dizer de onde saiu o número. */
  protected readonly veioDaApi = signal(false);

  protected readonly podeBuscar = computed(() => pareceItemDoMl(this.link()));

  protected readonly entrada = computed<EntradaCalculo>(() => ({
    precoVenda: this.precoVenda(),
    custoProduto: this.custoProduto(),
    custosExtras: this.custosExtras(),
    impostoPct: this.impostoPct() / 100,
    comissaoPct: this.comissaoPct() / 100,
    taxaFixa: this.taxaFixa(),
    // Frete só pesa no bolso quando é você quem banca.
    frete: this.freteGratis() ? this.frete() : 0,
    quantidade: this.quantidade(),
  }));

  protected readonly resultado = computed(() => calcular(this.entrada()));

  protected readonly margemAlvo = computed(() => this.data.settings()?.minimumMargin ?? 0.1);

  protected readonly equilibrio = computed(() => precoDeEquilibrio(this.entrada()));
  protected readonly precoAlvo = computed(() => precoParaMargem(this.entrada(), this.margemAlvo()));
  protected readonly custoTeto = computed(() => custoMaximo(this.entrada(), this.margemAlvo()));

  /** Verde quando bate a margem mínima, vermelho quando dá prejuízo. */
  protected readonly tomDaMargem = computed<KpiVariant>(() => {
    const m = this.resultado().margemContribuicao;
    if (m < 0) return 'danger';
    return m >= this.margemAlvo() ? 'success' : 'warning';
  });

  protected readonly temResultado = computed(() => this.precoVenda() > 0 && this.quantidade() > 0);

  protected escolherTipo(id: TipoAnuncio): void {
    this.tipo.set(id);
    // Sem dado da API, a comissão típica do tipo é o melhor palpite.
    if (!this.veioDaApi()) {
      this.comissaoPct.set((TIPOS.find(t => t.id === id)?.comissaoPadrao ?? 0.12) * 100);
    }
  }

  protected numero(valor: string): number {
    const n = Number(String(valor).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  /** Busca no Mercado Livre a comissão real da categoria e o frete estimado. */
  protected async buscarDados(): Promise<void> {
    if (!this.podeBuscar()) return;
    this.buscando.set(true);
    try {
      const analise = await this.ml.analisar(this.link());

      if (analise.item) {
        this.titulo.set(analise.item.title);
        this.mlItemId.set(analise.item.id);
        if (this.precoVenda() === 0) this.precoVenda.set(analise.item.price);
        if (analise.item.listingTypeId === 'gold_pro' || analise.item.listingTypeId === 'gold_special') {
          this.tipo.set(analise.item.listingTypeId);
        }
      }

      const comissao = analise.comissoes.find(c => c.listingTypeId === this.tipo())
        ?? analise.comissoes[0];
      if (comissao) {
        this.comissaoPct.set(Math.round(comissao.percentageFee * 10000) / 100);
        this.taxaFixa.set(comissao.fixedFee);
        this.veioDaApi.set(true);
      }

      if (analise.freteEstimado !== null) {
        this.frete.set(analise.freteEstimado);
        this.freteGratis.set(analise.freteEstimado > 0);
      }

      this.notify.success(this.t.instant('calculator.fetched'));
    } catch (err) {
      logError('[Calculator] busca falhou:', err);
      this.notify.error(this.t.instant('calculator.fetchError'));
    } finally {
      this.buscando.set(false);
    }
  }

  protected async salvar(): Promise<void> {
    if (!this.temResultado()) return;
    this.salvando.set(true);
    try {
      const r = this.resultado();
      await this.analises.salvar({
        titulo: this.titulo().trim() || this.t.instant('calculator.untitled'),
        ...(this.mlItemId() ? { mlItemId: this.mlItemId() } : {}),
        entrada: this.entrada(),
        resultado: {
          lucroLiquido: r.lucroLiquido,
          margemContribuicao: r.margemContribuicao,
          roi: r.roi,
        },
      });
      this.notify.success(this.t.instant('calculator.saved'));
    } catch (err) {
      logError('[Calculator] salvar falhou:', err);
      this.notify.error(this.t.instant('calculator.saveError'));
    } finally {
      this.salvando.set(false);
    }
  }

  /** Vira um lote de compra com os números já preenchidos. */
  protected async virarCompra(): Promise<void> {
    if (this.custoProduto() <= 0) {
      this.notify.warning(this.t.instant('calculator.needCost'));
      return;
    }
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      this.data.addPurchase({
        id: this.data.nextPurchaseId(),
        product: this.titulo().trim() || this.t.instant('calculator.untitled'),
        category: this.data.settings()?.categories?.[0] ?? '',
        supplier: this.data.settings()?.suppliers?.[0] ?? '',
        purchaseDate: hoje,
        quantityPurchased: this.quantidade(),
        unitCost: this.custoProduto(),
        purchaseShipping: 0,
        otherCosts: this.custosExtras() * this.quantidade(),
        notes: this.t.instant('calculator.fromCalculator'),
      });
      this.notify.success(this.t.instant('calculator.converted'));
      await this.router.navigate(['/purchases']);
    } catch (err) {
      logError('[Calculator] converter falhou:', err);
      this.notify.error(this.t.instant('calculator.convertError'));
    }
  }
}
