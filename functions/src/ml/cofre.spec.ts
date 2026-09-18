/**
 * Cifra dos tokens do Mercado Livre.
 *
 * O que estes testes protegem é a MIGRAÇÃO, não a criptografia — o KMS é do
 * Google e não precisa ser testado aqui. O risco real é ligar a chave e
 * desconectar todo mundo de uma vez porque a leitura deixou de reconhecer o
 * token antigo, gravado em texto puro.
 *
 * Por isso os casos que mais importam são: texto puro continua legível depois de
 * a chave entrar, e valor cifrado com a chave desligada FALHA ALTO em vez de
 * passar adiante um blob que o Mercado Livre recusaria com 401 — o mesmo
 * sintoma de "reconecte a conta", que manda procurar no lugar errado.
 */
const valorDaChave = { v: '' };

jest.mock('firebase-functions/params', () => ({
  defineString: () => ({ value: () => valorDaChave.v }),
}));
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/** Dublê do KMS: base64 com marca, suficiente para provar ida e volta. */
const clienteFalso = {
  encrypt: jest.fn(async ({ plaintext }: { plaintext: Buffer }) => [
    { ciphertext: Buffer.from('COFRE|' + plaintext.toString('utf8'), 'utf8') },
  ]),
  decrypt: jest.fn(async ({ ciphertext }: { ciphertext: Buffer }) => {
    const cru = ciphertext.toString('utf8');
    if (!cru.startsWith('COFRE|')) throw new Error('blob estranho');
    return [{ plaintext: Buffer.from(cru.slice('COFRE|'.length), 'utf8') }];
  }),
};

jest.mock('@google-cloud/kms', () => ({
  KeyManagementServiceClient: class {
    encrypt = clienteFalso.encrypt;
    decrypt = clienteFalso.decrypt;
  },
}));

import { cifrar, cifraLigada, decifrar, estaCifrado, usarClienteDeTeste } from './cofre';

const CHAVE = 'projects/p/locations/l/keyRings/kr/cryptoKeys/k';

beforeEach(() => {
  jest.clearAllMocks();
  valorDaChave.v = '';
  usarClienteDeTeste(null);
});

describe('desligada por padrao', () => {
  it('sem ML_KMS_KEY, nada e cifrado', async () => {
    expect(cifraLigada()).toBe(false);
    expect(await cifrar('token-vivo')).toBe('token-vivo');
    expect(clienteFalso.encrypt).not.toHaveBeenCalled();
  });

  it('sem chave, texto puro continua sendo lido', async () => {
    expect(await decifrar('token-vivo')).toBe('token-vivo');
  });
});

describe('com a chave configurada', () => {
  beforeEach(() => { valorDaChave.v = CHAVE; });

  it('ida e volta devolve o mesmo token', async () => {
    const cifrado = await cifrar('APP_USR-123');
    expect(cifrado).not.toContain('APP_USR-123');
    expect(estaCifrado(cifrado)).toBe(true);
    expect(await decifrar(cifrado)).toBe('APP_USR-123');
  });

  it('nao cifra duas vezes', async () => {
    const uma = await cifrar('APP_USR-123');
    const duas = await cifrar(uma);
    expect(duas).toBe(uma);
    expect(clienteFalso.encrypt).toHaveBeenCalledTimes(1);
  });

  it('valor vazio nao gasta chamada ao KMS', async () => {
    expect(await cifrar('')).toBe('');
    expect(clienteFalso.encrypt).not.toHaveBeenCalled();
  });

  it('TEXTO PURO CONTINUA LEGIVEL — e a migracao', async () => {
    // Ligar a chave nao pode desconectar quem ja estava conectado.
    expect(await decifrar('token-antigo-em-claro')).toBe('token-antigo-em-claro');
    expect(clienteFalso.decrypt).not.toHaveBeenCalled();
  });
});

describe('chave removida depois de ligada', () => {
  it('valor cifrado sem chave FALHA ALTO, em vez de virar 401 silencioso', async () => {
    valorDaChave.v = CHAVE;
    const cifrado = await cifrar('APP_USR-123');

    valorDaChave.v = '';
    await expect(decifrar(cifrado)).rejects.toThrow('kms_chave_ausente');
  });
});
