import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

type NotifyKind = 'success' | 'error' | 'info' | 'warning';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snack = inject(MatSnackBar);

  show(message: string, kind: NotifyKind = 'info', durationMs = 3500): void {
    this.snack.open(message, 'OK', {
      duration: durationMs,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: [`snack-${kind}`],
    });
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
    const ref = this.snack.open(message, actionLabel, {
      duration: durationMs,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: [`snack-${kind}`],
    });
    ref.onAction().subscribe(() => onAction());
  }
}
