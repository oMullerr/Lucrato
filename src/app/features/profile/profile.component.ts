import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { Firestore, deleteDoc, doc } from '@angular/fire/firestore';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
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
  ],
  template: `
    <app-page-header
      title="Perfil"
      eyebrow="CONTA"
      subtitle="Dados da loja, segurança e zona de perigo"
    />

    <div class="page-content profile-body">

      <!-- Hero -->
      <section class="profile-hero">
        <div class="avatar-lg" aria-hidden="true">{{ initials() }}</div>
        <div class="hero-info">
          <h1 class="hero-name">{{ storeNameInput() || 'Sua loja' }}</h1>
          <span class="hero-email">{{ email() || '—' }}</span>
          <div class="hero-meta">
            <span>Conta criada<strong>{{ formatDate(createdAt()) }}</strong></span>
            <span>Último acesso<strong>{{ formatDate(lastLogin()) }}</strong></span>
          </div>
        </div>
      </section>

      <!-- Email verification banner (when not verified) -->
      @if (!emailVerified()) {
        <section class="verify-banner" aria-live="polite">
          <mat-icon class="vb-icon">mark_email_unread</mat-icon>
          <div class="vb-text">
            <strong>Confirme seu e-mail para liberar todos os recursos</strong>
            <p>Enviamos um link de verificação. Confira sua caixa de entrada e spam.</p>
          </div>
          <button
            mat-stroked-button
            (click)="resendVerification()"
            [disabled]="sendingVerification()"
          >
            <mat-icon>send</mat-icon>
            {{ sendingVerification() ? 'Enviando…' : 'Reenviar' }}
          </button>
        </section>
      }

      <!-- Conta section -->
      <section class="profile-section">
        <header class="section-head">
          <h2>Identidade da loja</h2>
          <p>O nome aparece no topo do sistema e nos relatórios exportados.</p>
        </header>
        <div class="section-body form-grid">
          <mat-form-field appearance="outline">
            <mat-label>Nome da loja</mat-label>
            <input
              matInput
              type="text"
              [ngModel]="storeNameInput()"
              (ngModelChange)="storeNameInput.set($event)"
              autocomplete="organization"
            />
          </mat-form-field>

          <div class="actions-row">
            <button
              mat-flat-button
              class="primary-cta"
              (click)="saveStoreName()"
              [disabled]="!canSaveStoreName() || savingStoreName()"
            >
              <mat-icon>save</mat-icon>
              {{ savingStoreName() ? 'Salvando…' : 'Salvar nome' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Senha section -->
      <section class="profile-section">
        <header class="section-head">
          <h2>Senha de acesso</h2>
          <p>Informe a senha atual antes de definir uma nova.</p>
        </header>
        <div class="section-body form-grid">
          <mat-form-field appearance="outline">
            <mat-label>Senha atual</mat-label>
            <input
              matInput
              [type]="showCurrentPwd() ? 'text' : 'password'"
              [ngModel]="currentPwd()"
              (ngModelChange)="currentPwd.set($event)"
              autocomplete="current-password"
            />
            <button type="button" mat-icon-button matSuffix (click)="showCurrentPwd.set(!showCurrentPwd())">
              <mat-icon>{{ showCurrentPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Nova senha</mat-label>
            <input
              matInput
              [type]="showNewPwd() ? 'text' : 'password'"
              [ngModel]="newPwd()"
              (ngModelChange)="newPwd.set($event)"
              autocomplete="new-password"
              minlength="8"
            />
            <button type="button" mat-icon-button matSuffix (click)="showNewPwd.set(!showNewPwd())">
              <mat-icon>{{ showNewPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>

          @if (newPwd().length > 0) {
            <div class="strength-meter" aria-live="polite">
              <div class="strength-bars">
                <span class="strength-bar" [class.active-weak]="strength() >= 1" [class.active-medium]="strength() >= 2 && strength() < 4" [class.active-strong]="strength() >= 4"></span>
                <span class="strength-bar" [class.active-weak]="strength() >= 2" [class.active-medium]="strength() >= 2 && strength() < 4" [class.active-strong]="strength() >= 4"></span>
                <span class="strength-bar" [class.active-medium]="strength() >= 3 && strength() < 4" [class.active-strong]="strength() >= 4"></span>
                <span class="strength-bar" [class.active-strong]="strength() >= 4"></span>
              </div>
              <span class="strength-label" [class]="strengthClass()">{{ strengthLabel() }}</span>
            </div>
          }

          <mat-form-field appearance="outline">
            <mat-label>Confirmar nova senha</mat-label>
            <input
              matInput
              [type]="showNewPwd() ? 'text' : 'password'"
              [ngModel]="confirmPwd()"
              (ngModelChange)="confirmPwd.set($event)"
              autocomplete="new-password"
            />
            @if (confirmPwd() && confirmPwd() !== newPwd()) {
              <mat-error>As senhas não coincidem.</mat-error>
            }
          </mat-form-field>

          <div class="actions-row">
            <button
              mat-flat-button
              class="primary-cta"
              (click)="changePassword()"
              [disabled]="!canChangePassword() || changingPassword()"
            >
              <mat-icon>key</mat-icon>
              {{ changingPassword() ? 'Atualizando…' : 'Atualizar senha' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Danger -->
      <section class="danger-section">
        <header class="section-head">
          <h2>Zona de perigo</h2>
        </header>
        <p>
          Excluir a conta apaga permanentemente todos os seus dados no Lucrato (compras, vendas, configurações)
          e remove o acesso. Esta ação não pode ser desfeita.
        </p>
        <button mat-stroked-button class="danger-btn" (click)="deleteAccount()" [disabled]="deletingAccount()">
          <mat-icon>delete_forever</mat-icon>
          {{ deletingAccount() ? 'Excluindo…' : 'Excluir conta' }}
        </button>
      </section>
    </div>
  `,
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);

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
    const s = this.strength();
    if (s <= 1) return 'Fraca';
    if (s <= 2) return 'Razoável';
    if (s === 3) return 'Boa';
    return 'Forte';
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
      this.notify.success('Nome da loja atualizado.');
    } catch (err: unknown) {
      console.error('[Profile] updateStoreName falhou:', err);
      this.notify.error('Não foi possível atualizar o nome da loja.');
    } finally {
      this.savingStoreName.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    if (!this.canChangePassword()) return;

    const pwdError = validatePasswordStrength(this.newPwd());
    if (pwdError) {
      this.notify.error(pwdError);
      return;
    }

    this.changingPassword.set(true);
    try {
      await this.auth.changePassword(this.currentPwd(), this.newPwd());
      this.notify.success('Senha atualizada com sucesso.');
      this.currentPwd.set('');
      this.newPwd.set('');
      this.confirmPwd.set('');
    } catch (err: unknown) {
      console.error('[Profile] changePassword falhou:', err);
      this.notify.error(this.friendlyAuthError((err as { code?: string })?.code));
    } finally {
      this.changingPassword.set(false);
    }
  }

  protected async resendVerification(): Promise<void> {
    this.sendingVerification.set(true);
    try {
      await this.auth.sendVerificationEmail();
      this.notify.success('E-mail de verificação enviado. Confira sua caixa de entrada.');
    } catch (err: unknown) {
      console.error('[Profile] sendVerificationEmail falhou:', err);
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
          title: 'Excluir conta',
          message:
            'Isso vai apagar PERMANENTEMENTE sua conta, todos os dados (compras, vendas, configurações) e seu acesso ao Lucrato. Esta ação é irreversível.',
          danger: true,
          confirmText: 'Sim, excluir minha conta',
          requireTextMatch: storeName,
          requireTextLabel: 'Digite o nome da loja para confirmar',
          requirePassword: true,
          requirePasswordLabel: 'Senha atual',
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
      this.notify.error('Sessão expirada. Faça login novamente.');
      return;
    }

    this.deletingAccount.set(true);
    try {
      await this.auth.reauthenticate(password);
      await deleteDoc(doc(this.firestore, `users/${uid}/db/main`));
      await this.auth.deleteAccount();
      this.notify.success('Conta excluída.');
      this.router.navigate(['/login']);
    } catch (err: unknown) {
      console.error('[Profile] deleteAccount falhou:', err);
      this.notify.error(this.friendlyAuthError((err as { code?: string })?.code));
    } finally {
      this.deletingAccount.set(false);
    }
  }

  private friendlyAuthError(code: string | undefined): string {
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Senha atual incorreta.';
      case 'auth/weak-password':
        return 'A nova senha deve ter pelo menos 6 caracteres.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
      case 'auth/requires-recent-login':
        return 'Por segurança, faça login novamente antes desta ação.';
      case 'auth/network-request-failed':
        return 'Falha de conexão. Verifique sua internet.';
      default:
        return 'Não foi possível concluir a operação. Tente novamente.';
    }
  }
}
