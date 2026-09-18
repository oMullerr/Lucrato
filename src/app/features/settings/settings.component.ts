import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Settings } from '../../core/models/models';
import { DEFAULT_FISCAL_CONFIG } from '../../core/fiscal/fiscal-regimes';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { ImportService } from '../../core/services/import.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { ImportResultDialogComponent } from './import-result-dialog.component';
import { EditableListComponent } from './editable-list.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { TabsComponent } from '../../shared/ui/tabs/tabs.component';
import { TabComponent } from '../../shared/ui/tabs/tab.component';

const DEFAULT_SETTINGS: Settings = {
  defaultMlFee: 0.12,
  yellowAlertDays: 25,
  redAlertDays: 30,
  minimumMargin: 0.10,
  lowStockAlert: 1,
  defaultShipping: 0,
  returnWindowDays: 30,
  defaultChannel: 'Mercado Livre',
  categories: [],
  categoryColors: {},
  suppliers: [],
  supplierColors: {},
  channels: [],
  channelColors: {},
  fiscal: DEFAULT_FISCAL_CONFIG,
  dasPaidMonths: [],
  dasnDeclaredYears: [],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Campos que ESTA tela edita.
 *
 * A lista é explícita de propósito. `Settings` guarda coisas que outras telas
 * mandam — `mlAutoApply` (interruptor em Integrações), `fiscal`, `dasPaidMonths`
 * e `dasnDeclaredYears` (tela Fiscal) — e o diff do salvamento percorria TODAS
 * as chaves do objeto. Com o formulário aberto e o valor mudado em outra tela,
 * salvar aqui devolveria o valor velho por cima: o dono desligaria o
 * auto-aplicar em Integrações, salvaria uma cor de categoria aqui, e o
 * auto-aplicar voltaria a ligar sozinho.
 */
const CAMPOS_DO_FORMULARIO = [
  'defaultMlFee',
  'minimumMargin',
  'yellowAlertDays',
  'redAlertDays',
  'lowStockAlert',
  'defaultShipping',
  'returnWindowDays',
  'defaultChannel',
  'categories',
  'categoryColors',
  'suppliers',
  'supplierColors',
  'channels',
  'channelColors',
] as const satisfies readonly (keyof Settings)[];

/** Só o que o formulário edita — o resto de `Settings` não passa por aqui. */
type FormSettings = Pick<Settings, (typeof CAMPOS_DO_FORMULARIO)[number]>;

/**
 * Recorta `Settings` no que esta tela edita.
 *
 * O recorte é o que impede o salvamento de devolver ao servidor um valor
 * antigo de campo que pertence a outra tela. Comparar e gravar só o que se
 * possui é mais barato que lembrar de excluir o que não se possui.
 */
function projetar(s: Settings): FormSettings {
  const saida = {} as Record<string, unknown>;
  for (const campo of CAMPOS_DO_FORMULARIO) saida[campo] = s[campo];
  return clone(saida) as FormSettings;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonComponent, IconComponent, FieldComponent, InputDirective,
    SelectComponent, OptionComponent, TabsComponent, TabComponent,
    PageHeaderComponent, EditableListComponent,
    TranslateModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly dataService = inject(DataService);
  private readonly importService = inject(ImportService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(DialogService);
  private readonly t = inject(TranslateService);

  private readonly fileInputEl = viewChild<ElementRef<HTMLInputElement>>('fileInputRef');

  /**
   * O que está gravado, lido do `DataService`.
   *
   * Esta tela mantinha um `onSnapshot` PRÓPRIO sobre `users/{uid}/db/main` e
   * uma segunda cópia da composição de defaults — duas listas para discordarem
   * entre si, e elas já discordavam: a daqui não conhecia `mlAutoApply` nem
   * `taxPercentage`. Além da leitura duplicada (o documento é o mesmo que o
   * DataService já escuta a sessão inteira), qualquer campo novo precisava ser
   * lembrado em dois lugares, e esquecer o segundo não quebrava nada
   * visivelmente — só fazia a tela salvar por cima do que não conhecia.
   */
  private readonly serverSettings = computed<FormSettings | null>(() => {
    const s = this.dataService.settings();
    return s ? projetar(s) : null;
  });
  protected readonly form = signal<FormSettings>(projetar(DEFAULT_SETTINGS));
  private readonly appliedBaseline = signal<FormSettings>(projetar(DEFAULT_SETTINGS));
  protected readonly saving = signal(false);
  protected readonly importing = signal(false);
  protected readonly migrando = signal(false);

  /** Exposto ao template: o card de armazenamento lê os contadores daqui. */
  protected readonly data = this.dataService;

  protected readonly hasChanges = computed(() => {
    const a = this.serverSettings() ?? projetar(DEFAULT_SETTINGS);
    const b = this.form();
    return JSON.stringify(a) !== JSON.stringify(b);
  });

  constructor() {
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

  protected updateField<K extends keyof FormSettings>(key: K, value: FormSettings[K]): void {
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
    const b = this.serverSettings() ?? projetar(DEFAULT_SETTINGS);
    this.form.set(clone(b));
    this.appliedBaseline.set(clone(b));
    this.notify.info(this.t.instant('settings.discarded'));
  }

  protected downloadTemplate(): void {
    // O modelo precisa do objeto inteiro; o formulário só edita um recorte.
    this.importService.downloadTemplate({ ...DEFAULT_SETTINGS, ...this.form() });
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
        // O parser lê o objeto inteiro; o formulário só edita um recorte dele.
        this.dataService.settings() ?? { ...DEFAULT_SETTINGS, ...this.form() },
        this.dataService.returns(),
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
        size: 'md',
      });
    } catch (err) {
      logError('[Settings] Importação falhou:', err);
      this.notify.error(this.t.instant('settings.importError'));
    } finally {
      this.importing.set(false);
    }
  }

  /**
   * Move o razão para as subcoleções.
   *
   * Não pede confirmação porque não destrói nada: copia, marca o formato novo e
   * deixa a base antiga intacta em `db/main`. O passo que apaga é outro.
   */
  protected async migrar(): Promise<void> {
    if (this.migrando()) return;
    this.migrando.set(true);
    try {
      const t = await this.dataService.migrarParaSubcolecoes();
      this.notify.success(
        this.t.instant('settings.storageMigrated', { p: t.purchases, v: t.sales, d: t.returns }),
      );
    } catch (err) {
      logError('[Settings] migração falhou:', err);
      this.notify.error(this.t.instant('settings.storageMigrateError'));
    } finally {
      this.migrando.set(false);
    }
  }

  /** Apaga os arrays antigos. Este SIM pede confirmação: é irreversível. */
  protected limparLegado(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.t.instant('settings.storageCleanup'),
          message: this.t.instant('settings.storageCleanupConfirm'),
          danger: true,
          confirmText: this.t.instant('settings.storageCleanup'),
        },
        size: 'sm',
      })
      .afterClosed()
      .subscribe(async confirmado => {
        if (!confirmado) return;
        this.migrando.set(true);
        try {
          await this.dataService.limparRazaoLegado();
          this.notify.success(this.t.instant('settings.storageCleaned'));
        } catch (err) {
          logError('[Settings] limpeza do legado falhou:', err);
          this.notify.error(this.t.instant('settings.storageMigrateError'));
        } finally {
          this.migrando.set(false);
        }
      });
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
        size: 'sm',
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

  /**
   * O que mudou, percorrendo SÓ os campos que esta tela possui.
   *
   * Antes percorria `Object.keys(next)`, e `next` carregava o objeto inteiro —
   * inclusive `mlAutoApply` e a configuração fiscal, que outras telas escrevem.
   * Bastava o formulário estar aberto com um valor velho em memória para o
   * salvamento devolvê-lo ao servidor por cima do novo.
   */
  private buildDiff(base: FormSettings | null, next: FormSettings): { [field: string]: unknown } {
    const diff: { [field: string]: unknown } = {};
    for (const k of CAMPOS_DO_FORMULARIO) {
      if (!base || JSON.stringify(base[k]) !== JSON.stringify(next[k])) {
        diff[`settings.${k}`] = next[k];
      }
    }
    return diff;
  }

  private validate(s: FormSettings): string | null {
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
    if (!Number.isInteger(s.returnWindowDays) || s.returnWindowDays <= 0)
      return this.t.instant('settings.valReturnWindow');
    return null;
  }
}
