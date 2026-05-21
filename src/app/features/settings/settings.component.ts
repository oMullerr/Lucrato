import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
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
import { Firestore, doc, onSnapshot, setDoc, Unsubscribe } from '@angular/fire/firestore';
import { Settings } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { ImportService } from '../../core/services/import.service';
import { NotifyService } from '../../core/services/notify.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { ImportResultDialogComponent } from './import-result-dialog.component';

type ListKey = 'categories' | 'suppliers' | 'channels';

const DEFAULT_SETTINGS: Settings = {
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

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

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
export class SettingsComponent implements OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly dataService = inject(DataService);
  private readonly importService = inject(ImportService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  private readonly fileInputEl = viewChild<ElementRef<HTMLInputElement>>('fileInputRef');

  protected readonly separators = [ENTER, COMMA];

  private readonly serverSettings = signal<Settings | null>(null);
  protected readonly form = signal<Settings>(clone(DEFAULT_SETTINGS));
  private readonly appliedBaseline = signal<Settings>(clone(DEFAULT_SETTINGS));
  protected readonly saving = signal(false);
  private snapshotUnsub: Unsubscribe | null = null;

  protected readonly hasChanges = computed(() => {
    const a = this.serverSettings() ?? DEFAULT_SETTINGS;
    const b = this.form();
    return JSON.stringify(a) !== JSON.stringify(b);
  });

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.attachListener(user.uid);
      } else if (user === null) {
        this.detachListener();
        this.serverSettings.set(null);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      const b = this.serverSettings();
      if (!b) return;
      untracked(() => {
        const f = this.form();
        const applied = this.appliedBaseline();
        const bSerialized = JSON.stringify(b);
        const userEdited = JSON.stringify(f) !== JSON.stringify(applied);
        if (!userEdited && JSON.stringify(f) !== bSerialized) {
          this.form.set(clone(b));
        }
        if (JSON.stringify(applied) !== bSerialized) {
          this.appliedBaseline.set(clone(b));
        }
      });
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    this.detachListener();
  }

  private attachListener(uid: string): void {
    this.detachListener();
    const ref = doc(this.firestore, `users/${uid}/db/main`);
    this.snapshotUnsub = onSnapshot(
      ref,
      snap => {
        const data = snap.exists() ? (snap.data() as { settings?: Partial<Settings> }) : null;
        const raw = data?.settings ?? null;
        const composed: Settings = {
          defaultMlFee: raw?.defaultMlFee ?? DEFAULT_SETTINGS.defaultMlFee,
          yellowAlertDays: raw?.yellowAlertDays ?? DEFAULT_SETTINGS.yellowAlertDays,
          redAlertDays: raw?.redAlertDays ?? DEFAULT_SETTINGS.redAlertDays,
          minimumMargin: raw?.minimumMargin ?? DEFAULT_SETTINGS.minimumMargin,
          lowStockAlert: raw?.lowStockAlert ?? DEFAULT_SETTINGS.lowStockAlert,
          defaultShipping: raw?.defaultShipping ?? DEFAULT_SETTINGS.defaultShipping,
          defaultChannel: raw?.defaultChannel ?? DEFAULT_SETTINGS.defaultChannel,
          categories: raw?.categories ?? DEFAULT_SETTINGS.categories,
          suppliers: raw?.suppliers ?? DEFAULT_SETTINGS.suppliers,
          channels: raw?.channels ?? DEFAULT_SETTINGS.channels,
        };
        console.log('[Settings] snapshot recebido. exists=', snap.exists(), 'fromCache=', snap.metadata.fromCache, 'settings=', composed);
        this.serverSettings.set(composed);
      },
      err => {
        console.error('[Settings] onSnapshot falhou:', err);
      }
    );
  }

  private detachListener(): void {
    if (this.snapshotUnsub) {
      this.snapshotUnsub();
      this.snapshotUnsub = null;
    }
  }

  protected updateField<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.form.update(f => ({ ...f, [key]: value }));
  }

  protected get feePct(): number {
    return this.form().defaultMlFee * 100;
  }
  protected set feePct(v: number) {
    this.updateField('defaultMlFee', (Number(v) || 0) / 100);
  }

  protected get minMarginPct(): number {
    return this.form().minimumMargin * 100;
  }
  protected set minMarginPct(v: number) {
    this.updateField('minimumMargin', (Number(v) || 0) / 100);
  }

  protected addItem(list: ListKey, value: string): void {
    const v = (value ?? '').trim();
    if (!v) return;
    const cur = this.form()[list];
    if (cur.includes(v)) {
      this.notify.warning(`"${v}" já existe na lista.`);
      return;
    }
    this.updateField(list, [...cur, v] as Settings[typeof list]);
  }

  protected drop(event: CdkDragDrop<string[]>, list: ListKey): void {
    const arr = [...this.form()[list]];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.updateField(list, arr as Settings[typeof list]);
  }

  protected removeItem(list: ListKey, item: string): void {
    const cur = this.form()[list];
    this.updateField(list, cur.filter(x => x !== item) as Settings[typeof list]);
  }

  protected async save(): Promise<void> {
    const next = this.form();

    const validationError = this.validate(next);
    if (validationError) {
      this.notify.error(validationError);
      return;
    }

    const diff = this.buildDiff(this.serverSettings(), next);
    if (Object.keys(diff).length === 0) {
      this.notify.info('Nada para salvar.');
      return;
    }

    const ref = this.settingsDocRef();
    if (!ref) {
      this.notify.error('Sessão expirada. Faça login novamente.');
      return;
    }

    const payload: { settings: Partial<Settings> } = { settings: {} };
    for (const [key, value] of Object.entries(diff)) {
      const field = key.split('.')[1] as keyof Settings;
      (payload.settings as Record<string, unknown>)[field] = value;
    }

    this.saving.set(true);
    try {
      await setDoc(ref, payload, { merge: true });
      this.notify.success('Configurações salvas.');
    } catch (err) {
      console.error('[Settings] setDoc falhou:', err);
      this.notify.error('Erro ao salvar configurações. Verifique sua conexão.');
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    const b = this.serverSettings() ?? DEFAULT_SETTINGS;
    this.form.set(clone(b));
    this.appliedBaseline.set(clone(b));
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
    const storeName = this.auth.storeName();
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Resetar dados',
          message: 'Isso vai apagar PERMANENTEMENTE todos os dados (compras, vendas, configurações). Os parâmetros do sistema voltarão a zero e as listas ficarão vazias. Não há como desfazer.',
          danger: true,
          confirmText: 'Sim, resetar tudo',
          requireTextMatch: storeName,
          requireTextLabel: 'Digite o nome da loja para confirmar',
        },
        width: '460px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(async confirmed => {
        if (confirmed) {
          await this.dataService.reset();
          this.notify.success('Sistema resetado para o estado inicial.');
        }
      });
  }

  private settingsDocRef() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return null;
    return doc(this.firestore, `users/${uid}/db/main`);
  }

  private buildDiff(base: Settings | null, next: Settings): { [field: string]: unknown } {
    const diff: { [field: string]: unknown } = {};
    (Object.keys(next) as (keyof Settings)[]).forEach(k => {
      if (!base || JSON.stringify(base[k]) !== JSON.stringify(next[k])) {
        diff[`settings.${k}`] = next[k];
      }
    });
    return diff;
  }

  private validate(s: Settings): string | null {
    if (!Number.isFinite(s.defaultMlFee) || s.defaultMlFee < 0 || s.defaultMlFee > 1)
      return 'Taxa do Mercado Livre deve estar entre 0% e 100%.';
    if (!Number.isFinite(s.minimumMargin) || s.minimumMargin < 0 || s.minimumMargin > 1)
      return 'Margem mínima deve estar entre 0% e 100%.';
    if (!Number.isInteger(s.yellowAlertDays) || s.yellowAlertDays <= 0)
      return 'Dias para alerta amarelo deve ser inteiro maior que zero.';
    if (!Number.isInteger(s.redAlertDays) || s.redAlertDays <= 0)
      return 'Dias para alerta vermelho deve ser inteiro maior que zero.';
    if (s.redAlertDays < s.yellowAlertDays)
      return 'Dias para alerta vermelho deve ser maior ou igual ao amarelo.';
    if (!Number.isInteger(s.lowStockAlert) || s.lowStockAlert < 0)
      return 'Alerta de estoque baixo deve ser inteiro não-negativo.';
    if (!Number.isFinite(s.defaultShipping) || s.defaultShipping < 0)
      return 'Frete padrão não pode ser negativo.';
    return null;
  }
}
