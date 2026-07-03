import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  input,
  signal,
} from '@angular/core';
import { NgControl } from '@angular/forms';

let nextFieldId = 0;

/**
 * Campo de formulário: label estática acima, input projetado, hint/erro abaixo.
 *
 *   <app-field [label]="'sales.product' | translate" [error]="productError()">
 *     <app-icon fieldPrefix name="search" [size]="18" />
 *     <input appInput [(ngModel)]="product" />
 *     <button fieldSuffix appBtn="ghost" iconOnly size="sm">…</button>
 *   </app-field>
 *
 * Erro aparece quando: (a) `error` (validação da página) é não-vazio E o
 * controle já foi tocado/alterado, ou (b) o controle tem validador inválido
 * após toque. Isso dá o feedback por campo sem esperar o submit.
 */
@Component({
  selector: 'app-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field.component.html',
  styleUrl: './field.component.scss',
  host: {
    '[class.field--invalid]': 'showError()',
    '[class.field--disabled]': 'isDisabled()',
  },
})
export class FieldComponent {
  readonly label = input('');
  readonly hint = input('');
  /** Mensagem de erro fornecida pela página (validação de domínio). */
  readonly error = input('');
  readonly required = input(false);
  /** Força exibir o erro mesmo sem toque (ex.: após tentativa de submit). */
  readonly showErrorNow = input(false);

  private readonly control = contentChild(NgControl);

  /** id estável para ligar label ↔ input ↔ descrições (aria). */
  readonly fieldId = `app-field-${nextFieldId++}`;

  /* O NgControl não é reativo por signals; este tick + eventos do appInput
     (blur/input) forçam a reavaliação do estado. */
  private readonly stateTick = signal(0);

  bumpState(): void {
    this.stateTick.update((v) => v + 1);
  }

  protected readonly touched = computed(() => {
    this.stateTick();
    return this.control()?.touched ?? false;
  });

  readonly isDisabled = computed(() => {
    this.stateTick();
    return this.control()?.disabled ?? false;
  });

  readonly showError = computed(() => {
    if (this.showErrorNow() && (this.error() || this.controlInvalid())) return true;
    if (!this.touched()) return false;
    return !!this.error() || this.controlInvalid();
  });

  private controlInvalid(): boolean {
    this.stateTick();
    return this.control()?.invalid ?? false;
  }

  protected readonly errorText = computed(() => this.error());
}
