import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Painel visual do tooltip (renderizado no CDK Overlay; aria-hidden porque
 *  a descrição acessível vem do AriaDescriber no elemento gatilho). */
@Component({
  selector: 'app-tooltip-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ text() }}`,
  styleUrl: './tooltip-panel.component.scss',
  host: { 'aria-hidden': 'true', role: 'presentation' },
})
export class TooltipPanelComponent {
  readonly text = input('');
}
