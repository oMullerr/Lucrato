import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { IconName } from '../../shared/ui/icon/icons';
import { DialogService } from '../../shared/ui/dialog/dialog.service';

interface EstadoVisual {
  tone: 'off' | 'ok' | 'warn';
  icon: IconName;
  titleKey: string;
  messageKey: string;
}

/** O que a integração lê da conta, mostrado antes de conectar. */
const LEITURAS: readonly { icon: IconName; key: string }[] = [
  { icon: 'tag', key: 'sales' },
  { icon: 'truck', key: 'shipping' },
  { icon: 'rotate-ccw', key: 'returns' },
  { icon: 'package', key: 'listings' },
];

@Component({
  selector: 'app-integrations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent, SkeletonComponent, ButtonComponent, IconComponent, TranslateModule,
  ],
  templateUrl: './integrations.component.html',
  styleUrl: './integrations.component.scss',
})
export class IntegrationsComponent {
  protected readonly ml = inject(MlIntegrationService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(DialogService);
  private readonly t = inject(TranslateService);

  protected readonly leituras = LEITURAS;

  /** Data e hora curtas, no padrao brasileiro. */
  protected formatarQuando(d: Date | null | undefined): string {
    if (!d) return this.t.instant('integrations.never');
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  }

  protected readonly view = computed<EstadoVisual>(() => {
    const s = this.ml.state();
    if (s?.status === 'reconnect_required') {
      return {
        tone: 'warn',
        icon: 'triangle-alert',
        titleKey: 'integrations.reconnectTitle',
        messageKey: 'integrations.reconnectMsg',
      };
    }
    if (s?.connected) {
      return {
        tone: 'ok',
        icon: 'circle-check',
        titleKey: 'integrations.connectedTitle',
        messageKey: 'integrations.connectedMsg',
      };
    }
    return {
      tone: 'off',
      icon: 'store',
      titleKey: 'integrations.offTitle',
      messageKey: 'integrations.offMsg',
    };
  });

  protected async connect(): Promise<void> {
    try {
      // Sai do app: a próxima tela já é a do Mercado Livre.
      await this.ml.connect();
    } catch (err) {
      logError('[Integrations] connect falhou:', err);
      this.notify.error(this.t.instant('integrations.connectError'));
    }
  }

  protected confirmDisconnect(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.t.instant('integrations.disconnectTitle'),
          message: this.t.instant('integrations.disconnectMsg'),
          danger: true,
          confirmText: this.t.instant('integrations.disconnect'),
        },
        size: 'sm',
      })
      .afterClosed()
      .subscribe(async confirmed => {
        if (!confirmed) return;
        try {
          await this.ml.disconnect();
          this.notify.success(this.t.instant('integrations.disconnected'));
        } catch (err) {
          logError('[Integrations] disconnect falhou:', err);
          this.notify.error(this.t.instant('integrations.disconnectError'));
        }
      });
  }
}
