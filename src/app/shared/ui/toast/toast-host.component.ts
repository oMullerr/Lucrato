import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Toast, ToastService } from './toast.service';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icons';

const KIND_ICON: Record<Toast['kind'], IconName> = {
  success: 'circle-check',
  error: 'circle-alert',
  warning: 'triangle-alert',
  info: 'info',
};

/**
 * Pilha de toasts — renderizar UMA vez no shell (app.component).
 * Topo-direita no desktop; base central no mobile (perto do polegar).
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TranslateModule],
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);

  protected icon(kind: Toast['kind']): IconName {
    return KIND_ICON[kind];
  }
}
