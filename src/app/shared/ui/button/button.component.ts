import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SpinnerComponent } from '../spinner/spinner.component';

export type BtnVariant = 'primary' | 'tonal' | 'outline' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'md' | 'lg';

/**
 * Botão do design system. Componente de atributo: o host É o elemento nativo,
 * então semântica, foco e teclado vêm de graça.
 *
 *   <button appBtn>Salvar</button>                    (primary)
 *   <button appBtn="ghost" iconOnly aria-label="…">   (só ícone exige aria-label)
 *   <button appBtn [loading]="saving()">Salvar</button>
 *
 * `loading` desabilita o clique, expõe aria-busy e mantém a largura estável
 * (o conteúdo fica invisível, o spinner centraliza por cima).
 */
@Component({
  selector: 'button[appBtn], a[appBtn]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  host: {
    '[class]': 'hostClasses()',
    '[attr.aria-busy]': "loading() ? 'true' : null",
    '[attr.disabled]': 'isDisabled() ? true : null',
    '[attr.aria-disabled]': "isDisabled() ? 'true' : null",
  },
})
export class ButtonComponent {
  /** Variante visual; string vazia (uso `appBtn` puro) resolve para primary. */
  readonly appBtn = input<BtnVariant | ''>('');
  readonly size = input<BtnSize>('md');
  readonly iconOnly = input(false, { transform: (v: unknown) => v !== false && v !== null && v !== undefined });
  readonly loading = input(false, { transform: (v: boolean | null | undefined) => !!v });
  readonly disabled = input(false, { transform: (v: boolean | null | undefined) => !!v });

  protected readonly variant = computed<BtnVariant>(() => this.appBtn() || 'primary');
  protected readonly isDisabled = computed(() => this.disabled() || this.loading());

  protected readonly hostClasses = computed(() => {
    const cls = ['btn', `btn--${this.variant()}`, `btn--${this.size()}`];
    if (this.iconOnly()) cls.push('btn--icon-only');
    if (this.loading()) cls.push('btn--loading');
    return cls.join(' ');
  });

  protected readonly spinnerSize = computed(() => (this.size() === 'sm' ? 14 : this.size() === 'lg' ? 20 : 16));
}
