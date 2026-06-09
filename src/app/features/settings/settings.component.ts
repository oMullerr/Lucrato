import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { Firestore, doc, onSnapshot, setDoc, Unsubscribe } from '@angular/fire/firestore';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Settings } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { ImportService } from '../../core/services/import.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { ImportResultDialogComponent } from './import-result-dialog.component';
import { EditableListComponent } from './editable-list.component';

const DEFAULT_SETTINGS: Settings = {
  defaultMlFee: 0.12,
  yellowAlertDays: 25,
  redAlertDays: 30,
  minimumMargin: 0.10,
  lowStockAlert: 1,
  defaultShipping: 0,
  defaultChannel: 'Mercado Livre',
  categories: [],
  categoryColors: {},
  suppliers: [],
  supplierColors: {},
  channels: [],
  channelColors: {},
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTabsModule,
    PageHeaderComponent, EditableListComponent,
    TranslateModule,
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
  private readonly t = inject(TranslateService);

  private readonly fileInputEl = viewChild<ElementRef<HTMLInputElement>>('fileInputRef');

  private readonly serverSettings = signal<Settings | null>(null);
  protected readonly form = signal<Settings>(clone(DEFAULT_SETTINGS));
  private readonly appliedBaseline = signal<Settings>(clone(DEFAULT_SETTINGS));
  protected readonly saving = signal(false);
  protected readonly importing = signal(false);
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
          categoryColors: raw?.categoryColors ?? DEFAULT_SETTINGS.categoryColors,
          suppliers: raw?.suppliers ?? DEFAULT_SETTINGS.suppliers,
          supplierColors: raw?.supplierColors ?? DEFAULT_SETTINGS.supplierColors,
          channels: raw?.channels ?? DEFAULT_SETTINGS.channels,
          channelColors: raw?.channelColors ?? DEFAULT_SETTINGS.channelColors,
        };
        this.serverSettings.set(composed);
      },
      err => {
        logError('[Settings] onSnapshot falhou:', err);
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

  protected clamp0(value: string | number | null): number {
    return Math.max(0, +(value ?? 0) || 0);
  }

  protected get feePct(): number {
    return this.form().defaultMlFee * 100;
  }
  protected set feePct(v: number) {
    this.updateField('defaultMlFee', this.clamp0(v) / 100);
  }

  protected get minMarginPct(): number {
    return this.form().minimumMargin * 100;
  }
  protected set minMarginPct(v: number) {
    this.updateField('minimumMargin', this.clamp0(v) / 100);
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
      this.notify.info(this.t.instant('settings.nothingToSave'));
      return;
    }

    const ref = this.settingsDocRef();
    if (!ref) {
      this.notify.error(this.t.instant('profile.sessionExpired'));
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
      this.notify.success(this.t.instant('settings.saved'));
    } catch (err) {
      logError('[Settings] setDoc falhou:', err);
      this.notify.error(this.t.instant('settings.saveError'));
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    const b = this.serverSettings() ?? DEFAULT_SETTINGS;
    this.form.set(clone(b));
    this.appliedBaseline.set(clone(b));
    this.notify.info(this.t.instant('settings.discarded'));
  }

  protected downloadTemplate(): void {
    this.importService.downloadTemplate(this.form());
  }

  protected triggerImport(): void {
    this.fileInputEl()?.nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED_EXT = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const ext = fileName.slice(fileName.lastIndexOf('.'));

    if (!ALLOWED_EXT.includes(ext)) {
      this.notify.error(this.t.instant('settings.onlyExcel'));
      input.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      this.notify.error(this.t.instant('settings.fileTooLarge'));
      input.value = '';
      return;
    }

    this.importing.set(true);
    try {
      const result = await this.importService.parseFile(
        file,
        this.dataService.purchases(),
        this.dataService.sales(),
        this.form(),
      );

      if (result.purchases.length || result.sales.length) {
        await this.dataService.bulkImport(result.purchases, result.sales);
      }

      (event.target as HTMLInputElement).value = '';

      if (result.errors.length === 0 && result.purchases.length === 0 && result.sales.length === 0) {
        this.notify.warning(this.t.instant('settings.noDataInSheet'));
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
    } catch (err) {
      logError('[Settings] Importação falhou:', err);
      this.notify.error(this.t.instant('settings.importError'));
    } finally {
      this.importing.set(false);
    }
  }

  protected resetAll(): void {
    const storeName = this.auth.storeName();
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.t.instant('settings.resetTitle'),
          message: this.t.instant('settings.resetMessage'),
          danger: true,
          confirmText: this.t.instant('settings.resetConfirm'),
          requireTextMatch: storeName,
          requireTextLabel: this.t.instant('profile.deleteTypeStore'),
        },
        width: '460px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(async confirmed => {
        if (confirmed) {
          await this.dataService.reset();
          this.notify.success(this.t.instant('settings.resetDone'));
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
      return this.t.instant('settings.valFee');
    if (!Number.isFinite(s.minimumMargin) || s.minimumMargin < 0 || s.minimumMargin > 1)
      return this.t.instant('settings.valMargin');
    if (!Number.isInteger(s.yellowAlertDays) || s.yellowAlertDays <= 0)
      return this.t.instant('settings.valYellow');
    if (!Number.isInteger(s.redAlertDays) || s.redAlertDays <= 0)
      return this.t.instant('settings.valRed');
    if (s.redAlertDays < s.yellowAlertDays)
      return this.t.instant('settings.valRedGteYellow');
    if (!Number.isInteger(s.lowStockAlert) || s.lowStockAlert < 0)
      return this.t.instant('settings.valLowStock');
    if (!Number.isFinite(s.defaultShipping) || s.defaultShipping < 0)
      return this.t.instant('settings.valShipping');
    return null;
  }
}
