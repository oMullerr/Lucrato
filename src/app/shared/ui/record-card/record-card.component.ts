import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MoneyComponent, MoneyTone } from '../money/money.component';

/** Um valor exibido no rodapé do card (dinheiro via app-money ou texto puro). */
export interface RecordCardFigure {
  label: string;
  /** Valor monetário (renderizado com app-money). */
  value?: number | null;
  tone?: MoneyTone;
  /** Alternativa em texto puro (ex.: "3 un"). Ignorado se `value` presente. */
  text?: string;
}

/**
 * Substituto mobile da linha de tabela (fase 4, decisão D7): o card inteiro é
 * um botão que abre o mesmo detalhe que a linha abria no desktop.
 *
 *   <app-record-card [title]="c.product" [code]="c.id"
 *     [status]="('status.' + c.status) | translate" [statusKind]="statusKind(c)"
 *     [meta]="c.purchaseDate | brDate" [figures]="figuresFor(c)"
 *     (pressed)="openDetail(c)" />
 */
@Component({
  selector: 'app-record-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyComponent],
  templateUrl: './record-card.component.html',
  styleUrl: './record-card.component.scss',
})
export class RecordCardComponent {
  readonly title = input.required<string>();
  readonly code = input('');
  /** Rótulo de status (já traduzido) + tom do dot. */
  readonly status = input('');
  readonly statusKind = input('neutral');
  /** Linha secundária (data, categoria…). */
  readonly meta = input('');
  readonly figures = input<RecordCardFigure[]>([]);

  readonly pressed = output<void>();
}
