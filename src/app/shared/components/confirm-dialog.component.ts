import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslateModule } from '@ngx-translate/core';
import { DialogShellComponent } from '../ui/dialog/dialog-shell.component';
import { ButtonComponent } from '../ui/button/button.component';
import { FieldComponent } from '../ui/field/field.component';
import { InputDirective } from '../ui/field/input.directive';

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
    A11yModule,
    TranslateModule,
    DialogShellComponent,
    ButtonComponent,
    FieldComponent,
    InputDirective,
  ],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly ref = inject<DialogRef<ConfirmDialogResult>>(DialogRef);
  readonly data = inject<ConfirmDialogData>(DIALOG_DATA);

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
