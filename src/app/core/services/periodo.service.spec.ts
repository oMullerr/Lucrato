/**
 * O período compartilhado entre as telas.
 *
 * O que se prova aqui é quase todo sobre a VOLTA: o recorte guardado é a única
 * coisa que atravessa um F5, e um estado meio escrito volta como um filtro que
 * a tela mostra de um jeito e aplica de outro. Metade dos testes verifica que
 * o serviço prefere o padrão a abrir mentindo.
 */
import { TestBed } from '@angular/core/testing';
import { PeriodoService } from './periodo.service';

const CHAVE = 'lucrato-periodo';

function criar(): PeriodoService {
  TestBed.configureTestingModule({ providers: [PeriodoService] });
  return TestBed.inject(PeriodoService);
}

beforeEach(() => {
  localStorage.clear();
  TestBed.resetTestingModule();
});

describe('padrão', () => {
  it('abre em "tudo" — um padrão que esconde faria a pessoa achar que sumiu dado', () => {
    const p = criar();
    expect(p.range()).toBe('all');
    expect(p.customStart()).toBeNull();
    expect(p.customEnd()).toBeNull();
  });

  it('limpar volta ao padrão', () => {
    const p = criar();
    p.range.set('custom');
    p.customStart.set(new Date('2026-05-01'));
    p.customEnd.set(new Date('2026-05-10'));

    p.limpar();

    expect(p.range()).toBe('all');
    expect(p.customStart()).toBeNull();
    expect(p.customEnd()).toBeNull();
  });
});

describe('o recorte atravessa o F5', () => {
  it('guarda o preset escolhido', () => {
    const p = criar();
    p.range.set('90d');
    TestBed.flushEffects();

    expect(JSON.parse(localStorage.getItem(CHAVE)!)).toMatchObject({ range: '90d' });
  });

  it('volta com o preset guardado', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ range: '7d', start: null, end: null }));
    expect(criar().range()).toBe('7d');
  });

  it('volta com o período personalizado inteiro', () => {
    localStorage.setItem(CHAVE, JSON.stringify({
      range: 'custom',
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-05-10T00:00:00.000Z',
    }));

    const p = criar();

    expect(p.range()).toBe('custom');
    expect(p.customStart()?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(p.customEnd()?.toISOString()).toBe('2026-05-10T00:00:00.000Z');
  });
});

describe('o que NÃO volta', () => {
  it('personalizado sem as duas pontas cai no padrão', () => {
    /* Seria um filtro que o seletor mostra como "personalizado" e aplica como
       "tudo" — a tela dizendo uma coisa e fazendo outra. */
    localStorage.setItem(CHAVE, JSON.stringify({ range: 'custom', start: '2026-05-01T00:00:00.000Z', end: null }));
    expect(criar().range()).toBe('all');
  });

  it('preset desconhecido cai no padrão', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ range: '42d', start: null, end: null }));
    expect(criar().range()).toBe('all');
  });

  it('data impossível vira ausência, não Invalid Date', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ range: '30d', start: 'ontem', end: null }));

    const p = criar();

    expect(p.range()).toBe('30d');
    expect(p.customStart()).toBeNull();
  });

  it('conteúdo corrompido não derruba a tela', () => {
    localStorage.setItem(CHAVE, '{isso nao e json');
    let p!: PeriodoService;
    expect(() => { p = criar(); }).not.toThrow();
    expect(p.range()).toBe('all');
  });

  it('armazenamento indisponível não derruba a tela', () => {
    // Aba anônima, cota estourada, site data bloqueado.
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('bloqueado'); };
    try {
      expect(() => criar()).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it('gravação bloqueada não derruba a tela', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('cota'); };
    try {
      const p = criar();
      p.range.set('12m');
      expect(() => TestBed.flushEffects()).not.toThrow();
      expect(p.range()).toBe('12m');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
