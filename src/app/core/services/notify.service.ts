import { inject, Injectable } from '@angular/core';
import { ToastService, ToastKind } from '../../shared/ui/toast/toast.service';

type NotifyKind = ToastKind;

/**
 * Fachada de notificações — API pública estável desde a era Material.
 * Internamente delega ao ToastService do design system (host no shell).
 */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly toast = inject(ToastService);

  show(message: string, kind: NotifyKind = 'info', durationMs = 3500): void {
    this.toast.show(message, kind, durationMs);
  }

  success(msg: string): void { this.show(msg, 'success'); }
  error(msg: string): void { this.show(msg, 'error', 5000); }
  info(msg: string): void { this.show(msg, 'info'); }
  warning(msg: string): void { this.show(msg, 'warning', 4500); }

  withAction(
    message: string,
    actionLabel: string,
    onAction: () => void,
    kind: NotifyKind = 'warning',
    durationMs = 10000,
  ): void {
    this.toast.withAction(message, actionLabel, onAction, kind, durationMs);
  }

  /** Toast com ação de desfazer (para exclusões). */
  withUndo(message: string, onUndo: () => void): void {
    this.toast.withUndo(message, onUndo);
  }
}
