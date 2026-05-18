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
import { Settings } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';

type ListKey = 'categories' | 'suppliers' | 'channels';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule,
    PageHeaderComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly dataService = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly separators = [ENTER, COMMA];

  protected readonly form = signal<Settings>(this.snapshot());

  protected get feePercentage(): number {
    return this.form().defaultMlFee * 100;
  }
  protected set feePercentage(v: number) {
    this.form.update(f => ({ ...f, defaultMlFee: (v || 0) / 100 }));
  }

  protected get minMarginPct(): number {
    return this.form().minimumMargin * 100;
  }
  protected set minMarginPct(v: number) {
    this.form.update(f => ({ ...f, minimumMargin: (v || 0) / 100 }));
  }

  protected readonly isModified = computed(() => {
    const cfg = this.dataService.settings();
    if (!cfg) return false;
    return JSON.stringify(cfg) !== JSON.stringify(this.form());
  });

  protected addItem(list: ListKey, value: string): void {
    const v = (value ?? '').trim();
    if (!v) return;
    const current = this.form()[list];
    if (current.includes(v)) {
      this.notify.warning(`"${v}" já existe na lista.`);
      return;
    }
    this.form.update(f => ({ ...f, [list]: [...current, v] }));
  }

  protected removeItem(list: ListKey, item: string): void {
    this.form.update(f => ({
      ...f,
      [list]: f[list].filter(x => x !== item),
    }));
  }

  protected save(): void {
    this.dataService.updateSettings(this.form());
    this.notify.success('Configurações salvas.');
  }

  protected discard(): void {
    this.form.set(this.snapshot());
    this.notify.info('Alterações descartadas.');
  }

  protected resetAll(): void {
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
          await this.dataService.reset();
          this.form.set(this.snapshot());
          this.notify.success('Sistema resetado para o estado inicial.');
        }
      });
  }

  private snapshot(): Settings {
    return JSON.parse(JSON.stringify(this.dataService.settings() ?? this.empty()));
  }

  private empty(): Settings {
    return {
      defaultMlFee: 0.12,
      yellowAlertDays: 25,
      redAlertDays: 30,
      minimumMargin: 0.10,
      lowStockAlert: 1,
      defaultShipping: 0,
      defaultChannel: 'Mercado Livre',
      categories: [],
      suppliers: [],
      channels: [],
    };
  }
}
