import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { APP } from '../constants/app.constants';
import { comPrazo } from './com-prazo';
import { logError } from './logger';

/** Prazo do i18n no boot. Curto de propósito: é melhor subir com as chaves
    cruas do que segurar a tela esperando um JSON. */
const I18N_TIMEOUT_MS = 5000;

export type LangCode = 'pt-BR' | 'en-US' | 'es';

export interface LangOption {
  code: LangCode;
  label: string;
  /** Path to the flag SVG asset (served from public/). Emoji flags don't render on Windows. */
  flag: string;
}

export const SUPPORTED_LANGS: LangOption[] = [
  { code: 'pt-BR', label: 'Português', flag: 'flags/br.svg' },
  { code: 'en-US', label: 'English', flag: 'flags/us.svg' },
  { code: 'es', label: 'Español', flag: 'flags/es.svg' },
];

export const DEFAULT_LANG: LangCode = 'pt-BR';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);

  private readonly _lang = signal<LangCode>(this.detectInitial());
  /** Reactive current language — read it inside computed() to recompute strings on change. */
  readonly lang = this._lang.asReadonly();
  readonly available = SUPPORTED_LANGS;

  /**
   * Configura o ngx-translate e pré-carrega o idioma ativo. Usado pelo
   * APP_INITIALIZER.
   *
   * NUNCA rejeita e NUNCA pendura. Este é o único ponto do app capaz de impedir
   * o `bootstrapApplication` de completar, e o preço de falhar aqui é tela
   * branca: sem casca, sem erro na tela, só um `console.error` em `main.ts` que
   * ninguém vê. Nenhum arquivo de tradução vale isso.
   *
   * Se as traduções não chegarem, o app sobe com as chaves cruas e o
   * ngx-translate as preenche depois, se a requisição enfim responder. Feio por
   * alguns segundos é infinitamente melhor que branco para sempre.
   */
  async init(): Promise<void> {
    this.translate.addLangs(SUPPORTED_LANGS.map(l => l.code));
    this.translate.setDefaultLang(DEFAULT_LANG);
    const lang = this._lang();
    document.documentElement.lang = lang;

    try {
      await comPrazo(firstValueFrom(this.translate.use(lang)), I18N_TIMEOUT_MS);
    } catch (err) {
      logError('[LanguageService] traduções não carregaram; subindo com as chaves cruas:', err);
    }
  }

  set(code: LangCode): void {
    if (code === this._lang()) return;
    this._lang.set(code);
    localStorage.setItem(APP.langKey, code);
    document.documentElement.lang = code;
    this.translate.use(code);
  }

  current(): LangCode {
    return this._lang();
  }

  private detectInitial(): LangCode {
    const saved = localStorage.getItem(APP.langKey) as LangCode | null;
    if (saved && SUPPORTED_LANGS.some(l => l.code === saved)) return saved;
    return DEFAULT_LANG;
  }
}
