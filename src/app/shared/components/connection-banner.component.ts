import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ConnectionService } from '../../core/services/connection.service';
import { IconComponent } from '../ui/icon/icon.component';

type BannerKind = 'error' | 'offline' | 'persistence' | 'syncing' | null;

@Component({
  selector: 'app-connection-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TranslateModule],
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
