/**
 * Segredo no caminho do webhook.
 *
 * O corpo da notificação sempre foi tratado como ponteiro, então um POST forjado
 * nunca injetou venda. O que ele injetava era CUSTO: cada requisição virava uma
 * escrita no Firestore e disparava um gatilho que chama a API do Mercado Livre
 * com o token do vendedor — e o ML bloqueia por IP quem exagera.
 *
 * O teste que mais importa é o do segredo VAZIO liberando tudo. É o
 * comportamento antigo, e ele é mantido de propósito: configurar errado não pode
 * derrubar a captura de vendas, porque notificação recusada não volta — o
 * Mercado Livre desiste depois de uma hora e aquelas vendas somem.
 */
import { segredoConfere, segredoDaUrl } from './webhook';

describe('segredo no caminho', () => {
  it('sem segredo configurado, aceita tudo (comportamento antigo)', () => {
    // Uma configuracao esquecida nao pode calar a integracao.
    expect(segredoConfere('', '')).toBe(true);
    expect(segredoConfere('qualquer-coisa', '')).toBe(true);
  });

  it('segredo certo passa', () => {
    expect(segredoConfere('s3gr3d0', 's3gr3d0')).toBe(true);
  });

  it('segredo errado nao passa', () => {
    expect(segredoConfere('errado1', 's3gr3d0')).toBe(false);
  });

  it('tamanho diferente nao passa, e nao estoura', () => {
    // `timingSafeEqual` lanca com buffers de tamanhos diferentes.
    expect(segredoConfere('curto', 's3gr3d0-bem-mais-longo')).toBe(false);
    expect(segredoConfere('s3gr3d0-bem-mais-longo', 'curto')).toBe(false);
  });

  it('caminho vazio contra segredo configurado nao passa', () => {
    expect(segredoConfere('', 's3gr3d0')).toBe(false);
  });
});

describe('extracao do segredo da URL', () => {
  it('pega o ultimo trecho do caminho', () => {
    expect(segredoDaUrl('/mlWebhook/s3gr3d0')).toBe('s3gr3d0');
  });

  it('ignora barra no fim', () => {
    expect(segredoDaUrl('/mlWebhook/s3gr3d0/')).toBe('s3gr3d0');
    expect(segredoDaUrl('/mlWebhook/s3gr3d0///')).toBe('s3gr3d0');
  });

  it('ignora query string', () => {
    expect(segredoDaUrl('/mlWebhook/s3gr3d0?x=1')).toBe('s3gr3d0');
  });

  it('caminho sem segredo devolve o nome da function, que nao casa com nada', () => {
    expect(segredoDaUrl('/mlWebhook')).toBe('mlWebhook');
  });

  it('caminho vazio ou estranho nao estoura', () => {
    expect(segredoDaUrl('')).toBe('');
    expect(segredoDaUrl('/')).toBe('');
    expect(segredoDaUrl('///')).toBe('');
  });
});
