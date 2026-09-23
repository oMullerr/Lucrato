import { readFileSync } from 'fs';
import { join } from 'path';

import { APP } from './app/core/constants/app.constants';

/**
 * Guarda de tema (`public/tema.js`).
 *
 * Ela lê a escolha guardada pelo `ThemeService` e aplica a classe antes do
 * primeiro paint. As duas pontas precisam falar a mesma chave; se divergirem,
 * nada quebra — o app só volta a piscar, que é o tipo de defeito que ninguém
 * reporta e todo mundo sente.
 */

const RAIZ = join(__dirname, '..');
const guarda = () => readFileSync(join(RAIZ, 'public', 'tema.js'), 'utf8');
const indice = () => readFileSync(join(__dirname, 'index.html'), 'utf8');

/** Roda o arquivo como o navegador rodaria, no documento do jsdom. */
function executarGuarda(): void {
  new Function(guarda())();
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

describe('guarda de tema', () => {
  it('lê a mesma chave que o ThemeService grava', () => {
    expect(guarda()).toContain(`'${APP.themeKey}'`);
  });

  it('aplica o escuro escolhido', () => {
    localStorage.setItem(APP.themeKey, 'dark');
    executarGuarda();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('aplica o claro escolhido — que é o que desliga o escuro do sistema', () => {
    // O CSS pinta escuro em `html:not(.light)` quando o sistema é escuro.
    localStorage.setItem(APP.themeKey, 'light');
    executarGuarda();
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('sem escolha, não marca nada e deixa o sistema decidir', () => {
    executarGuarda();
    expect(document.documentElement.className).toBe('');
  });

  it('ignora valor desconhecido em vez de pôr uma classe qualquer no <html>', () => {
    localStorage.setItem(APP.themeKey, 'sepia');
    executarGuarda();
    expect(document.documentElement.className).toBe('');
  });
});

describe('index.html', () => {
  it('carrega a guarda como arquivo, sem defer nem async', () => {
    expect(indice()).toMatch(/<script src="\/tema\.js"><\/script>/);
  });

  it('não tem script inline — o CSP o bloquearia em produção', () => {
    const inline = [...indice().matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    expect(inline).toEqual([]);
  });
});
