import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { Firestore, deleteDoc, doc } from '@angular/fire/firestore';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { LanguageService } from '../../core/services/language.service';
import { logError } from '../../core/services/logger';
import { validatePasswordStrength } from '../../core/services/password-validator';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { ConfirmDialogComponent, ConfirmDialogResult } from '../../shared/components/confirm-dialog.component';

type StrengthLevel = 0 | 1 | 2 | 3 | 4;

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule,
    PageHeaderComponent,
    TranslateModule,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  protected readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  protected readonly emailVerified = computed(() => this.auth.currentUser()?.emailVerified ?? false);
  protected readonly createdAt = computed(() => this.auth.currentUser()?.metadata.creationTime ?? null);
  protected readonly lastLogin = computed(() => this.auth.currentUser()?.metadata.lastSignInTime ?? null);

  protected readonly storeNameInput = signal(this.auth.storeName());
  protected readonly savingStoreName = signal(false);

  protected readonly currentPwd = signal('');
  protected readonly newPwd = signal('');
  protected readonly confirmPwd = signal('');
  protected readonly showCurrentPwd = signal(false);
  protected readonly showNewPwd = signal(false);
  protected readonly changingPassword = signal(false);

  protected readonly sendingVerification = signal(false);
  protected readonly deletingAccount = signal(false);

  protected readonly initials = computed(() => {
    const name = (this.storeNameInput() ?? '').trim();
    if (!name) return 'L';
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  protected readonly strength = computed<StrengthLevel>(() => {
    const pwd = this.newPwd();
    if (!pwd) return 0;
    let score: StrengthLevel = 0;
    if (pwd.length >= 8) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^\w\s]/.test(pwd) || pwd.length >= 12) score++;
    return score as StrengthLevel;
  });

  protected readonly strengthLabel = computed(() => {
    this.lang.lang(); // re-evaluate when the language changes
    const s = this.strength();
    if (s <= 1) return this.t.instant('profile.strengthWeak');
    if (s <= 2) return this.t.instant('profile.strengthFair');
    if (s === 3) return this.t.instant('profile.strengthGood');
    return this.t.instant('profile.strengthStrong');
  });

  protected readonly strengthClass = computed(() => {
    const s = this.strength();
    if (s <= 1) return 'weak';
    if (s === 4) return 'strong';
    return 'medium';
  });

  protected readonly canSaveStoreName = computed(() => {
    const next = this.storeNameInput().trim();
    return next.length > 0 && next !== this.auth.storeName();
  });

  protected readonly canChangePassword = computed(() => {
    return (
      this.currentPwd().length >= 6 &&
      validatePasswordStrength(this.newPwd()) === null &&
      this.confirmPwd() === this.newPwd() &&
      this.newPwd() !== this.currentPwd()
    );
  });

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  protected async saveStoreName(): Promise<void> {
    const next = this.storeNameInput().trim();
    if (!next) return;
    this.savingStoreName.set(true);
    try {
      await this.auth.updateStoreName(next);
      this.notify.success(this.t.instant('profile.storeNameUpdated'));
    } catch (err: unknown) {
      logError('[Profile] updateStoreName falhou:', err);
      this.notify.error(this.t.instant('profile.storeNameFailed'));
    } finally {
      this.savingStoreName.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    if (!this.canChangePassword()) return;

    const pwdError = validatePasswordStrength(this.newPwd());
    if (pwdError) {
      this.notify.error(this.t.instant(pwdError));
      return;
    }

    this.changingPassword.set(true);
    try {
      await this.auth.changePassword(this.currentPwd(), this.newPwd());
      this.notify.success(this.t.instant('profile.passwordUpdated'));
      this.currentPwd.set('');
      this.newPwd.set('');
      this.confirmPwd.set('');
    } catch (err: unknown) {
      logError('[Profile] changePassword falhou:', err);
      this.notify.error(this.friendlyAuthError((err as { code?: string })?.code));
    } finally {
      this.changingPassword.set(false);
    }
  }

  protected async resendVerification(): Promise<void> {
    this.sendingVerification.set(true);
    try {
      await this.auth.sendVerificationEmail();
      this.notify.success(this.t.instant('profile.verificationSent'));
    } catch (err: unknown) {
      logError('[Profile] sendVerificationEmail falhou:', err);
      this.notify.error(this.friendlyAuthError((err as { code?: string })?.code));
    } finally {
      this.sendingVerification.set(false);
    }
  }

  protected deleteAccount(): void {
    const storeName = this.auth.storeName();
    this.dialog
      .open<ConfirmDialogComponent, unknown, ConfirmDialogResult>(ConfirmDialogComponent, {
        data: {
          title: this.t.instant('profile.deleteTitle'),
          message: this.t.instant('profile.deleteMessage'),
          danger: true,
          confirmText: this.t.instant('profile.deleteConfirm'),
          requireTextMatch: storeName,
          requireTextLabel: this.t.instant('profile.deleteTypeStore'),
          requirePassword: true,
          requirePasswordLabel: this.t.instant('dialogs.currentPassword'),
        },
        width: '500px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(async result => {
        if (!result || !result.confirmed || !result.password) return;
        await this.performAccountDeletion(result.password);
      });
  }

  private async performAccountDeletion(password: string): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) {
      this.notify.error(this.t.instant('profile.sessionExpired'));
      return;
    }

    this.deletingAccount.set(true);
    try {
      await this.auth.reauthenticate(password);
      await deleteDoc(doc(this.firestore, `users/${uid}/db/main`));
      await this.auth.deleteAccount();
      this.notify.success(this.t.instant('profile.accountDeleted'));
      this.router.navigate(['/login']);
    } catch (err: unknown) {
      logError('[Profile] deleteAccount falhou:', err);
      this.notify.error(this.friendlyAuthError((err as { code?: string })?.code));
    } finally {
      this.deletingAccount.set(false);
    }
  }

  private friendlyAuthError(code: string | undefined): string {
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return this.t.instant('profile.errWrongPassword');
      case 'auth/weak-password':
        return this.t.instant('profile.errWeakPassword');
      case 'auth/too-many-requests':
        return this.t.instant('profile.errTooManyRequests');
      case 'auth/requires-recent-login':
        return this.t.instant('profile.errRecentLogin');
      case 'auth/network-request-failed':
        return this.t.instant('profile.errNetwork');
      default:
        return this.t.instant('profile.errGeneric');
    }
  }
}
