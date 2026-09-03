import { Injectable, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DataService } from './data.service';
import { MlIntegrationService } from './ml-integration.service';
import { NotifyService } from './notify.service';
import { logError } from './logger';

/**
 * Lança sozinho no razão as vendas do Mercado Livre que já estão prontas.
 *
 * A captura acontece no servidor 24 horas por dia; o que espera o app abrir é
 * só este lançamento — decisão consciente, porque a function não escreve no
 * documento principal (ver `functions/src/ml/inbox.ts`).
 *
 * Só entra o que tem anúncio vinculado e estoque disponível. O resto fica na
 * caixa de entrada esperando você decidir.
 */
@Injectable({ providedIn: 'root' })
export class MlAutoApplyService {
  private readonly data = inject(DataService);
  private readonly ml = inject(MlIntegrationService);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

  /** Evita duas rodadas ao mesmo tempo enquanto a gravação não termina. */
  private readonly rodando = signal(false);
  /** Itens já tentados nesta sessão, para não insistir no que não coube. */
  private readonly tentados = new Set<string>();

  constructor() {
    effect(() => {
      const pendentes = this.ml.inboxPendentes();
      const ligado = this.data.settings()?.mlAutoApply !== false;

      if (!ligado || this.rodando() || !this.data.loaded() || pendentes.length === 0) return;

      const novos = pendentes.filter(i => !this.tentados.has(i.externalId));
      if (novos.length === 0) return;

      void this.aplicar();
    }, { allowSignalWrites: true });
  }

  /** Roda uma vez a aplicação do que está pendente. Devolve quantas vendas entraram. */
  async aplicar(): Promise<number> {
    if (this.rodando()) return 0;
    const pendentes = this.ml.inboxPendentes();
    if (pendentes.length === 0) return 0;

    this.rodando.set(true);
    try {
      for (const item of pendentes) this.tentados.add(item.externalId);

      const plano = await this.data.applyMlInbox(pendentes);
      if (plano.aplicados.length > 0) {
        await this.ml.markInbox(plano.aplicados, 'aplicado');
      }

      const entraram = plano.novas.length;
      if (entraram > 0) {
        this.notify.success(this.t.instant('mlInbox.autoApplied', { total: entraram }));
      }
      return entraram;
    } catch (err) {
      logError('[MlAutoApply] falhou:', err);
      return 0;
    } finally {
      this.rodando.set(false);
    }
  }

  /** Permite tentar de novo o que ficou pendente (depois de vincular ou comprar). */
  esquecerTentativas(): void {
    this.tentados.clear();
  }
}
