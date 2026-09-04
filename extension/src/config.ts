/**
 * Configuração da extensão.
 *
 * As origens do Lucrato ficam aqui e o `build.mjs` as copia para o manifesto,
 * para não existirem duas listas que podem discordar. Só nessas origens a
 * extensão injeta a ponte de token — em qualquer outro site ela não roda.
 */

/**
 * Onde o Lucrato roda no seu navegador.
 *
 * Comece pelo local. Ao publicar, acrescente o endereço exato do seu deploy
 * (ex.: `https://lucrato-staging.vercel.app/*`). Evite curingas largos como
 * `https://*.vercel.app/*`: isso injetaria a ponte em todo site hospedado lá.
 */
export const ORIGENS_DO_LUCRATO = ['http://localhost:4200/*'];

/**
 * Páginas do Mercado Livre onde o painel aparece.
 *
 * O curinga já cobre `produto.` e `www.`; o painel só se desenha de fato
 * quando a URL tem um código de anúncio (ver `page.ts`).
 */
export const ORIGENS_DO_ML = ['https://*.mercadolivre.com.br/*'];

/** Base das Cloud Functions do projeto. Mesma região do Firestore. */
export const FUNCTIONS_BASE =
  'https://southamerica-east1-lucrato-dev.cloudfunctions.net';

/** Prefixo das mensagens trocadas na página, para não colidir com o site. */
export const CANAL = 'lucrato-ext';

/**
 * Comissão usada enquanto o Lucrato não estiver aberto para informar a real.
 * É o mesmo padrão do app (`settings.defaultMlFee`).
 */
export const COMISSAO_PADRAO = 0.12;
