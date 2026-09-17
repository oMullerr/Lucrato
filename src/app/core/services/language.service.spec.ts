import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { LanguageService, DEFAULT_LANG, SUPPORTED_LANGS } from './language.service';

/**
 * O `init()` deste serviço roda no APP_INITIALIZER, e é o ÚNICO ponto do app
 * capaz de impedir o `bootstrapApplication` de completar. Se ele pendurar, o
 * usuário vê tela branca — sem erro, sem casca, sem nada, porque `main.ts` só
 * tem um `.catch(console.error)`.
 *
 * Nenhum arquivo de tradução vale isso. Estes testes travam a regra: o app sobe
 * sempre; no pior caso as chaves aparecem cruas e o ngx-translate preenche
 * depois, se a requisição chegar.
 */
function montar(use: () => Observable<unknown>) {
  const translate = {
    addLangs: jest.fn(),
    setDefaultLang: jest.fn(),
    use: jest.fn(use),
  } as unknown as TranslateService;

  TestBed.configureTestingModule({
    providers: [LanguageService, { provide: TranslateService, useValue: translate }],
  });

  return { service: TestBed.inject(LanguageService), translate };
}

describe('LanguageService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('configura os idiomas e resolve quando as traduções carregam', async () => {
    const { service, translate } = montar(() => of({}));

    await service.init();

    expect(translate.addLangs).toHaveBeenCalledWith(SUPPORTED_LANGS.map(l => l.code));
    expect(translate.setDefaultLang).toHaveBeenCalledWith(DEFAULT_LANG);
    expect(document.documentElement.lang).toBe(DEFAULT_LANG);
  });

  it('resolve mesmo quando o carregamento das traduções falha', async () => {
    const { service } = montar(() => throwError(() => new Error('404 no i18n')));

    await expect(service.init()).resolves.toBeUndefined();
  });

  it('resolve mesmo quando o carregamento das traduções nunca responde', async () => {
    jest.useFakeTimers();
    const { service } = montar(() => new Observable(() => undefined));

    const boot = service.init();
    let terminou = false;
    boot.then(() => { terminou = true; });

    await jest.advanceTimersByTimeAsync(60_000);
    await boot;

    expect(terminou).toBe(true);
    jest.useRealTimers();
  });
});
