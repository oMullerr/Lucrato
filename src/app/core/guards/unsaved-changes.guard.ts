import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasChanges?.()) return true;
  return confirm('Você tem alterações não salvas. Sair mesmo assim?');
};
