import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
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
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Settings } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { ImportService } from '../../core/services/import.service';
import { NotifyService } from '../../core/services/notify.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { ImportResultDialogComponent } from './import-result-dialog.component';

type ListKey = 'categories' | 'suppliers' | 'channels';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DragDropModule,
    MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule,
    PageHeaderComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly dataService = inject(DataService);
  private readonly importService = inject(ImportService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  private readonly fileInputEl = viewChild<ElementRef<HTMLInputElement>>('fileInputRef');

  protected readonly separators = [ENTER, COMMA];

  protected readonly form = signal<Settings>(this.snapshot());
  private _dirty = false;

  constructor() {
    effect(() => {
      const settings = this.dataService.settings();
      if (settings && !this._dirty) {
        this.form.set(JSON.parse(JSON.stringify(settings)));
      }
    }, { allowSignalWrites: true });
  }

  protected update<K extends keyof Settings>(key: K, value: unknown): void {
    this._dirty = true;
    this.form.update(f => ({ ...f, [key]: value }));
  }

  protected get feePercentage(): number {
    return this.form().defaultMlFee * 100;
  }
  protected set feePercentage(v: number) {
    this._dirty = true;
    this.form.update(f => ({ ...f, defaultMlFee: (v || 0) / 100 }));
  }

  protected get minMarginPct(): number {
    return this.form().minimumMargin * 100;
  }
  protected set minMarginPct(v: number) {
    this._dirty = true;
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
    const updated = [...current, v];
    this._dirty = true;
    this.form.update(f => ({ ...f, [list]: updated }));
    this.dataService.updateSettings({ [list]: updated } as Partial<Settings>);
  }

  protected drop(event: CdkDragDrop<string[]>, list: ListKey): void {
    const arr = [...this.form()[list]];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this._dirty = true;
    this.form.update(f => ({ ...f, [list]: arr }));
    this.dataService.updateSettings({ [list]: arr } as Partial<Settings>);
  }

  protected removeItem(list: ListKey, item: string): void {
    const updated = this.form()[list].filter(x => x !== item);
    this._dirty = true;
    this.form.update(f => ({ ...f, [list]: updated }));
    this.dataService.updateSettings({ [list]: updated } as Partial<Settings>);
  }

  protected save(): void {
    this._dirty = false;
    this.dataService.updateSettings(this.form());
    this.notify.success('Configurações salvas.');
  }

  protected discard(): void {
    this._dirty = false;
    this.form.set(this.snapshot());
    this.notify.info('Alterações descartadas.');
  }

  protected downloadTemplate(): void {
    this.importService.downloadTemplate(this.form());
  }

  protected triggerImport(): void {
    this.fileInputEl()?.nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const result = await this.importService.parseFile(
      file,
      this.dataService.purchases(),
      this.dataService.sales(),
      this.form(),
    );

    if (result.purchases.length) this.dataService.addPurchasesBulk(result.purchases);
    if (result.sales.length) this.dataService.addSalesBulk(result.sales);

    (event.target as HTMLInputElement).value = '';

    if (result.errors.length === 0 && result.purchases.length === 0 && result.sales.length === 0) {
      this.notify.warning('Nenhum dado encontrado na planilha.');
      return;
    }

    this.dialog.open(ImportResultDialogComponent, {
      data: {
        purchaseCount: result.purchases.length,
        saleCount: result.sales.length,
        errors: result.errors,
      },
      width: '520px',
    });
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
        maxWidth: '95vw',
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
