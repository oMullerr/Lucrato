import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="verify-page">
      <mat-card class="verify-card">
        <div class="icon-wrap">
          <mat-icon>mark_email_unread</mat-icon>
        </div>

        <h1>Verifique seu e-mail</h1>
        <p class="lead">
          Enviamos um link de verificação para
          <strong>{{ email() || 'seu e-mail' }}</strong>.
          Clique no link para liberar o acesso ao Lucrato.
        </p>

        <div class="hint">
          <mat-icon>info</mat-icon>
          <span>Pode demorar até 1 minuto. Confira também a pasta de spam.</span>
        </div>

        <div class="actions">
          <button
            mat-flat-button
            color="primary"
            (click)="checkAgain()"
            [disabled]="checking()"
          >
            @if (checking()) {
              <mat-spinner diameter="18" />
            } @else {
              <mat-icon>refresh</mat-icon>
            }
            Já verifiquei
          </button>

          <button
            mat-stroked-button
            (click)="resend()"
            [disabled]="resending() || cooldown() > 0"
          >
            <mat-icon>send</mat-icon>
            @if (cooldown() > 0) {
              Reenviar em {{ cooldown() }}s
            } @else {
              {{ resending() ? 'Enviando…' : 'Reenviar e-mail' }}
            }
          </button>
        </div>

        <button mat-button class="logout-link" (click)="logout()">
          Sair e usar outra conta
        </button>
      </mat-card>
    </div>
  `,
  styles: [`
    .verify-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-canvas);
      padding: 24px;
    }

    .verify-card {
      width: 100%;
      max-width: 460px;
      padding: 40px 32px 24px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      text-align: center;
      background: var(--bg-surface-1);
    }

    .icon-wrap {
      width: 64px;
      height: 64px;
      margin: 0 auto 18px;
      border-radius: var(--radius-full);
      background: var(--tint-brand);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-wrap mat-icon {
      color: var(--brand-primary);
      font-size: 30px;
      width: 30px;
      height: 30px;
    }

    h1 {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 10px;
      letter-spacing: -0.025em;
    }

    .lead {
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.55;
      margin: 0 auto 20px;
      max-width: 380px;

      strong { color: var(--text-primary); font-weight: 600; }
    }

    .hint {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
      padding: 10px 14px;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      font-size: 12.5px;
      color: var(--text-secondary);
      margin-bottom: 22px;
    }

    .hint mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--brand-primary);
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }

    .actions button {
      height: 44px;
      font-size: 14px;
      font-weight: 500;
    }

    .actions button[mat-flat-button] {
      --mdc-filled-button-container-color: var(--brand-primary);
      --mdc-filled-button-label-text-color: #FFFFFF;
    }

    .logout-link {
      font-size: 12.5px;
      color: var(--text-muted);
    }
  `],
})
export class VerifyEmailComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  protected readonly checking = signal(false);
  protected readonly resending = signal(false);
  protected readonly cooldown = signal(0);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.pollTimer = setInterval(() => this.poll(), 10_000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  private async poll(): Promise<void> {
    try {
      await this.auth.reloadCurrentUser();
      if (this.auth.currentUser()?.emailVerified) {
        this.router.navigate(['/inventory']);
      }
    } catch {
      // erros de rede silenciosos durante polling
    }
  }

  protected async checkAgain(): Promise<void> {
    this.checking.set(true);
    try {
      await this.auth.reloadCurrentUser();
      if (this.auth.currentUser()?.emailVerified) {
        this.notify.success('E-mail verificado! Bem-vindo.');
        this.router.navigate(['/inventory']);
      } else {
        this.notify.warning('Ainda não detectamos a verificação. Confira seu e-mail.');
      }
    } finally {
      this.checking.set(false);
    }
  }

  protected async resend(): Promise<void> {
    if (this.cooldown() > 0) return;
    this.resending.set(true);
    try {
      await this.auth.sendVerificationEmail();
      this.notify.success('E-mail de verificação reenviado.');
      this.startCooldown(45);
    } catch (err: any) {
      console.error('[VerifyEmail] resend falhou:', err);
      if (err?.code === 'auth/too-many-requests') {
        this.notify.error('Muitas tentativas. Aguarde alguns minutos.');
        this.startCooldown(60);
      } else {
        this.notify.error('Não foi possível reenviar o e-mail agora.');
      }
    } finally {
      this.resending.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  private startCooldown(seconds: number): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldown.set(seconds);
    this.cooldownTimer = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(Math.max(0, next));
      if (next <= 0 && this.cooldownTimer) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
      }
    }, 1000);
  }
}
