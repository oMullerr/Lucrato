/**
 * O que está sendo protegido aqui é a fronteira: o navegador manda um objeto
 * qualquer e este é o único ponto que decide o que entra no banco. Um campo a
 * mais passando despercebido é vazamento de dado financeiro, não bug de UI.
 */
import { cabeNaJanela, sanitizarErro } from './client-errors';

describe('sanitizarErro', () => {
  it('deixa passar só os campos da lista', () => {
    const limpo = sanitizarErro({
      message: 'deu ruim',
      name: 'TypeError',
      stack: 'at foo',
      url: 'https://lucrato.vercel.app/inventory',
      build: 'main-ABC123.js',
      // tudo abaixo é o que NÃO pode vazar
      purchases: [{ produto: 'segredo', custo: 1234 }],
      token: 'APP_USR-123',
      email: 'pessoa@exemplo.com',
    });

    expect(Object.keys(limpo).sort()).toEqual(['build', 'message', 'name', 'stack', 'url']);
    expect(JSON.stringify(limpo)).not.toContain('segredo');
    expect(JSON.stringify(limpo)).not.toContain('APP_USR-123');
    expect(JSON.stringify(limpo)).not.toContain('pessoa@exemplo.com');
  });

  it('trunca no teto de cada campo', () => {
    const limpo = sanitizarErro({
      message: 'x'.repeat(9000),
      stack: 'y'.repeat(9000),
      url: 'z'.repeat(9000),
    });

    expect(limpo.message).toHaveLength(500);
    expect(limpo.stack).toHaveLength(4000);
    expect(limpo.url).toHaveLength(300);
  });

  it('não quebra com lixo no lugar do erro', () => {
    expect(sanitizarErro(null).message).toBe('');
    expect(sanitizarErro(undefined).message).toBe('');
    expect(sanitizarErro('texto solto').message).toBe('');
    expect(sanitizarErro({ message: { nao: 'é string' } }).message).toBe('');
    expect(sanitizarErro({ message: 42 }).message).toBe('');
  });
});

describe('cabeNaJanela', () => {
  it('segura a enxurrada e libera de novo no minuto seguinte', () => {
    const inicio = Date.parse('2026-09-11T12:00:00Z');

    const primeiros = Array.from({ length: 60 }, (_, i) => cabeNaJanela(inicio + i));
    expect(primeiros.every(Boolean)).toBe(true);

    // 61º no mesmo minuto: barrado.
    expect(cabeNaJanela(inicio + 100)).toBe(false);

    // Minuto seguinte: janela nova.
    expect(cabeNaJanela(inicio + 61_000)).toBe(true);
  });
});
