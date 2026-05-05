import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

interface ProdutoStat {
  produto: string;
  qtd: number;
  receita: number;
  receitaLiq: number;
  custo: number;
  lucroBruto: number;
  lucroLiq: number;
  margem: number;
}

interface CategoriaStat {
  categoria: string;
  lotes: number;
  investido: number;
  capitalParado: number;
  receita: number;
  lucro: number;
  margem: number;
}

interface MesStat {
  mes: string;
  qtd: number;
  receita: number;
  taxas: number;
  receitaLiq: number;
  custo: number;
  lucro: number;
  margem: number;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

@Component({
  selector: 'app-analises',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatTabsModule,
    PageHeaderComponent, StatusBadgeComponent, BrlPipe,
  ],
  templateUrl: './analises.component.html',
  styleUrl: './analises.component.scss',
})
export class AnalisesComponent {
  private readonly dataService = inject(DataService);

  protected readonly kpis = this.dataService.kpis;

  protected readonly rankingProdutos = computed<ProdutoStat[]>(() => {
    const concluidas = this.dataService.vendasCalculadas().filter(v => v.status === 'Concluída');
    const map = new Map<string, ProdutoStat>();

    for (const v of concluidas) {
      const e = map.get(v.produto) ?? {
        produto: v.produto, qtd: 0, receita: 0, receitaLiq: 0,
        custo: 0, lucroBruto: 0, lucroLiq: 0, margem: 0,
      };
      e.qtd += v.qtdVendida;
      e.receita += v.receitaBruta;
      e.receitaLiq += v.receitaLiquida;
      e.custo += v.custoTotalProporcional;
      e.lucroBruto += v.lucroBruto;
      e.lucroLiq += v.lucroLiquido;
      map.set(v.produto, e);
    }

    return [...map.values()]
      .map(e => ({ ...e, margem: e.receita > 0 ? e.lucroLiq / e.receita : 0 }))
      .sort((a, b) => b.lucroLiq - a.lucroLiq);
  });

  protected readonly resumoCategorias = computed<CategoriaStat[]>(() => {
    const compras = this.dataService.comprasCalculadas();
    const concluidas = this.dataService.vendasCalculadas().filter(v => v.status === 'Concluída');
    const map = new Map<string, CategoriaStat>();

    for (const c of compras) {
      const e = map.get(c.categoria) ?? {
        categoria: c.categoria, lotes: 0, investido: 0,
        capitalParado: 0, receita: 0, lucro: 0, margem: 0,
      };
      e.lotes += 1;
      e.investido += c.custoTotalReal;
      e.capitalParado += c.valorParado;
      map.set(c.categoria, e);
    }

    for (const v of concluidas) {
      const lote = compras.find(c => c.id === v.idLote);
      if (!lote) continue;
      const e = map.get(lote.categoria);
      if (!e) continue;
      e.receita += v.receitaBruta;
      e.lucro += v.lucroLiquido;
    }

    return [...map.values()]
      .map(e => ({ ...e, margem: e.receita > 0 ? e.lucro / e.receita : 0 }))
      .sort((a, b) => b.lucro - a.lucro);
  });

  protected readonly resumoMensal = computed<MesStat[]>(() => {
    const concluidas = this.dataService.vendasCalculadas().filter(v => v.status === 'Concluída');
    const map = new Map<string, MesStat>();

    for (const v of concluidas) {
      const d = new Date(v.dataVenda);
      const key = `${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
      const e = map.get(key) ?? {
        mes: key, qtd: 0, receita: 0, taxas: 0,
        receitaLiq: 0, custo: 0, lucro: 0, margem: 0,
      };
      e.qtd += v.qtdVendida;
      e.receita += v.receitaBruta;
      e.taxas += v.taxaValor;
      e.receitaLiq += v.receitaLiquida;
      e.custo += v.custoTotalProporcional;
      e.lucro += v.lucroLiquido;
      map.set(key, e);
    }

    return [...map.values()]
      .map(e => ({ ...e, margem: e.receita > 0 ? e.lucro / e.receita : 0 }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
  });

  protected readonly estoqueParado = computed(() =>
    this.dataService.comprasCalculadas()
      .filter(c => c.estoqueAtual > 0)
      .sort((a, b) => b.valorParado - a.valorParado)
  );

  protected margemClasse(m: number): string {
    if (m < 0) return 'text-danger';
    const cfg = this.dataService.configuracoes();
    if (cfg && m < cfg.margemMinima) return 'text-warning';
    return 'text-success';
  }
}
