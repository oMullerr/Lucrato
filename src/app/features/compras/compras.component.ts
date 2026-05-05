import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Compra, CompraCalculada, StatusEstoque } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { DataBrPipe } from '../../shared/pipes/data-br.pipe';
import { CompraFormDialogComponent } from './compra-form.dialog';

type FiltroStatus = 'todos' | 'em-estoque' | 'atencao' | 'parado' | 'vendido';

@Component({
  selector: 'app-compras',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatChipsModule,
    MatTooltipModule, MatMenuModule,
    PageHeaderComponent, StatusBadgeComponent,
    BrlPipe, DataBrPipe,
  ],
  templateUrl: './compras.component.html',
  styleUrl: './compras.component.scss',
})
export class ComprasComponent {
  private readonly dataService = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly filtroTexto = signal('');
  protected readonly filtroStatus = signal<FiltroStatus>('todos');

  protected readonly compras = this.dataService.comprasCalculadas;

  protected readonly totais = computed(() => {
    const cs = this.compras();
    return {
      todos: cs.length,
      emEstoque: cs.filter(c => c.status === 'Em Estoque').length,
      atencao: cs.filter(c => c.status === 'Atenção').length,
      parado: cs.filter(c => c.status === 'Parado').length,
      vendido: cs.filter(c => c.status === 'Vendido').length,
    };
  });

  protected readonly comprasFiltradas = computed(() => {
    const statusMap: Record<Exclude<FiltroStatus, 'todos'>, StatusEstoque> = {
      'em-estoque': 'Em Estoque',
      'atencao': 'Atenção',
      'parado': 'Parado',
      'vendido': 'Vendido',
    };

    let cs = this.compras();
    const status = this.filtroStatus();
    if (status !== 'todos') {
      cs = cs.filter(c => c.status === statusMap[status]);
    }
    const texto = this.filtroTexto().trim().toLowerCase();
    if (texto) {
      cs = cs.filter(c =>
        c.produto.toLowerCase().includes(texto) ||
        c.id.toLowerCase().includes(texto) ||
        c.categoria.toLowerCase().includes(texto)
      );
    }
    return [...cs].sort((a, b) => b.dataCompra.localeCompare(a.dataCompra));
  });

  protected setStatus(s: FiltroStatus): void {
    this.filtroStatus.set(s);
  }

  protected abrirNova(): void {
    this.abrirForm();
  }

  protected editar(c: CompraCalculada): void {
    this.abrirForm({ ...c });
  }

  protected confirmarRemover(c: CompraCalculada): void {
    const vendasVinculadas = this.dataService.vendas().filter(v => v.idLote === c.id);
    if (vendasVinculadas.length > 0) {
      this.notify.warning(
        `Existem ${vendasVinculadas.length} venda(s) vinculada(s). Remova-as antes do lote.`
      );
      return;
    }

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remover Lote',
          message: `Remover o lote ${c.id} — "${c.produto}"?`,
          danger: true,
          confirmText: 'Remover',
        },
        width: '420px',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.dataService.removerCompra(c.id);
          this.notify.success(`Lote ${c.id} removido.`);
        }
      });
  }

  protected exportar(): void {
    const blob = new Blob([this.dataService.exportar()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml-gestao-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify.success('Backup exportado.');
  }

  protected importar(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (this.dataService.importar(text)) {
        this.notify.success('Backup importado com sucesso.');
      } else {
        this.notify.error('Arquivo inválido.');
      }
    };
    input.click();
  }

  private abrirForm(compra?: Compra): void {
    this.dialog
      .open<CompraFormDialogComponent, { compra?: Compra }, Compra | null>(
        CompraFormDialogComponent,
        { data: { compra }, width: '720px', maxWidth: '95vw' }
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (compra) {
          this.dataService.atualizarCompra(compra.id, result);
          this.notify.success(`Lote ${result.id} atualizado.`);
        } else {
          if (this.dataService.buscarCompra(result.id)) {
            this.notify.error(`ID ${result.id} já existe.`);
            return;
          }
          this.dataService.adicionarCompra(result);
          this.notify.success(`Lote ${result.id} adicionado.`);
        }
      });
  }
}
