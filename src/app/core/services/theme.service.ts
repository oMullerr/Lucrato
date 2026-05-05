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
      document.documentElement.classList.toggle('dark', t === 'dark');
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
