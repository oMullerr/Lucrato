import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>lock_reset</mat-icon>
      Esqueci minha senha
    </h2>
    <mat-dialog-content>
      <p>
        Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
      </p>

      @if (sent()) {
        <div class="info-msg">
          <mat-icon>mark_email_read</mat-icon>
          Se houver uma conta com esse e-mail, enviamos um link de redefinição.
          Verifique sua caixa de entrada e a pasta de spam.
        </div>
      } @else {
        <mat-form-field appearance="outline" class="email-field">
          <mat-label>E-mail</mat-label>
          <input
            matInput
            type="email"
            [ngModel]="email()"
            (ngModelChange)="email.set($event)"
            autocomplete="email"
            cdkFocusInitial
          />
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (sent()) {
        <button mat-flat-button color="primary" (click)="ref.close()">
          Fechar
        </button>
      } @else {
        <button mat-button (click)="ref.close()" [disabled]="loading()">
          Cancelar
        </button>
        <button
          mat-flat-button
          color="primary"
          (click)="submit()"
          [disabled]="!canSubmit() || loading()"
        >
          @if (loading()) {
            <mat-spinner diameter="18" />
          } @else {
            Enviar link
          }
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    h2 { display: flex; align-items: center; gap: 10px; }
    h2 mat-icon { color: var(--clr-blue); }
    p { color: var(--txt-secondary); line-height: 1.5; margin: 0 0 16px; }
    .email-field { width: 100%; }
    .info-msg {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      background: color-mix(in srgb, var(--clr-green) 12%, transparent);
      border-radius: 8px;
      border-left: 3px solid var(--clr-green);
      color: var(--txt-primary);
      font-size: 13px;
      line-height: 1.45;
    }
    .info-msg mat-icon { color: var(--clr-green); flex-shrink: 0; }
  `],
})
export class ForgotPasswordDialogComponent {
  protected readonly ref = inject<MatDialogRef<ForgotPasswordDialogComponent>>(MatDialogRef);
  private readonly initialEmail = inject<string | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly auth = inject(AuthService);

  protected readonly email = signal(this.initialEmail ?? '');
  protected readonly loading = signal(false);
  protected readonly sent = signal(false);

  protected canSubmit(): boolean {
    const value = this.email().trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.loading.set(true);
    try {
      await this.auth.sendPasswordReset(this.email().trim());
    } catch {
      // Ignora erros propositalmente — mostramos a mesma mensagem
      // em sucesso/erro para evitar enumeração de contas.
    } finally {
      this.loading.set(false);
      this.sent.set(true);
    }
  }
}
