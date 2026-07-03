import { Injectable, InjectionToken, inject } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { Observable } from 'rxjs';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AppDialogConfig<D> {
  data?: D;
  size?: DialogSize;
  /** Impede fechar por ESC/backdrop/X (ex.: operação em andamento). */
  disableClose?: boolean;
}

/** Config de fechamento lida pelo app-dialog-shell. */
export const APP_DIALOG_DISABLE_CLOSE = new InjectionToken<boolean>('APP_DIALOG_DISABLE_CLOSE', {
  factory: () => false,
});

/**
 * Ref devolvida por DialogService.open(). Mantém a superfície que os call
 * sites da era Material já usam: close() + afterClosed().
 */
export class AppDialogRef<R = unknown> {
  constructor(private readonly ref: DialogRef<R, unknown>) {}

  close(result?: R): void {
    this.ref.close(result);
  }

  /** Alias de compatibilidade (MatDialogRef.afterClosed). */
  afterClosed(): Observable<R | undefined> {
    return this.ref.closed;
  }

  get closed(): Observable<R | undefined> {
    return this.ref.closed;
  }
}

/**
 * Dialogs do design system sobre @angular/cdk/dialog (focus trap, aria-modal,
 * restauração de foco). O visual vem do <app-dialog-shell> dentro de cada
 * componente de dialog; o tamanho é controlado por CSS (full-screen < sm).
 *
 * O fechamento por ESC/backdrop/X é responsabilidade do shell (que respeita
 * `busy` e `disableClose`); por isso o CDK abre sempre com disableClose.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  open<T, D = unknown, R = unknown>(
    component: ComponentType<T>,
    config: AppDialogConfig<D> = {},
  ): AppDialogRef<R> {
    const size = config.size ?? 'md';
    const ref = this.dialog.open<R, D, T>(component, {
      data: config.data,
      disableClose: true, // shell decide (respeitando busy/disableClose)
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: ['app-dialog-panel', `app-dialog--${size}`],
      providers: [
        { provide: APP_DIALOG_DISABLE_CLOSE, useValue: config.disableClose ?? false },
      ],
    });
    return new AppDialogRef<R>(ref as DialogRef<R, unknown>);
  }
}
