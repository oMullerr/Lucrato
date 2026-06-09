import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

/**
 * Resolves route `title` values as i18n keys and keeps the browser tab title
 * in sync with the active language (re-applies on language change).
 */
@Injectable()
export class TranslateTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);
  private currentKey: string | null = null;

  constructor() {
    super();
    this.translate.onLangChange.subscribe(() => this.apply());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.currentKey = this.buildTitle(snapshot) ?? null;
    this.apply();
  }

  private apply(): void {
    if (this.currentKey) {
      this.title.setTitle(this.translate.instant(this.currentKey));
    }
  }
}
