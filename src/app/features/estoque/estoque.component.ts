import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { DataService } from '../../core/services/data.service';
import { CompraCalculada } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { DataBrPipe } from '../../shared/pipes/data-br.pipe';

@Component({
  selector: 'app-estoque',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, MatButtonModule, MatIconModule, MatCardModule,
    PageHeaderComponent, KpiCardComponent, StatusBadgeComponent,
    BrlPipe, DataBrPipe,
  ],
  templateUrl: './estoque.component.html',
  styleUrl: './estoque.component.scss',
})
export class EstoqueComponent {
  private readonly dataService = inject(DataService);

  protected readonly kpis = this.dataService.kpis;

  protected readonly comprasOrdenadas = computed(() =>
    [...this.dataService.comprasCalculadas()].sort((a, b) => {
      if (a.estoqueAtual > 0 && b.estoqueAtual <= 0) return -1;
      if (a.estoqueAtual <= 0 && b.estoqueAtual > 0) return 1;
      return b.diasEmEstoque - a.diasEmEstoque;
    })
  );

  protected readonly alertas = computed(() =>
    this.dataService.comprasCalculadas()
      .filter(c => c.status === 'Parado' || c.status === 'Atenção')
      .sort((a, b) => b.diasEmEstoque - a.diasEmEstoque)
  );

  protected diaClasse(c: CompraCalculada): string {
    const cfg = this.dataService.configuracoes();
    if (!cfg || c.estoqueAtual <= 0) return '';
    if (c.diasEmEstoque >= cfg.diasAlertaVermelho) return 'alert-red';
    if (c.diasEmEstoque >= cfg.diasAlertaAmarelo) return 'alert-amber';
    return '';
  }

  protected margemClasse(margem: number | undefined): string {
    if (margem === undefined) return 'text-muted';
    const cfg = this.dataService.configuracoes();
    if (margem < 0) return 'text-danger';
    if (cfg && margem < cfg.margemMinima) return 'text-warning';
    return 'text-success';
  }
}
