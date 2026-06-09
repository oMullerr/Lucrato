import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
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
    TranslateModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly t = inject(TranslateService);

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
      this.regError.set(this.t.instant(pwdError));
      return;
    }

    const storeName = this.regStoreName.trim();
    if (!storeName) {
      this.regError.set(this.t.instant('validation.storeNameRequired'));
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
        return this.t.instant('auth.errInvalidCredentials');
      case 'auth/email-already-in-use':
        return this.t.instant('auth.errEmailInUse');
      case 'auth/weak-password':
        return this.t.instant('auth.errWeakPassword');
      case 'auth/invalid-email':
        return this.t.instant('auth.errInvalidEmail');
      case 'auth/too-many-requests':
        return this.t.instant('auth.errTooManyRequests');
      default:
        return this.t.instant('auth.errGeneric');
    }
  }
}
