import { Injectable, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DataService } from './data.service';
import { MlIntegrationService } from './ml-integration.service';
import { NotifyService } from './notify.service';
import { logError } from './logger';
import { classificarCaixa } from '../ml/reconcile';

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

      const devolucoes = this.ml.devolucoesPendentes();
      if (!ligado || this.rodando() || !this.data.loaded()) return;
      if (pendentes.length === 0 && devolucoes.length === 0) return;

      const novos = pendentes.filter(i => !this.tentados.has(i.externalId));
      const novasDevolucoes = devolucoes.filter(d => !this.tentados.has(d.claimId));
      if (novos.length === 0 && novasDevolucoes.length === 0) return;

      void this.aplicar();
    }, { allowSignalWrites: true });
  }

  /**
   * Roda uma vez a aplicação do que está pendente. Devolve quantas vendas entraram.
   *
   * **Só entra o que foi classificado como venda nova.** O backfill traz até 12
   * meses de pedidos, e boa parte já foi digitada à mão — lançar sem conferir
   * duplicaria faturamento, estoque e o teto do MEI. Tudo que parece duplicata
   * espera decisão na caixa de entrada.
   */
  async aplicar(): Promise<number> {
    if (this.rodando()) return 0;
    const pendentes = this.ml.inboxPendentes();
    if (pendentes.length === 0) {
      this.rodando.set(true);
      try {
        await this.aplicarDevolucoes();
      } catch (err) {
        logError('[MlAutoApply] devolucoes falharam:', err);
      } finally {
        this.rodando.set(false);
      }
      return 0;
    }

    const classificacao = classificarCaixa(pendentes, this.data.sales());
    const novas = pendentes.filter(i => classificacao.get(i.externalId)?.veredito === 'nova');
    if (novas.length === 0) {
      for (const item of pendentes) this.tentados.add(item.externalId);
      // Ainda pode haver devolução esperando por uma venda que já está no razão.
      this.rodando.set(true);
      try {
        await this.aplicarDevolucoes();
      } catch (err) {
        logError('[MlAutoApply] devolucoes falharam:', err);
      } finally {
        this.rodando.set(false);
      }
      return 0;
    }

    this.rodando.set(true);
    try {
      for (const item of pendentes) this.tentados.add(item.externalId);
      for (const d of this.ml.devolucoesPendentes()) this.tentados.add(d.claimId);

      const plano = await this.data.applyMlInbox(novas);
      if (plano.aplicados.length > 0) {
        await this.ml.markInbox(plano.aplicados, 'aplicado');
      }

      // Devoluções entram depois das vendas: elas dependem da venda existir.
      await this.aplicarDevolucoes();

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

  /**
   * Registra as devoluções que o Mercado Livre já informou.
   *
   * Devolução só mexe em dinheiro quando finalizada, então criá-la assim que
   * aparece é seguro: enquanto está aberta, entra como "valor em risco".
   */
  private async aplicarDevolucoes(): Promise<void> {
    const pendentes = this.ml.devolucoesPendentes();
    if (pendentes.length === 0) return;

    const plano = await this.data.applyMlReturns(pendentes);
    if (plano.aplicadas.length > 0) {
      await this.ml.markReturns(plano.aplicadas, 'aplicado');
    }
    if (plano.novas.length > 0) {
      this.notify.info(this.t.instant('mlInbox.returnsImported', { total: plano.novas.length }));
    }
  }

  /** Permite tentar de novo o que ficou pendente (depois de vincular ou comprar). */
  esquecerTentativas(): void {
    this.tentados.clear();
  }
}
