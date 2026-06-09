import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

export interface HasUnsavedChanges {
  hasChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasChanges?.()) return true;
  const translate = inject(TranslateService);
  return confirm(translate.instant('common.unsavedChanges'));
};
