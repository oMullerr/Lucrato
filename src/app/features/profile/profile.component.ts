import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
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

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      icon="person"
      title="Perfil"
      subtitle="Dados da conta, segurança e zona de perigo"
    />

    <div class="content">
      <!-- Conta -->
      <mat-card class="profile-card">
        <h3 class="card-title">
          <mat-icon>badge</mat-icon>
          Conta
        </h3>

        <div class="info-grid">
          <div class="info-row">
            <span class="info-label">E-mail</span>
            <span class="info-value">{{ email() || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Verificação do e-mail</span>
            <span class="info-value">
              @if (emailVerified()) {
                <span class="badge verified">
                  <mat-icon>verified</mat-icon>
                  Verificado
                </span>
              } @else {
                <span class="badge unverified">
                  <mat-icon>error_outline</mat-icon>
                  Não verificado
                </span>
                <button
                  mat-stroked-button
                  class="verify-btn"
                  (click)="resendVerification()"
                  [disabled]="sendingVerification()"
                >
                  <mat-icon>send</mat-icon>
                  {{ sendingVerification() ? 'Enviando…' : 'Reenviar verificação' }}
                </button>
              }
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Conta criada em</span>
            <span class="info-value">{{ formatDate(createdAt()) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Último acesso</span>
            <span class="info-value">{{ formatDate(lastLogin()) }}</span>
          </div>
        </div>
      </mat-card>

      <!-- Dados da loja -->
      <mat-card class="profile-card">
        <h3 class="card-title">
          <mat-icon>store</mat-icon>
          Dados da loja
        </h3>

        <div class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>Nome da loja</mat-label>
            <input
              matInput
              type="text"
              [ngModel]="storeNameInput()"
              (ngModelChange)="storeNameInput.set($event)"
              autocomplete="organization"
            />
            <mat-hint>Aparece no topo do sistema e em relatórios.</mat-hint>
          </mat-form-field>

          <div class="actions-row">
            <button
              mat-flat-button
              color="primary"
              (click)="saveStoreName()"
              [disabled]="!canSaveStoreName() || savingStoreName()"
            >
              <mat-icon>save</mat-icon>
              {{ savingStoreName() ? 'Salvando…' : 'Salvar nome' }}
            </button>
          </div>
        </div>
      </mat-card>

      <!-- Senha -->
      <mat-card class="profile-card">
        <h3 class="card-title">
          <mat-icon>lock</mat-icon>
          Trocar senha
        </h3>
        <p class="card-description">
          Por segurança, você precisa informar sua senha atual antes de definir uma nova.
        </p>

        <div class="form-grid">
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
              minlength="6"
            />
            <button type="button" mat-icon-button matSuffix (click)="showNewPwd.set(!showNewPwd())">
              <mat-icon>{{ showNewPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-hint>Mínimo 6 caracteres.</mat-hint>
          </mat-form-field>

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
              color="primary"
              (click)="changePassword()"
              [disabled]="!canChangePassword() || changingPassword()"
            >
              <mat-icon>key</mat-icon>
              {{ changingPassword() ? 'Atualizando…' : 'Atualizar senha' }}
            </button>
          </div>
        </div>
      </mat-card>

      <!-- Zona de perigo -->
      <mat-card class="danger-card">
        <h3 class="card-title danger">
          <mat-icon>warning</mat-icon>
          Zona de perigo
        </h3>
        <p>
          Excluir a conta apaga permanentemente todos os seus dados no Lucrato (compras, vendas, configurações)
          e remove o acesso. Esta ação não pode ser desfeita.
        </p>
        <button mat-stroked-button color="warn" (click)="deleteAccount()" [disabled]="deletingAccount()">
          <mat-icon>delete_forever</mat-icon>
          {{ deletingAccount() ? 'Excluindo…' : 'Excluir conta' }}
        </button>
      </mat-card>
    </div>
  `,
  styles: [`
    .content {
      padding: 24px 32px;
      max-width: 880px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .profile-card, .danger-card {
      padding: 22px 24px;
      border: 1px solid var(--brd-default);
      border-radius: 14px;
    }

    .card-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      font-weight: 600;
      color: var(--txt-primary);
      margin: 0 0 18px;
    }

    .card-title mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--clr-blue);
    }

    .card-title.danger {
      color: var(--clr-red);
    }

    .card-title.danger mat-icon {
      color: var(--clr-red);
    }

    .card-description {
      color: var(--txt-secondary);
      font-size: 13px;
      margin: -10px 0 18px;
    }

    .info-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid var(--brd-default);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      font-size: 13px;
      color: var(--txt-secondary);
      font-weight: 500;
    }

    .info-value {
      font-size: 13px;
      color: var(--txt-primary);
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
      text-align: right;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 999px;
    }

    .badge mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .badge.verified {
      color: var(--clr-green);
      background: color-mix(in srgb, var(--clr-green) 14%, transparent);
    }

    .badge.unverified {
      color: var(--clr-yellow, #C57F00);
      background: color-mix(in srgb, var(--clr-yellow, #C57F00) 14%, transparent);
    }

    .verify-btn {
      font-size: 12px;
      height: 32px;
      padding: 0 12px;
    }

    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 460px;
    }

    .form-grid mat-form-field {
      width: 100%;
    }

    .actions-row {
      display: flex;
      gap: 8px;
      margin-top: 6px;
    }

    .danger-card {
      border-color: color-mix(in srgb, var(--clr-red) 30%, var(--brd-default));
      background: color-mix(in srgb, var(--clr-red) 4%, var(--bg-surface));
    }

    .danger-card p {
      color: var(--txt-secondary);
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 16px;
    }

    @media (max-width: 768px) {
      .content { padding: 16px; }
      .profile-card, .danger-card { padding: 16px; }
      .info-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .info-value {
        justify-content: flex-start;
        text-align: left;
      }
    }
  `],
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
    } catch (err: any) {
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
    } catch (err: any) {
      console.error('[Profile] changePassword falhou:', err);
      this.notify.error(this.friendlyAuthError(err?.code));
    } finally {
      this.changingPassword.set(false);
    }
  }

  protected async resendVerification(): Promise<void> {
    this.sendingVerification.set(true);
    try {
      await this.auth.sendVerificationEmail();
      this.notify.success('E-mail de verificação enviado. Confira sua caixa de entrada.');
    } catch (err: any) {
      console.error('[Profile] sendVerificationEmail falhou:', err);
      this.notify.error(this.friendlyAuthError(err?.code));
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
    } catch (err: any) {
      console.error('[Profile] deleteAccount falhou:', err);
      this.notify.error(this.friendlyAuthError(err?.code));
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
