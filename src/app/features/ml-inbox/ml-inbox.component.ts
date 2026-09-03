import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { MlAutoApplyService } from '../../core/services/ml-auto-apply.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import { ItemDaCaixa, MotivoPendencia, planejarAplicacao } from '../../core/ml/inbox-apply';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { IconName } from '../../shared/ui/icon/icons';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';

/** Item pendente com o motivo já resolvido, para a tela agrupar. */
export interface PendenteNaTela {
  item: ItemDaCaixa;
  motivo: MotivoPendencia;
}

const ICONE_DO_MOTIVO: Record<MotivoPendencia, IconName> = {
  sem_vinculo: 'tags',
  sem_estoque: 'package',
};

@Component({
  selector: 'app-ml-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeaderComponent, EmptyStateComponent, SkeletonComponent,
    ButtonComponent, IconComponent, BrlPipe, BrDatePipe, TranslateModule,
  ],
  templateUrl: './ml-inbox.component.html',
  styleUrl: './ml-inbox.component.scss',
})
export class MlInboxComponent {
  protected readonly ml = inject(MlIntegrationService);
  protected readonly data = inject(DataService);
  private readonly auto = inject(MlAutoApplyService);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

  protected readonly aplicando = signal(false);
  protected readonly icone = ICONE_DO_MOTIVO;

  /**
   * O que está pendente e por quê.
   *
   * O motivo sai do mesmo planejador que aplica de verdade, então a tela nunca
   * discorda do que aconteceria ao clicar em aplicar.
   */
  protected readonly pendentes = computed<PendenteNaTela[]>(() => {
    const itens = this.ml.inboxPendentes();
    if (itens.length === 0) return [];

    const plano = planejarAplicacao(itens, this.data.computedPurchases(), this.data.sales());
    const porId = new Map(plano.pendentes.map(p => [p.externalId, p.motivo]));

    return itens
      .filter(i => porId.has(i.externalId))
      .map(item => ({ item, motivo: porId.get(item.externalId)! }))
      .sort((a, b) => b.item.saleDate.localeCompare(a.item.saleDate));
  });

  protected readonly semVinculo = computed(() =>
    this.pendentes().filter(p => p.motivo === 'sem_vinculo'),
  );

  protected readonly semEstoque = computed(() =>
    this.pendentes().filter(p => p.motivo === 'sem_estoque'),
  );

  /** Valor parado esperando decisão — dá a dimensão do que ainda não entrou. */
  protected readonly valorPendente = computed(() =>
    this.pendentes().reduce((s, p) => s + p.item.unitPrice * p.item.quantitySold, 0),
  );

  protected async aplicarAgora(): Promise<void> {
    this.aplicando.set(true);
    try {
      this.auto.esquecerTentativas();
      const total = await this.auto.aplicar();
      if (total === 0) {
        this.notify.info(this.t.instant('mlInbox.nothingApplied'));
      }
    } catch (err) {
      logError('[MlInbox] aplicar falhou:', err);
      this.notify.error(this.t.instant('mlInbox.applyError'));
    } finally {
      this.aplicando.set(false);
    }
  }

  protected async ignorar(item: ItemDaCaixa): Promise<void> {
    try {
      await this.ml.markInbox([item.externalId], 'ignorado');
      this.notify.success(this.t.instant('mlInbox.ignored'));
    } catch (err) {
      logError('[MlInbox] ignorar falhou:', err);
      this.notify.error(this.t.instant('mlInbox.ignoreError'));
    }
  }
}
