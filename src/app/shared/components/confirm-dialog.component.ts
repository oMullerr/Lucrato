import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  requireTextMatch?: string;
  requireTextLabel?: string;
  requirePassword?: boolean;
  requirePasswordLabel?: string;
}

export type ConfirmDialogResult =
  | false
  | { confirmed: true; password?: string };

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule,
  ],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly ref = inject<MatDialogRef<ConfirmDialogComponent, ConfirmDialogResult>>(MatDialogRef);
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  protected readonly typedText = signal('');
  protected readonly password = signal('');

  protected readonly canConfirm = computed(() => {
    if (this.data.requireTextMatch && this.typedText().trim() !== this.data.requireTextMatch) {
      return false;
    }
    if (this.data.requirePassword && this.password().length === 0) {
      return false;
    }
    return true;
  });

  protected cancel(): void {
    this.ref.close(false);
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;
    if (this.data.requirePassword) {
      this.ref.close({ confirmed: true, password: this.password() });
    } else {
      this.ref.close({ confirmed: true });
    }
  }
}
