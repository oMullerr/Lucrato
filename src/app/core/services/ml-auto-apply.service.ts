import { Injectable, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DataService } from './data.service';
import { MlIntegrationService } from './ml-integration.service';
import { NotifyService } from './notify.service';
import { logError } from './logger';
import { classificarCaixa } from '../ml/reconcile';

/**
 * Teto de rodadas automáticas numa janela curta, e a janela.
 *
 * Uso normal dispara um punhado de rodadas, espalhadas; um loop dispara
 * centenas em milissegundos. Não é afinação de desempenho — é o limite entre
 * "trabalhando" e "girando em falso".
 */
const MAX_RODADAS_NA_JANELA = 20;
const JANELA_MS = 5000;

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

  /* Trava de segurança: ver `registrarRodada`. */
  private rodadasNaJanela = 0;
  private janelaAbertaEm = 0;
  private desarmado = false;

  constructor() {
    effect(() => {
      if (this.desarmado) return;

      const pendentes = this.ml.inboxPendentes();
      /* Mesma fonte que o interruptor da tela de Integrações lê. Duas leituras
         da mesma configuração acabariam discordando — e a que discordasse em
         silêncio seria justamente esta, que decide se o app escreve no razão. */
      const ligado = this.data.mlAutoApply();

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
    this.registrarRodada();
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
      /* As devoluções são registradas dentro de `aplicarDevolucoes`, no momento
         em que são de fato tentadas — aqui o retrato ainda seria o de antes das
         vendas entrarem. */

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

    /* Registra a tentativa ANTES de tentar, e por isso aqui dentro: é por este
       método que passam as três saídas de `aplicar()`, e duas delas não
       registravam nada.

       Isso não é zelo, é o que faz o app parar de rodar. O effect LÊ
       `rodando()`, e toda rodada liga e desliga esse sinal — terminar já
       re-arma o effect. Quem segura o loop é este Set: o que não couber
       (devolução cuja venda não está no razão, que `planejarDevolucoes` devolve
       em `pendentes` e nunca em `aplicadas`) precisa sair do conjunto de
       "novos" na mesma rodada. Sem isso o par effect→aplicar→effect gira para
       sempre, em microtask fechada, e a aba congela — sem timer, sem rede e sem
       um erro sequer. Foi o que derrubou o app em 18/09/2026.

       Antes do `await` de propósito: cobre também o caminho de exceção. */
    for (const d of pendentes) this.tentados.add(d.claimId);

    const plano = await this.data.applyMlReturns(pendentes);
    if (plano.aplicadas.length > 0) {
      await this.ml.markReturns(plano.aplicadas, 'aplicado');
    }
    if (plano.novas.length > 0) {
      this.notify.info(this.t.instant('mlInbox.returnsImported', { total: plano.novas.length }));
    }
  }

  /**
   * Conta as rodadas automáticas e desarma se elas virarem um loop.
   *
   * Existe para o caso que não previmos. O registro em `tentados` já prova que
   * o loop acaba — o conjunto de itens novos só diminui —, mas essa prova vale
   * enquanto todo caminho novo continuar registrando o que tentou. Esta trava
   * não depende disso: ela olha só a frequência, que é o que separa "está
   * trabalhando" de "está girando em falso", e limita QUALQUER loop futuro,
   * venha de onde vier.
   *
   * Mesma regra que a `comPrazo` já firmou para Promise, aplicada a effect:
   * estourar o limite é um resultado — dá para logar e seguir. Rodar para
   * sempre não é, porque congela a aba e leva junto o console de quem tentaria
   * diagnosticar.
   *
   * Desarma só o caminho automático. O botão "Tentar aplicar agora" chama
   * `aplicar()` direto e continua funcionando: é ação do dono, e tem fim.
   */
  private registrarRodada(): void {
    const agora = Date.now();
    if (agora - this.janelaAbertaEm > JANELA_MS) {
      this.janelaAbertaEm = agora;
      this.rodadasNaJanela = 0;
    }
    if (++this.rodadasNaJanela > MAX_RODADAS_NA_JANELA && !this.desarmado) {
      this.desarmado = true;
      logError(
        '[MlAutoApply] auto-aplicar desarmado nesta sessão: virou loop.',
        { rodadas: this.rodadasNaJanela, janelaMs: JANELA_MS },
      );
    }
  }

  /** Permite tentar de novo o que ficou pendente (depois de vincular ou comprar). */
  esquecerTentativas(): void {
    this.tentados.clear();
    // Re-arma: é o dono pedindo, no botão. Se tinha desarmado, ganha nova chance.
    this.desarmado = false;
    this.rodadasNaJanela = 0;
    this.janelaAbertaEm = Date.now();
  }
}
