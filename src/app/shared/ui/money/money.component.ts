import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { BrlPipe } from '../../pipes/brl.pipe';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icons';

export type MoneyTone = 'auto' | 'profit' | 'loss' | 'neutral';
export type MoneyVariant = 'text' | 'chip' | 'hero';

/** Resolve o tom efetivo: 'auto' decide pelo sinal do valor. */
export function resolveMoneyTone(value: number | null, tone: MoneyTone): Exclude<MoneyTone, 'auto'> {
  if (tone !== 'auto') return tone;
  if (value === null || value === 0) return 'neutral';
  return value > 0 ? 'profit' : 'loss';
}

/**
 * "O Número" — o elemento-assinatura do Lucrato. Todo valor de lucro/margem
 * aparece com este tratamento, reconhecível em qualquer página:
 *
 * - variant="hero": número gigante em Archivo expandida com hairline champanhe
 *   (o herói do dashboard) e count-up respeitando prefers-reduced-motion.
 * - variant="chip": pílula tabular com tick direcional (▲ lucro / ▼ prejuízo).
 * - variant="text": valor tabular colorido pelo tom (colunas de tabela).
 *
 * Regra anti-clichê: no hero o NÚMERO fica em quase-branco/preto; o tom vem
 * do chip de delta ao lado, nunca tingindo o número inteiro.
 */
@Component({
  selector: 'app-money',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrlPipe, IconComponent],
  templateUrl: './money.component.html',
  styleUrl: './money.component.scss',
})
export class MoneyComponent {
  readonly value = input.required<number | null>();
  readonly tone = input<MoneyTone>('auto');
  readonly variant = input<MoneyVariant>('text');
  readonly showSign = input(false);
  /** Variação percentual (fração: 0.12 = +12%) exibida como delta ao lado. */
  readonly deltaPct = input<number | null>(null);

  protected readonly resolvedTone = computed(() => resolveMoneyTone(this.value(), this.tone()));

  protected readonly signPrefix = computed(() => {
    const v = this.value();
    if (!this.showSign() || v === null || v <= 0) return '';
    return '+';
  });

  protected readonly tickIcon = computed<IconName>(() => {
    const t = this.resolvedTone();
    return t === 'profit' ? 'trending-up' : t === 'loss' ? 'trending-down' : 'minus';
  });

  protected readonly deltaDir = computed<'up' | 'down' | 'flat'>(() => {
    const d = this.deltaPct();
    if (d === null || d === 0) return 'flat';
    return d > 0 ? 'up' : 'down';
  });

  protected readonly deltaText = computed(() => {
    const d = this.deltaPct();
    if (d === null) return '';
    return `${Math.abs(d * 100).toFixed(1)}%`;
  });

  /* ---- Count-up do hero (respeita prefers-reduced-motion) ---- */
  private readonly animatedValue = signal<number | null>(null);
  private rafId = 0;

  protected readonly displayValue = computed(() =>
    this.variant() === 'hero' ? this.animatedValue() : this.value(),
  );

  constructor() {
    effect((onCleanup) => {
      const target = this.value();
      if (this.variant() !== 'hero' || target === null || this.prefersReducedMotion()) {
        this.animatedValue.set(target);
        return;
      }
      const from = untracked(this.animatedValue) ?? 0;
      if (from === target) return;
      const start = performance.now();
      const duration = 600;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
        this.animatedValue.set(from + (target - from) * eased);
        if (t < 1) this.rafId = requestAnimationFrame(step);
        else this.animatedValue.set(target);
      };
      this.rafId = requestAnimationFrame(step);
      onCleanup(() => cancelAnimationFrame(this.rafId));
    }, { allowSignalWrites: true });
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
}
