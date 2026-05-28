import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ConnectionService } from '../../core/services/connection.service';

type BannerKind = 'error' | 'offline' | 'persistence' | 'syncing' | null;

@Component({
  selector: 'app-connection-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule],
  template: `
    @if (bannerKind(); as kind) {
      @switch (kind) {
        @case ('error') {
          <div class="banner banner-error" role="status" aria-live="polite">
            <mat-icon class="banner-icon">sync_problem</mat-icon>
            <span class="banner-text">Falha de sincronização. Tentando reconectar&hellip;</span>
            <span class="banner-spinner" aria-hidden="true"></span>
          </div>
        }
        @case ('offline') {
          <div class="banner banner-offline" role="status" aria-live="polite">
            <mat-icon class="banner-icon">cloud_off</mat-icon>
            <span class="banner-text">
              Você está offline. Suas alterações serão salvas quando a conexão voltar.
            </span>
          </div>
        }
        @case ('persistence') {
          <div class="banner banner-persistence" role="status" aria-live="polite">
            <mat-icon class="banner-icon">warning</mat-icon>
            <span class="banner-text">
              Modo offline limitado neste navegador. Mantenha esta aba aberta para não perder alterações.
            </span>
            <button
              type="button"
              class="banner-dismiss"
              (click)="dismissPersistence()"
              aria-label="Fechar aviso"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
        @case ('syncing') {
          <div class="banner banner-syncing" role="status" aria-live="off">
            <span class="banner-spinner banner-spinner-sm" aria-hidden="true"></span>
            <span class="banner-text">Salvando&hellip;</span>
          </div>
        }
      }
    }
  `,
  styles: [`
    :host { display: block; }

    .banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      border-bottom: 1px solid transparent;
    }

    .banner-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .banner-text {
      flex: 1;
      min-width: 0;
    }

    .banner-error {
      background: var(--tint-danger);
      color: var(--color-danger);
      border-bottom-color: var(--color-danger);
    }

    .banner-offline {
      background: var(--tint-warning);
      color: var(--color-warning);
      border-bottom-color: var(--color-warning);
    }

    .banner-persistence {
      background: var(--tint-info);
      color: var(--color-info);
      border-bottom-color: var(--color-info);
    }

    .banner-syncing {
      background: var(--bg-surface-1);
      color: var(--text-secondary);
      border-bottom-color: var(--border-subtle);
      font-size: 12px;
      padding: 6px 16px;
    }

    .banner-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
      opacity: 0.85;
    }

    .banner-spinner-sm {
      width: 12px;
      height: 12px;
      border-width: 1.5px;
    }

    .banner-dismiss {
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm, 4px);
      opacity: 0.7;
      transition: opacity 0.15s ease, background 0.15s ease;
    }

    .banner-dismiss:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.05);
    }

    .banner-dismiss mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 480px) {
      .banner { padding: 8px 12px; font-size: 12px; }
    }
  `]
})
export class ConnectionBannerComponent {
  private readonly connection = inject(ConnectionService);
  private readonly persistenceDismissed = signal(false);

  protected readonly bannerKind = computed<BannerKind>(() => {
    if (this.connection.syncError()) return 'error';
    if (!this.connection.isOnline()) return 'offline';
    if (this.connection.persistenceUnavailable() && !this.persistenceDismissed()) return 'persistence';
    if (this.connection.hasPendingWrites()) return 'syncing';
    return null;
  });

  protected dismissPersistence(): void {
    this.persistenceDismissed.set(true);
  }
}
