import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
    MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-page">
      <!-- Hero -->
      <aside class="hero">
        <div class="hero-content">
          <a class="hero-wordmark" href="/" aria-label="Lucrato">
            <span class="wm-l">L</span><span class="wm-u">u</span><span>crato</span>
            <svg class="wm-arrow" viewBox="0 0 12 8" aria-hidden="true">
              <path d="M1 7 L6 1 L11 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>

          <h2 class="tagline">O painel financeiro do vendedor de Mercado Livre.</h2>
          <p class="hero-sub">Sério como um extrato bancário. Vivo como um app de investimento. Honesto como uma planilha bem feita.</p>

          <ul class="bullets">
            <li>
              <span class="bullet-dot" aria-hidden="true"></span>
              <span>Lucro líquido, capital parado e margens em tempo real</span>
            </li>
            <li>
              <span class="bullet-dot" aria-hidden="true"></span>
              <span>Alertas de estoque parado antes que vire prejuízo</span>
            </li>
            <li>
              <span class="bullet-dot" aria-hidden="true"></span>
              <span>Importação Excel e exportação CSV para o contador</span>
            </li>
          </ul>
        </div>

        <div class="hero-decoration" aria-hidden="true"></div>
      </aside>

      <!-- Form -->
      <main class="form-side">
        <div class="form-card">
          <a class="form-wordmark mobile-only" href="/" aria-label="Lucrato">
            <span class="wm-l">L</span><span class="wm-u">u</span><span>crato</span>
          </a>

          <div class="seg-toggle" role="tablist">
            <button
              type="button"
              class="seg"
              [class.active]="mode() === 'login'"
              (click)="setMode('login')"
              role="tab"
              [attr.aria-selected]="mode() === 'login'"
            >Entrar</button>
            <button
              type="button"
              class="seg"
              [class.active]="mode() === 'register'"
              (click)="setMode('register')"
              role="tab"
              [attr.aria-selected]="mode() === 'register'"
            >Criar conta</button>
          </div>

          @if (mode() === 'login') {
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
                <div class="error-msg">
                  <mat-icon>error_outline</mat-icon>
                  <span>{{ loginError() }}</span>
                </div>
              }

              <button mat-flat-button class="submit-btn" type="submit" [disabled]="loginLoading() || loginForm.invalid">
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
          } @else {
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
                <div class="error-msg">
                  <mat-icon>error_outline</mat-icon>
                  <span>{{ regError() }}</span>
                </div>
              }

              <button mat-flat-button class="submit-btn" type="submit" [disabled]="regLoading() || regForm.invalid">
                @if (regLoading()) {
                  <mat-spinner diameter="20" />
                } @else {
                  Criar conta
                }
              </button>
            </form>
          }
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .login-page {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      background: var(--bg-canvas);
    }

    .hero {
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, #0A6E5C 0%, #0E8C77 55%, #2BAE96 100%);
      color: #FFFFFF;
      padding: 64px 72px;
      display: flex;
      align-items: center;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 480px;
    }

    .hero-decoration {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 88% 18%, rgba(232, 199, 123, 0.22) 0%, transparent 50%),
        radial-gradient(ellipse at 12% 92%, rgba(255, 255, 255, 0.12) 0%, transparent 55%);
      pointer-events: none;
    }

    .hero-wordmark {
      font-family: 'Geist', sans-serif;
      font-weight: 600;
      font-size: 28px;
      letter-spacing: -0.04em;
      color: #FFFFFF;
      display: inline-flex;
      align-items: baseline;
      gap: 1px;
      margin-bottom: 48px;
      text-decoration: none;

      .wm-l { color: #E8C77B; }

      .wm-arrow {
        width: 12px;
        height: 8px;
        margin-left: 2px;
        color: #E8C77B;
        transform: translateY(-2px);
      }
    }

    .tagline {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: clamp(28px, 3.5vw, 38px);
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.035em;
      margin: 0 0 18px;
    }

    .hero-sub {
      font-size: 15px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.82);
      margin: 0 0 36px;
      max-width: 440px;
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
      font-size: 14.5px;
      color: rgba(255, 255, 255, 0.92);
      line-height: 1.5;
    }

    .bullet-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background: #E8C77B;
      flex-shrink: 0;
      box-shadow: 0 0 0 3px rgba(232, 199, 123, 0.18);
    }

    .form-side {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
      background: var(--bg-canvas);
    }

    .form-card {
      width: 100%;
      max-width: 440px;
      background: var(--bg-surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 36px;
    }

    .form-wordmark {
      font-family: 'Geist', sans-serif;
      font-weight: 600;
      font-size: 22px;
      letter-spacing: -0.04em;
      color: var(--text-primary);
      display: none;
      align-items: baseline;
      gap: 1px;
      margin-bottom: 20px;
      text-decoration: none;

      .wm-l { color: var(--brand-primary); }
    }

    .seg-toggle {
      display: inline-flex;
      width: 100%;
      background: var(--bg-surface-2);
      border-radius: var(--radius-full);
      padding: 4px;
      margin-bottom: 22px;
    }

    .seg {
      flex: 1;
      background: transparent;
      border: none;
      padding: 8px 16px;
      border-radius: var(--radius-full);
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-muted);
      cursor: pointer;
      transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);

      &.active {
        background: var(--bg-surface-1);
        color: var(--text-primary);
        box-shadow: var(--shadow-sm);
        font-weight: 600;
      }
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 6px;

      mat-form-field {
        width: 100%;
      }

      mat-form-field mat-icon {
        color: var(--text-muted);
      }
    }

    .submit-btn {
      height: 48px;
      font-size: 14px;
      font-weight: 600;
      margin-top: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      --mdc-filled-button-container-color: var(--brand-primary);
      --mdc-filled-button-label-text-color: #FFFFFF;
    }

    .error-msg {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--color-danger);
      padding: 10px 12px;
      background: var(--tint-danger);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--color-danger);
      line-height: 1.45;

      mat-icon { font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; }
    }

    .forgot-link {
      align-self: center;
      font-size: 12.5px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    @media (max-width: 960px) {
      .login-page { grid-template-columns: 1fr; }
      .hero { display: none; }
      .form-wordmark.mobile-only { display: inline-flex; }
    }

    @media (max-width: 480px) {
      .form-side { padding: 24px 16px; align-items: flex-start; padding-top: 40px; }
      .form-card { padding: 24px 20px; border-radius: var(--radius-lg); }
    }
  `],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected readonly mode = signal<'login' | 'register'>('login');

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

  protected setMode(m: 'login' | 'register'): void {
    this.mode.set(m);
    this.loginError.set('');
    this.regError.set('');
  }

  async login(): Promise<void> {
    this.loginError.set('');
    this.loginLoading.set(true);
    try {
      await this.authService.login(this.loginEmail, this.loginPassword);
    } catch (e: unknown) {
      this.loginError.set(this.friendlyError((e as { code?: string })?.code));
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
    } catch (e: unknown) {
      this.regError.set(this.friendlyError((e as { code?: string })?.code));
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

  private friendlyError(code: string | undefined): string {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos.';
      case 'auth/email-already-in-use':
        return 'Este e-mail já está cadastrado.';
      case 'auth/weak-password':
        return 'A senha deve ter pelo menos 8 caracteres, com letra e número.';
      case 'auth/invalid-email':
        return 'Endereço de e-mail inválido.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
      default:
        return 'Ocorreu um erro. Tente novamente.';
    }
  }
}
