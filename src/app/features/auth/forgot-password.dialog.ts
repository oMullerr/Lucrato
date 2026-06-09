import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './forgot-password.dialog.html',
  styleUrl: './forgot-password.dialog.scss',
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
