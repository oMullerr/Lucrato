import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

const MAX_VISIBLE = 3;

/**
 * Fila de toasts do design system (host: <app-toast-host> no shell).
 * O NotifyService delega para cá — chamadas existentes não mudam.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly t = inject(TranslateService);

  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 1;
  private readonly timers = new Map<number, { handle: ReturnType<typeof setTimeout>; endsAt: number; remaining: number }>();

  show(message: string, kind: ToastKind = 'info', durationMs = 3500): void {
    this.push({ id: this.nextId++, message, kind, durationMs });
  }

  withAction(
    message: string,
    actionLabel: string,
    onAction: () => void,
    kind: ToastKind = 'warning',
    durationMs = 10000,
  ): void {
    this.push({ id: this.nextId++, message, kind, actionLabel, onAction, durationMs });
  }

  /** Toast de "desfazer" após ação destrutiva (janela de 8s). */
  withUndo(message: string, onUndo: () => void): void {
    this.withAction(message, this.t.instant('common.undo'), onUndo, 'info', 8000);
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  runAction(toast: Toast): void {
    toast.onAction?.();
    this.dismiss(toast.id);
  }

  /* Timers pausam no hover para dar tempo de ler/agir. */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearTimeout(timer.handle);
    timer.remaining = Math.max(0, timer.endsAt - Date.now());
  }

  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    timer.endsAt = Date.now() + timer.remaining;
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  private push(toast: Toast): void {
    this._toasts.update((list) => {
      const next = [...list, toast];
      /* Estouro: derruba os mais antigos (mantém no máx. MAX_VISIBLE). */
      while (next.length > MAX_VISIBLE) {
        const dropped = next.shift()!;
        this.clearTimer(dropped.id);
      }
      return next;
    });
    const handle = setTimeout(() => this.dismiss(toast.id), toast.durationMs);
    this.timers.set(toast.id, { handle, endsAt: Date.now() + toast.durationMs, remaining: toast.durationMs });
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer.handle);
    this.timers.delete(id);
  }
}
