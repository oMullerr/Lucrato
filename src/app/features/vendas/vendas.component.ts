import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Venda, VendaCalculada } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { DataBrPipe } from '../../shared/pipes/data-br.pipe';
import { VendaFormDialogComponent } from './venda-form.dialog';

@Component({
  selector: 'app-vendas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    PageHeaderComponent, StatusBadgeComponent,
    BrlPipe, DataBrPipe,
  ],
  templateUrl: './vendas.component.html',
  styleUrl: './vendas.component.scss',
})
export class VendasComponent {
  private readonly dataService = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly filtroTexto = signal('');
  protected readonly filtroCanal = signal('todos');
  protected readonly filtroStatus = signal('todos');

  protected readonly vendas = this.dataService.vendasCalculadas;
  protected readonly canais = computed(() => this.dataService.configuracoes()?.canais ?? []);
  protected readonly taxaPadrao = computed(() => this.dataService.configuracoes()?.taxaMlPadrao ?? 0.12);

  protected readonly vendasFiltradas = computed(() => {
    let vs = this.vendas();
    if (this.filtroCanal() !== 'todos') {
      vs = vs.filter(v => v.canal === this.filtroCanal());
    }
    if (this.filtroStatus() !== 'todos') {
      vs = vs.filter(v => v.status === this.filtroStatus());
    }
    const texto = this.filtroTexto().trim().toLowerCase();
    if (texto) {
      vs = vs.filter(v =>
        v.produto.toLowerCase().includes(texto) ||
        v.id.toLowerCase().includes(texto) ||
        v.idLote.toLowerCase().includes(texto)
      );
    }
    return [...vs].sort((a, b) => b.dataVenda.localeCompare(a.dataVenda));
  });

  protected readonly resumo = computed(() => {
    const concluidas = this.vendasFiltradas().filter(v => v.status === 'Concluída');
    const receita = concluidas.reduce((s, v) => s + v.receitaBruta, 0);
    const taxas = concluidas.reduce((s, v) => s + v.taxaValor, 0);
    const lucro = concluidas.reduce((s, v) => s + v.lucroLiquido, 0);
    return {
      total: this.vendas().length,
      receita,
      taxas,
      lucro,
      margem: receita > 0 ? lucro / receita : 0,
    };
  });

  protected abrirNova(): void {
    this.abrirForm();
  }

  protected editar(v: VendaCalculada): void {
    this.abrirForm({ ...v });
  }

  protected confirmarRemover(v: VendaCalculada): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remover Venda',
          message: `Remover a venda ${v.id} — "${v.produto}"?`,
          danger: true,
          confirmText: 'Remover',
        },
        width: '420px',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.dataService.removerVenda(v.id);
          this.notify.success(`Venda ${v.id} removida.`);
        }
      });
  }

  protected isTaxaCustomizada(taxa: number): boolean {
    return Math.abs(taxa - this.taxaPadrao()) > 0.0001;
  }

  protected margemClasse(margem: number): string {
    if (margem < 0) return 'text-danger';
    const cfg = this.dataService.configuracoes();
    if (cfg && margem < cfg.margemMinima) return 'text-warning';
    return 'text-success';
  }

  private abrirForm(venda?: Venda): void {
    this.dialog
      .open<VendaFormDialogComponent, { venda?: Venda }, Venda | null>(
        VendaFormDialogComponent,
        { data: { venda }, width: '820px', maxWidth: '95vw' }
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (venda) {
          this.dataService.atualizarVenda(venda.id, result);
          this.notify.success(`Venda ${result.id} atualizada.`);
        } else {
          if (this.dataService.buscarVenda(result.id)) {
            this.notify.error(`ID ${result.id} já existe.`);
            return;
          }
          this.dataService.adicionarVenda(result);
          this.notify.success(`Venda ${result.id} registrada.`);
        }
      });
  }
}
