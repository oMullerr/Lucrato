import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { APP } from '../constants/app.constants';

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

  /** Configures ngx-translate and preloads the active language. Used by APP_INITIALIZER. */
  init(): Promise<unknown> {
    this.translate.addLangs(SUPPORTED_LANGS.map(l => l.code));
    this.translate.setDefaultLang(DEFAULT_LANG);
    const lang = this._lang();
    document.documentElement.lang = lang;
    return firstValueFrom(this.translate.use(lang));
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
