import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Configuracoes } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';

type ListKey = 'categorias' | 'fornecedores' | 'canais';

@Component({
  selector: 'app-configuracoes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule,
    PageHeaderComponent,
  ],
  templateUrl: './configuracoes.component.html',
  styleUrl: './configuracoes.component.scss',
})
export class ConfiguracoesComponent {
  private readonly dataService = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly separadores = [ENTER, COMMA];

  protected readonly form = signal<Configuracoes>(this.snapshot());

  // Acessadores como percentual para UX
  protected get taxaPercentual(): number {
    return this.form().taxaMlPadrao * 100;
  }
  protected set taxaPercentual(v: number) {
    this.form.update(f => ({ ...f, taxaMlPadrao: (v || 0) / 100 }));
  }

  protected get margemMinimaPct(): number {
    return this.form().margemMinima * 100;
  }
  protected set margemMinimaPct(v: number) {
    this.form.update(f => ({ ...f, margemMinima: (v || 0) / 100 }));
  }

  protected readonly modificado = computed(() => {
    const cfg = this.dataService.configuracoes();
    if (!cfg) return false;
    return JSON.stringify(cfg) !== JSON.stringify(this.form());
  });

  protected adicionarItem(lista: ListKey, valor: string): void {
    const v = (valor ?? '').trim();
    if (!v) return;
    const atual = this.form()[lista];
    if (atual.includes(v)) {
      this.notify.warning(`"${v}" já existe na lista.`);
      return;
    }
    this.form.update(f => ({ ...f, [lista]: [...atual, v] }));
  }

  protected removerItem(lista: ListKey, item: string): void {
    this.form.update(f => ({
      ...f,
      [lista]: f[lista].filter(x => x !== item),
    }));
  }

  protected salvar(): void {
    this.dataService.atualizarConfiguracoes(this.form());
    this.notify.success('Configurações salvas.');
  }

  protected descartar(): void {
    this.form.set(this.snapshot());
    this.notify.info('Alterações descartadas.');
  }

  protected resetarTudo(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Resetar dados',
          message: 'Isso vai apagar todos os dados (compras, vendas, configurações) e restaurar o exemplo inicial. Tem certeza?',
          danger: true,
          confirmText: 'Sim, resetar tudo',
        },
        width: '460px',
      })
      .afterClosed()
      .subscribe(async confirmed => {
        if (confirmed) {
          await this.dataService.resetar();
          this.form.set(this.snapshot());
          this.notify.success('Sistema resetado para o estado inicial.');
        }
      });
  }

  private snapshot(): Configuracoes {
    return JSON.parse(JSON.stringify(this.dataService.configuracoes() ?? this.empty()));
  }

  private empty(): Configuracoes {
    return {
      taxaMlPadrao: 0.12,
      diasAlertaAmarelo: 25,
      diasAlertaVermelho: 30,
      margemMinima: 0.10,
      alertaEstoqueBaixo: 1,
      fretePadrao: 0,
      canalPadrao: 'Mercado Livre',
      categorias: [],
      fornecedores: [],
      canais: [],
    };
  }
}
