import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss',
})
export class VerifyEmailComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly t = inject(TranslateService);

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
        this.notify.success(this.t.instant('auth.verifiedWelcome'));
        this.router.navigate(['/inventory']);
      } else {
        this.notify.warning(this.t.instant('auth.notDetected'));
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
      this.notify.success(this.t.instant('auth.verificationResent'));
      this.startCooldown(45);
    } catch (err: any) {
      logError('[VerifyEmail] resend falhou:', err);
      if (err?.code === 'auth/too-many-requests') {
        this.notify.error(this.t.instant('auth.tooManyShort'));
        this.startCooldown(60);
      } else {
        this.notify.error(this.t.instant('auth.resendFailed'));
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
