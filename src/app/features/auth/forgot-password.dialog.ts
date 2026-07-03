import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { DialogShellComponent } from '../../shared/ui/dialog/dialog-shell.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';

@Component({
  selector: 'app-forgot-password-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, A11yModule, TranslateModule,
    DialogShellComponent, ButtonComponent, IconComponent,
    FieldComponent, InputDirective,
  ],
  templateUrl: './forgot-password.dialog.html',
  styleUrl: './forgot-password.dialog.scss',
})
export class ForgotPasswordDialogComponent {
  protected readonly ref = inject<DialogRef<void>>(DialogRef);
  private readonly initialEmail = inject<string | null>(DIALOG_DATA, { optional: true });
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
