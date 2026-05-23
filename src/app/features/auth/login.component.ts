import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { validatePasswordStrength } from '../../core/services/password-validator';
import { ForgotPasswordDialogComponent } from './forgot-password.dialog';

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
      <aside class="hero">
        <div class="hero-content">
          <div class="brand">
            <div class="logo">L</div>
            <div class="brand-text">
              <h1>Lucrato</h1>
              <p>Gestão Mercado Livre</p>
            </div>
          </div>

          <h2 class="tagline">Gerencie seu Mercado Livre com clareza.</h2>
          <p class="hero-sub">Acompanhe lucro, capital parado e margens em tempo real — sem planilha, sem dor de cabeça.</p>

          <ul class="bullets">
            <li>
              <mat-icon>insights</mat-icon>
              <span>Dashboards de receita, taxas e lucro líquido</span>
            </li>
            <li>
              <mat-icon>inventory_2</mat-icon>
              <span>Controle de lotes com alertas de estoque parado</span>
            </li>
            <li>
              <mat-icon>upload_file</mat-icon>
              <span>Importação em massa via planilha Excel</span>
            </li>
          </ul>
        </div>

        <div class="hero-decoration"></div>
      </aside>

      <main class="form-side">
        <div class="form-card">
          <div class="brand mobile-only">
            <div class="logo">L</div>
            <div class="brand-text">
              <h1>Lucrato</h1>
              <p>Gestão Mercado Livre</p>
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

              <button type="button" mat-button class="forgot-link" (click)="openForgotPassword()">
                Esqueci minha senha
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
                  [(ngModel)]="regPassword" required autocomplete="new-password" minlength="8" />
                <button type="button" mat-icon-button matSuffix (click)="showRegPwd.set(!showRegPwd())">
                  <mat-icon>{{ showRegPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
                <mat-hint>Mínimo 8 caracteres, com letra e número</mat-hint>
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
      </main>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--bg-base);
    }

    .hero {
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, #1E40AF 0%, #1D4ED8 55%, #2563EB 100%);
      color: #FFFFFF;
      padding: 56px 64px;
      display: flex;
      align-items: center;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 460px;
    }

    .hero-decoration {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 85% 18%, rgba(255, 255, 255, 0.18) 0%, transparent 45%),
        radial-gradient(circle at 12% 85%, rgba(255, 255, 255, 0.12) 0%, transparent 50%);
      pointer-events: none;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 36px;
    }

    .brand.mobile-only { display: none; }

    .logo {
      width: 48px;
      height: 48px;
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      flex-shrink: 0;
    }

    .brand-text h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.5px;
    }

    .brand-text p {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.65);
      margin: 2px 0 0;
    }

    .tagline {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.8px;
      margin: 0 0 14px;
    }

    .hero-sub {
      font-size: 15px;
      line-height: 1.55;
      color: rgba(255, 255, 255, 0.82);
      margin: 0 0 32px;
    }

    .bullets {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .bullets li {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.88);
    }

    .bullets mat-icon {
      flex-shrink: 0;
      font-size: 20px;
      width: 36px;
      height: 36px;
      line-height: 36px;
      text-align: center;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 10px;
    }

    .form-side {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
      background: var(--bg-base);
    }

    .form-card {
      width: 100%;
      max-width: 420px;
      background: var(--bg-surface);
      border: 1px solid var(--brd-default);
      border-radius: var(--radius-lg);
      padding: 32px;
      box-shadow: var(--shadow-md);
    }

    .form-card .brand {
      margin-bottom: 8px;

      .logo {
        background: linear-gradient(135deg, #1E40AF, #3B82F6);
        color: #FFFFFF;
        border: none;
      }

      .brand-text h1 { color: var(--txt-primary); }
      .brand-text p  { color: var(--txt-secondary); }
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

    .forgot-link {
      align-self: center;
      font-size: 12.5px;
      color: var(--txt-secondary);
      margin-top: 4px;
    }

    @media (max-width: 960px) {
      .login-page { grid-template-columns: 1fr; }
      .hero { display: none; }
      .brand.mobile-only { display: flex; }
      .form-card .brand:not(.mobile-only) { display: none; }
    }

    @media (max-width: 480px) {
      .form-side { padding: 24px 16px; align-items: flex-start; padding-top: 40px; }
      .form-card { padding: 20px 16px; border-radius: 12px; }
      .brand-text h1 { font-size: 20px; }
    }
  `],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);

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
    } catch (e: any) {
      this.loginError.set(this.friendlyError(e?.code));
    } finally {
      this.loginLoading.set(false);
    }
  }

  async register(): Promise<void> {
    this.regError.set('');

    const pwdError = validatePasswordStrength(this.regPassword);
    if (pwdError) {
      this.regError.set(pwdError);
      return;
    }

    const storeName = this.regStoreName.trim();
    if (!storeName) {
      this.regError.set('Informe o nome da loja.');
      return;
    }

    this.regLoading.set(true);
    try {
      await this.authService.register(this.regEmail.trim(), this.regPassword, storeName);
      try {
        await this.authService.sendVerificationEmail();
      } catch {
        // não bloqueia o cadastro caso o envio falhe; usuário pode reenviar depois
      }
    } catch (e: any) {
      this.regError.set(this.friendlyError(e?.code));
    } finally {
      this.regLoading.set(false);
    }
  }

  openForgotPassword(): void {
    this.dialog.open(ForgotPasswordDialogComponent, {
      data: this.loginEmail || null,
      width: '440px',
      maxWidth: '95vw',
    });
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
