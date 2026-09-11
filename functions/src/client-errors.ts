/**
 * Recebe o erro que estourou no navegador do usuário.
 *
 * Produção era cega: `logError` silencia tudo quando `production` é true e não
 * existia reporte nenhum. Quando o CSP derrubou o reCAPTCHA e as fotos do
 * Mercado Livre, em setembro/2026, o app ficou dias quebrado sem um sinal
 * chegar em ninguém. Esta function é esse sinal.
 *
 * O app mexe com dado financeiro, então aqui vale a regra do porteiro: só passa
 * o que está na lista, truncado no tamanho da lista. Nada de `...dados`.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

/** Dias que um erro fica guardado. Há política de TTL em `expireAt`. */
const DIAS_DE_GUARDA = 30;

/** Tetos por campo. Stack é o único que precisa de espaço de verdade. */
const TETOS = { message: 500, name: 120, stack: 4000, url: 300, build: 120, userAgent: 300 } as const;

/** Teto por instância, por minuto. Não é segurança, é conta de luz: a function
 *  é aberta de propósito (erro acontece antes do login), então precisa de um
 *  limite bobo que impeça um loop de render virar fatura. */
const POR_MINUTO = 60;

export interface ErroDoCliente {
  message: string;
  name: string;
  stack: string;
  url: string;
  /** Nome do bundle carregado. Denuncia usuário preso em versão velha. */
  build: string;
}

function texto(valor: unknown, teto: number): string {
  if (typeof valor !== 'string') return '';
  return valor.trim().slice(0, teto);
}

/**
 * Deixa passar só a lista, no tamanho da lista.
 *
 * Exportada para o teste: é a fronteira entre o navegador e o nosso banco, e é
 * exatamente onde um campo a mais entraria sem ninguém ver.
 */
export function sanitizarErro(dados: unknown): ErroDoCliente {
  const cru = (dados ?? {}) as Record<string, unknown>;
  return {
    message: texto(cru['message'], TETOS.message),
    name: texto(cru['name'], TETOS.name),
    stack: texto(cru['stack'], TETOS.stack),
    url: texto(cru['url'], TETOS.url),
    build: texto(cru['build'], TETOS.build),
  };
}

let janela = { inicio: 0, contagem: 0 };

/** Limite grosseiro por instância. Volta true quando ainda cabe. */
export function cabeNaJanela(agoraMs: number): boolean {
  if (agoraMs - janela.inicio > 60_000) {
    janela = { inicio: agoraMs, contagem: 0 };
  }
  janela.contagem += 1;
  return janela.contagem <= POR_MINUTO;
}

/**
 * `enforceAppCheck: false` é proposital, e não descuido: o erro que mais
 * interessa é justamente o do App Check quebrado. Exigir App Check aqui
 * silenciaria o reporte na única hora em que ele importa.
 */
export const logClientError = onCall({ enforceAppCheck: false, maxInstances: 3 }, async (request) => {
  const erro = sanitizarErro(request.data);

  if (!erro.message) {
    throw new HttpsError('invalid-argument', 'Erro sem mensagem.');
  }

  if (!cabeNaJanela(Date.now())) {
    logger.warn('Reporte de erro descartado por excesso', { build: erro.build });
    return { ok: false, motivo: 'excesso' as const };
  }

  const agora = Timestamp.now();
  const expireAt = Timestamp.fromMillis(agora.toMillis() + DIAS_DE_GUARDA * 24 * 60 * 60 * 1000);

  await getFirestore()
    .collection('errorLog')
    .add({
      ...erro,
      uid: request.auth?.uid ?? null,
      userAgent: texto(request.rawRequest.headers['user-agent'], TETOS.userAgent),
      createdAt: agora,
      expireAt,
    });

  /* Vai junto para o Cloud Logging, que é onde dá para montar alerta sem
     depender de ninguém abrir o Firestore.
     Aninhado em `erro` de proposito: o logger do firebase-functions usa a
     chave `message` para o texto DELE, e um campo `message` solto aqui some
     sobrescrito — some justamente a informação que interessa. */
  logger.error('Erro no cliente', {
    erro: {
      message: erro.message,
      name: erro.name,
      url: erro.url,
      build: erro.build,
    },
    uid: request.auth?.uid ?? null,
  });

  return { ok: true as const };
});
