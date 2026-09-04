import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { MlAutoApplyService } from '../../core/services/ml-auto-apply.service';
import { NotifyService } from '../../core/services/notify.service';
import { logError } from '../../core/services/logger';
import { ItemDaCaixa, MotivoPendencia, planejarAplicacao } from '../../core/ml/inbox-apply';
import { Candidata, classificarCaixa } from '../../core/ml/reconcile';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { IconName } from '../../shared/ui/icon/icons';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
  ConfirmDialogResult,
} from '../../shared/components/confirm-dialog.component';

/** Item pendente com o motivo já resolvido, para a tela agrupar. */
export interface PendenteNaTela {
  item: ItemDaCaixa;
  motivo: MotivoPendencia;
}

/** Item que parece já ter sido lançado à mão. */
export interface ConciliacaoNaTela {
  item: ItemDaCaixa;
  candidata: Candidata;
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
  private readonly dialog = inject(DialogService);

  protected readonly aplicando = signal(false);
  protected readonly importando = signal(false);
  protected readonly adotandoTudo = signal(false);
  protected readonly icone = ICONE_DO_MOTIVO;

  /** Veredito de cada item pendente contra as vendas já lançadas. */
  private readonly classificacao = computed(() =>
    classificarCaixa(this.ml.inboxPendentes(), this.data.sales()),
  );

  /** Itens que casaram com alguma venda sua e precisam da sua decisão. */
  protected readonly duplicadas = computed<ConciliacaoNaTela[]>(() =>
    this.paraConciliar('duplicada'),
  );

  protected readonly conflitantes = computed<ConciliacaoNaTela[]>(() =>
    this.paraConciliar('conflitante'),
  );

  private paraConciliar(veredito: 'duplicada' | 'conflitante'): ConciliacaoNaTela[] {
    const mapa = this.classificacao();
    return this.ml
      .inboxPendentes()
      .filter(i => mapa.get(i.externalId)?.veredito === veredito)
      .map(item => ({ item, candidata: mapa.get(item.externalId)!.candidata! }))
      .sort((a, b) => b.item.saleDate.localeCompare(a.item.saleDate));
  }

  /**
   * O que está pendente por falta de vínculo ou estoque.
   *
   * O motivo sai do mesmo planejador que aplica de verdade, então a tela nunca
   * discorda do que aconteceria ao clicar em aplicar. Itens em conciliação não
   * entram aqui: eles esperam decisão, não estoque.
   */
  protected readonly pendentes = computed<PendenteNaTela[]>(() => {
    const mapa = this.classificacao();
    const novos = this.ml.inboxPendentes().filter(i => mapa.get(i.externalId)?.veredito === 'nova');
    if (novos.length === 0) return [];

    const plano = planejarAplicacao(novos, this.data.computedPurchases(), this.data.sales());
    const porId = new Map(plano.pendentes.map(p => [p.externalId, p.motivo]));

    return novos
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

  protected readonly totalEsperando = computed(() =>
    this.pendentes().length + this.duplicadas().length + this.conflitantes().length,
  );

  /** Valor parado esperando decisão — dá a dimensão do que ainda não entrou. */
  protected readonly valorPendente = computed(() => {
    const soma = (l: { item: ItemDaCaixa }[]) =>
      l.reduce((s, p) => s + p.item.unitPrice * p.item.quantitySold, 0);
    return soma(this.pendentes()) + soma(this.duplicadas()) + soma(this.conflitantes());
  });

  protected indicios(c: Candidata): string {
    const nomes = c.indicios.map(i => this.t.instant(`mlInbox.indicio.${i}`));
    return this.t.instant('mlInbox.matchedBy', { indicios: nomes.join(', ') });
  }

  protected async importarHistorico(): Promise<void> {
    this.importando.set(true);
    try {
      const total = await this.ml.backfill(12);
      this.notify.success(this.t.instant('mlInbox.imported', { total }));
    } catch (err) {
      logError('[MlInbox] backfill falhou:', err);
      this.notify.error(this.t.instant('mlInbox.importError'));
    } finally {
      this.importando.set(false);
    }
  }

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

  /** Mantém a venda digitada à mão e tira o item do Mercado Livre do caminho. */
  protected async manterMinha(item: ItemDaCaixa): Promise<void> {
    await this.ignorar(item);
  }

  /**
   * Adota os números do Mercado Livre em todas as duplicadas de uma vez.
   *
   * Só nas duplicadas de propósito. Elas casaram nos três indícios (data, valor
   * e produto), então a correspondência é segura. As conflitantes casaram em
   * dois: oferecer um botão de lote ali anularia justamente o motivo de elas
   * terem sido separadas.
   */
  protected adotarTodasDuplicadas(): void {
    const lista = this.duplicadas();
    if (lista.length === 0 || this.adotandoTudo()) return;

    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, ConfirmDialogResult>(
        ConfirmDialogComponent,
        {
          data: {
            title: this.t.instant('mlInbox.adoptAllTitle'),
            message: this.t.instant('mlInbox.adoptAllMsg', { total: lista.length }),
            confirmText: this.t.instant('mlInbox.adoptAllConfirm', { total: lista.length }),
          },
          size: 'sm',
        },
      )
      .afterClosed()
      .subscribe(async confirmado => {
        if (!confirmado) return;
        this.adotandoTudo.set(true);
        try {
          const adotados = await this.data.adotarNumerosDoMlEmLote(
            lista.map(c => ({ saleId: c.candidata.venda.id, item: c.item })),
          );
          // Só depois de a gravação passar é que o servidor é avisado; se a
          // ordem fosse a inversa, uma falha deixaria itens marcados como
          // aplicados sem nada ter entrado no razão.
          await this.ml.markInbox(adotados, 'aplicado');
          this.notify.success(
            this.t.instant('mlInbox.adoptedAll', { total: adotados.length }),
          );
        } catch (err) {
          logError('[MlInbox] adotar em lote falhou:', err);
          this.notify.error(this.t.instant('mlInbox.adoptError'));
        } finally {
          this.adotandoTudo.set(false);
        }
      });
  }

  /** Substitui os números da venda manual pelos reais do Mercado Livre. */
  protected async usarDoMl(c: ConciliacaoNaTela): Promise<void> {
    try {
      await this.data.adotarNumerosDoMl(c.candidata.venda.id, c.item);
      await this.ml.markInbox([c.item.externalId], 'aplicado');
      this.notify.success(this.t.instant('mlInbox.adopted'));
    } catch (err) {
      logError('[MlInbox] adotar numeros falhou:', err);
      this.notify.error(this.t.instant('mlInbox.adoptError'));
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
