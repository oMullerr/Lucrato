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
  templateUrl: './connection-banner.component.html',
  styleUrl: './connection-banner.component.scss',
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
