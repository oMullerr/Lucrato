/**
 * Cifra dos tokens do Mercado Livre, com Cloud KMS.
 *
 * `users/{uid}/secret/ml` guardava `accessToken` e `refreshToken` em texto puro.
 * As security rules negam esse caminho ao navegador, e isso resolve o acesso
 * pela aplicação — mas não resolve os caminhos de FORA dela: uma credencial de
 * service account vazada, um engano nas rules, ou um backup baixado para a
 * máquina errada entregam acesso total à conta do Mercado Livre.
 *
 * O `.gitignore` do projeto já reconhecia o risco antes desta cifra existir:
 * `lucrato-backup-*.json` é ignorado "porque podem conter tokens vivos do
 * Mercado Livre". Isso confirmava o problema em vez de resolvê-lo. Com a cifra,
 * um backup vazado vira texto inútil sem a chave do KMS.
 *
 * DESLIGADO POR PADRÃO, de propósito. Sem `ML_KMS_KEY` configurada, tudo
 * continua exatamente como era. A chave do KMS é infraestrutura que precisa ser
 * provisionada no console, e o código não pode quebrar a integração inteira
 * esperando por ela.
 *
 * MIGRAÇÃO SEM JANELA. A leitura reconhece os dois formatos pelo prefixo, então
 * token antigo continua sendo lido depois de a chave entrar. Como o refresh do
 * Mercado Livre é de uso único — cada renovação reescreve o par —, os tokens de
 * cada vendedor passam a cifrados sozinhos na primeira renovação, dentro de seis
 * horas. Não há script de migração, e não precisa haver.
 */
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { logger } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';

/**
 * Nome completo da chave do KMS. Vazio = cifra desligada.
 *
 * Formato: projects/{p}/locations/{l}/keyRings/{kr}/cryptoKeys/{k}
 */
export const ML_KMS_KEY = defineString('ML_KMS_KEY', { default: '' });

/**
 * Marca o formato cifrado.
 *
 * Carrega a versão porque um dia a chave gira ou o algoritmo muda, e aí é
 * preciso distinguir "cifrado com o esquema antigo" de "texto puro" — sem a
 * versão, a única saída seria adivinhar.
 */
const PREFIXO = 'kms1:';

let cliente: KeyManagementServiceClient | null = null;
const obterCliente = () => (cliente ??= new KeyManagementServiceClient());

/** Só para teste: permite injetar um dublê sem subir o SDK do Google. */
export function usarClienteDeTeste(dublê: KeyManagementServiceClient | null): void {
  cliente = dublê;
}

export function cifraLigada(): boolean {
  return ML_KMS_KEY.value() !== '';
}

export function estaCifrado(valor: string): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

/**
 * Cifra um segredo. Devolve o texto puro quando a cifra está desligada.
 *
 * Valor vazio passa direto: cifrar string vazia gastaria uma chamada ao KMS
 * para produzir um blob que representa nada.
 */
export async function cifrar(texto: string): Promise<string> {
  if (!texto || !cifraLigada() || estaCifrado(texto)) return texto;

  const [r] = await obterCliente().encrypt({
    name: ML_KMS_KEY.value(),
    plaintext: Buffer.from(texto, 'utf8'),
  });
  if (!r.ciphertext) throw new Error('kms_sem_ciphertext');
  return PREFIXO + Buffer.from(r.ciphertext as Uint8Array).toString('base64');
}

/**
 * Decifra quando vier cifrado; devolve como está quando vier em texto puro.
 *
 * O caminho de texto puro NÃO é tolerância a erro — é a migração. Enquanto
 * houver token gravado antes da chave existir, ele precisa continuar
 * funcionando, senão ligar a cifra desconectaria todo mundo de uma vez.
 */
export async function decifrar(valor: string): Promise<string> {
  if (!valor || !estaCifrado(valor)) return valor;

  if (!cifraLigada()) {
    /* Cifrado no banco e sem chave para abrir: desligar `ML_KMS_KEY` depois de
       ligada é a única forma de chegar aqui. Falhar alto é melhor que devolver
       o blob como se fosse um token e ver o Mercado Livre recusar com 401 —
       que é o mesmo sintoma de "reconecte a conta" e manda procurar no lugar
       errado. */
    logger.error('Token cifrado sem ML_KMS_KEY configurada');
    throw new Error('kms_chave_ausente');
  }

  const [r] = await obterCliente().decrypt({
    name: ML_KMS_KEY.value(),
    ciphertext: Buffer.from(valor.slice(PREFIXO.length), 'base64'),
  });
  if (!r.plaintext) throw new Error('kms_sem_plaintext');
  return Buffer.from(r.plaintext as Uint8Array).toString('utf8');
}
