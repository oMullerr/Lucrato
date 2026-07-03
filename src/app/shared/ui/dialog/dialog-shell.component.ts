import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { APP_DIALOG_DISABLE_CLOSE } from './dialog.service';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icons';
import { ButtonComponent } from '../button/button.component';

/**
 * Moldura visual dos dialogs: header fixo (título + fechar), corpo rolável e
 * rodapé de ações. Full-screen abaixo de sm (CSS em _components.scss).
 *
 *   <app-dialog-shell [dialogTitle]="…" icon="tag" [busy]="saving()">
 *     …corpo…
 *     <ng-container dialogActions>
 *       <button appBtn="outline" (click)="cancel()">…</button>
 *       <button appBtn [loading]="saving()" (click)="save()">…</button>
 *     </ng-container>
 *   </app-dialog-shell>
 *
 * `busy` bloqueia TODAS as vias de fechamento (X, ESC, backdrop) — mata o
 * duplo-submit e o fechamento no meio de uma gravação.
 */
@Component({
  selector: 'app-dialog-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ButtonComponent, TranslateModule],
  templateUrl: './dialog-shell.component.html',
  styleUrl: './dialog-shell.component.scss',
  host: {
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class DialogShellComponent {
  private readonly ref = inject(DialogRef, { optional: true });
  private readonly disableClose = inject(APP_DIALOG_DISABLE_CLOSE, { optional: true }) ?? false;

  readonly dialogTitle = input.required<string>();
  readonly icon = input<IconName | ''>('');
  /** Tom do chip do ícone do header. */
  readonly tone = input<'brand' | 'danger'>('brand');
  readonly busy = input(false);

  constructor() {
    /* Backdrop fecha (paridade com o comportamento Material anterior),
       exceto quando ocupado ou explicitamente travado. */
    this.ref?.backdropClick.subscribe(() => this.requestClose());
  }

  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.requestClose();
  }

  protected requestClose(): void {
    if (this.busy() || this.disableClose) return;
    this.ref?.close();
  }
}
