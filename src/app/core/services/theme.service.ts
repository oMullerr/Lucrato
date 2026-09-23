import { Injectable, signal, effect } from '@angular/core';
import { APP } from '../constants/app.constants';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.detectInitial());
  readonly theme = this._theme.asReadonly();

  constructor() {
    effect(() => {
      const t = this._theme();
      const raiz = document.documentElement;
      raiz.classList.toggle('dark', t === 'dark');
      /* `light` também, e não é redundante: o CSS aplica o tema escuro por
         `prefers-color-scheme` em `html:not(.light)`, para o primeiro paint
         não piscar branco antes de o Angular subir. Sem esta marca, quem tem o
         sistema no escuro e escolheu claro ficaria preso no escuro. */
      raiz.classList.toggle('light', t === 'light');
      localStorage.setItem(APP.themeKey, t);
    });
  }

  toggle(): void {
    this._theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }

  set(theme: Theme): void {
    this._theme.set(theme);
  }

  isDark(): boolean {
    return this._theme() === 'dark';
  }

  private detectInitial(): Theme {
    const saved = localStorage.getItem(APP.themeKey) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
