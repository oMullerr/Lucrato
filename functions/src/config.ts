/**
 * Configuração compartilhada das functions.
 *
 * Região igual à do Firestore para reduzir latência, e os segredos do
 * aplicativo do Mercado Livre vindos do Secret Manager — nunca do repositório.
 */
import { defineSecret } from 'firebase-functions/params';

/** Mesma região do Firestore do projeto. */
export const REGION = 'southamerica-east1';

/** Base da API do Mercado Livre (a mesma para todos os países). */
export const ML_API = 'https://api.mercadolibre.com';

/** Site do Brasil. */
export const SITE_ID = 'MLB';

/** App ID do aplicativo criado no DevCenter do Mercado Livre. */
export const ML_CLIENT_ID = defineSecret('ML_CLIENT_ID');

/** Secret Key do mesmo aplicativo. Nunca sai do Secret Manager. */
export const ML_CLIENT_SECRET = defineSecret('ML_CLIENT_SECRET');
