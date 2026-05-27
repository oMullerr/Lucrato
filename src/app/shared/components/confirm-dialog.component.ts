import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

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
  ],
  template: `
    <div class="confirm-dialog" [class.danger]="data.danger">
      <div class="accent" aria-hidden="true"></div>
      <div class="content-wrap">
        <h2 mat-dialog-title>{{ data.title }}</h2>
        <mat-dialog-content>
          <p class="message">{{ data.message }}</p>

          @if (data.requireTextMatch) {
            <mat-form-field class="match-field" appearance="outline">
              <mat-label>{{ data.requireTextLabel ?? 'Digite para confirmar' }}</mat-label>
              <input
                matInput
                [ngModel]="typedText()"
                (ngModelChange)="typedText.set($event)"
                autocomplete="off"
              />
              <mat-hint>Digite exatamente: <strong>{{ data.requireTextMatch }}</strong></mat-hint>
            </mat-form-field>
          }

          @if (data.requirePassword) {
            <mat-form-field class="match-field" appearance="outline">
              <mat-label>{{ data.requirePasswordLabel ?? 'Senha atual' }}</mat-label>
              <input
                matInput
                type="password"
                [ngModel]="password()"
                (ngModelChange)="password.set($event)"
                autocomplete="current-password"
              />
            </mat-form-field>
          }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button (click)="cancel()">
            {{ data.cancelText ?? 'Cancelar' }}
          </button>
          <button
            mat-flat-button
            class="confirm-btn"
            [class.danger]="data.danger"
            [disabled]="!canConfirm()"
            (click)="confirm()"
            cdkFocusInitial
          >
            {{ data.confirmText ?? 'Confirmar' }}
          </button>
        </mat-dialog-actions>
      </div>
    </div>
  `,
  styles: [`
    .confirm-dialog {
      position: relative;
      display: flex;
    }

    .accent {
      width: 4px;
      background: var(--brand-primary);
      flex-shrink: 0;
      border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
      margin: 24px 0;
    }

    .confirm-dialog.danger .accent {
      background: var(--color-danger);
    }

    .content-wrap {
      flex: 1;
      padding-left: 16px;
    }

    h2 {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: var(--fs-h2);
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      margin: 0 0 8px;
    }

    .message {
      color: var(--text-secondary);
      line-height: 1.55;
      font-size: var(--fs-body);
      margin: 0;
    }

    .match-field {
      width: 100%;
      margin-top: 16px;
    }

    .confirm-btn {
      --mdc-filled-button-container-color: var(--brand-primary);
      --mdc-filled-button-label-text-color: #FFFFFF;
    }

    .confirm-btn.danger {
      --mdc-filled-button-container-color: var(--color-danger);
      --mdc-filled-button-label-text-color: #FFFFFF;
    }
  `]
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
