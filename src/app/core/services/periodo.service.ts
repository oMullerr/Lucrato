import { Injectable, effect, signal } from '@angular/core';
import type { RangeKey } from '../../shared/components/date-range-picker.component';
import { logError } from './logger';

/** Chave do recorte guardado no navegador. */
const CHAVE = 'lucrato-periodo';

/** Presets aceitos na volta. Qualquer outra coisa cai em 'all'. */
const VALIDOS: readonly RangeKey[] = ['7d', '30d', '90d', '12m', 'all', 'custom'];

interface Guardado {
  range: RangeKey;
  start: string | null;
  end: string | null;
}

/**
 * O período, uma vez só, valendo para todas as telas.
 *
 * O seletor já era compartilhado — Vendas, Compras, Devoluções e o Painel usam
 * o MESMO componente —, mas cada tela guardava o próprio estado. Na prática
 * isso significava reescolher "últimos 30 dias" quatro vezes para responder uma
 * pergunta só, e o Painel abria em 30 dias enquanto as listagens abriam em
 * tudo: dois recortes diferentes lado a lado, sem nada dizendo isso.
 *
 * O estado mora aqui, e o componente continua burro — ele recebe e devolve,
 * como antes. Quem decide o que o período significa em cada tela continua
 * sendo a tela: filtrar uma listagem e recortar um gráfico não são a mesma
 * operação, e concentrar isso aqui só criaria um lugar que precisa saber de
 * todas elas.
 *
 * **O padrão é 'all', de propósito.** Um padrão que esconde é pior que um
 * padrão amplo: quem abre Vendas num recorte de 7 dias e não repara no seletor
 * conclui que as vendas sumiram. O Painel abria em 30 dias e passa a abrir em
 * tudo — mudou a primeira tela, não o que dá para ver.
 */
@Injectable({ providedIn: 'root' })
export class PeriodoService {
  readonly range = signal<RangeKey>('all');
  readonly customStart = signal<Date | null>(null);
  readonly customEnd = signal<Date | null>(null);

  constructor() {
    this.restaurar();

    /* Guardado no navegador, não na base: é preferência de quem está olhando,
       não dado do negócio. Vale por dispositivo e nunca sai daqui. */
    effect(() => {
      const dados: Guardado = {
        range: this.range(),
        start: this.customStart()?.toISOString() ?? null,
        end: this.customEnd()?.toISOString() ?? null,
      };
      try {
        globalThis.localStorage?.setItem(CHAVE, JSON.stringify(dados));
      } catch {
        /* Aba anônima, armazenamento bloqueado, cota estourada. Não lembrar o
           recorte é um aborrecimento; derrubar a tela por isso, não. */
      }
    });
  }

  /** Volta ao padrão: tudo, sem recorte. */
  limpar(): void {
    this.range.set('all');
    this.customStart.set(null);
    this.customEnd.set(null);
  }

  private restaurar(): void {
    let cru: string | null = null;
    try {
      cru = globalThis.localStorage?.getItem(CHAVE) ?? null;
    } catch {
      return;
    }
    if (!cru) return;

    try {
      const dados = JSON.parse(cru) as Partial<Guardado>;
      const range = VALIDOS.includes(dados.range as RangeKey) ? (dados.range as RangeKey) : 'all';
      const start = data(dados.start);
      const end = data(dados.end);

      /* Um 'custom' sem as duas pontas não é um período — é um estado pela
         metade, que o seletor mostraria como personalizado e filtraria como
         tudo. Melhor voltar ao padrão do que abrir mentindo. */
      if (range === 'custom' && (!start || !end)) return;

      this.range.set(range);
      this.customStart.set(start);
      this.customEnd.set(end);
    } catch (err) {
      logError('[Periodo] recorte guardado ilegível; voltando ao padrão:', err);
    }
  }
}

/** ISO → Date, ou null quando ausente ou impossível. */
function data(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
