import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatTabsModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="brand">
          <div class="logo">
            <img src="favicon.svg" alt="Lucrato" width="32" height="32" />
          </div>
          <div>
            <h1>Lucrato</h1>
            <p>Gestão de estoque e vendas</p>
          </div>
        </div>

        <mat-tab-group dynamicHeight>
          <!-- LOGIN TAB -->
          <mat-tab label="Entrar">
            <form class="form" (ngSubmit)="login()" #loginForm="ngForm">
              <mat-form-field>
                <mat-label>E-mail</mat-label>
                <input matInput type="email" name="email" [(ngModel)]="loginEmail" required autocomplete="email" />
                <mat-icon matSuffix>email</mat-icon>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Senha</mat-label>
                <input matInput [type]="showLoginPwd() ? 'text' : 'password'" name="password"
                  [(ngModel)]="loginPassword" required autocomplete="current-password" minlength="6" />
                <button type="button" mat-icon-button matSuffix (click)="showLoginPwd.set(!showLoginPwd())">
                  <mat-icon>{{ showLoginPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </mat-form-field>

              @if (loginError()) {
                <div class="error-msg">{{ loginError() }}</div>
              }

              <button mat-flat-button color="primary" type="submit" [disabled]="loginLoading() || loginForm.invalid">
                @if (loginLoading()) {
                  <mat-spinner diameter="20" />
                } @else {
                  Entrar
                }
              </button>
            </form>
          </mat-tab>

          <!-- REGISTER TAB -->
          <mat-tab label="Criar conta">
            <form class="form" (ngSubmit)="register()" #regForm="ngForm">
              <mat-form-field>
                <mat-label>Nome da loja</mat-label>
                <input matInput type="text" name="storeName" [(ngModel)]="regStoreName" required />
                <mat-icon matSuffix>store</mat-icon>
              </mat-form-field>

              <mat-form-field>
                <mat-label>E-mail</mat-label>
                <input matInput type="email" name="email" [(ngModel)]="regEmail" required autocomplete="email" />
                <mat-icon matSuffix>email</mat-icon>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Senha</mat-label>
                <input matInput [type]="showRegPwd() ? 'text' : 'password'" name="password"
                  [(ngModel)]="regPassword" required autocomplete="new-password" minlength="6" />
                <button type="button" mat-icon-button matSuffix (click)="showRegPwd.set(!showRegPwd())">
                  <mat-icon>{{ showRegPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
                <mat-hint>Mínimo 6 caracteres</mat-hint>
              </mat-form-field>

              @if (regError()) {
                <div class="error-msg">{{ regError() }}</div>
              }

              <button mat-flat-button color="primary" type="submit" [disabled]="regLoading() || regForm.invalid">
                @if (regLoading()) {
                  <mat-spinner diameter="20" />
                } @else {
                  Criar conta
                }
              </button>
            </form>
          </mat-tab>
        </mat-tab-group>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-base);
      padding: 24px;
    }

    .login-card {
      width: 100%;
      max-width: 420px;
      background: var(--bg-surface);
      border: 1px solid var(--brd-default);
      border-radius: 16px;
      padding: 32px;
      box-shadow: var(--shadow-lg);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 28px;
    }

    .logo {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, var(--clr-blue), var(--clr-purple));
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-sm);
      flex-shrink: 0;
    }

    .brand h1 {
      font-size: 22px;
      font-weight: 700;
      color: var(--txt-primary);
      margin: 0;
      letter-spacing: -0.5px;
    }

    .brand p {
      font-size: 12px;
      color: var(--txt-secondary);
      margin: 2px 0 0;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 20px 0 8px;

      mat-form-field { width: 100%; }

      button[type="submit"] {
        height: 44px;
        font-size: 14px;
        font-weight: 600;
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
    }

    .error-msg {
      font-size: 12.5px;
      color: var(--clr-red);
      padding: 8px 12px;
      background: color-mix(in srgb, var(--clr-red) 12%, transparent);
      border-radius: 8px;
      border-left: 3px solid var(--clr-red);
    }
  `],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  loginEmail = '';
  loginPassword = '';
  loginError = signal('');
  loginLoading = signal(false);
  showLoginPwd = signal(false);

  regStoreName = '';
  regEmail = '';
  regPassword = '';
  regError = signal('');
  regLoading = signal(false);
  showRegPwd = signal(false);

  async login(): Promise<void> {
    this.loginError.set('');
    this.loginLoading.set(true);
    try {
      await this.authService.login(this.loginEmail, this.loginPassword);
      await this.router.navigate(['/inventory']);
    } catch (e: any) {
      this.loginError.set(this.friendlyError(e?.code));
    } finally {
      this.loginLoading.set(false);
    }
  }

  async register(): Promise<void> {
    this.regError.set('');
    this.regLoading.set(true);
    try {
      await this.authService.register(this.regEmail, this.regPassword, this.regStoreName);
      await this.router.navigate(['/inventory']);
    } catch (e: any) {
      this.regError.set(this.friendlyError(e?.code));
    } finally {
      this.regLoading.set(false);
    }
  }

  private friendlyError(code: string): string {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos.';
      case 'auth/email-already-in-use':
        return 'Este e-mail já está cadastrado.';
      case 'auth/weak-password':
        return 'A senha deve ter pelo menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'Endereço de e-mail inválido.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
      default:
        return 'Ocorreu um erro. Tente novamente.';
    }
  }
}
