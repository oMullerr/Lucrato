import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { ButtonComponent } from '../ui/button/button.component';
import { IconComponent } from '../ui/icon/icon.component';
import { MenuComponent } from '../ui/menu/menu.component';
import { MenuItemComponent } from '../ui/menu/menu-item.component';
import { MenuTriggerDirective } from '../ui/menu/menu-trigger.directive';

@Component({
  selector: 'app-fab-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, ButtonComponent, IconComponent, MenuComponent, MenuItemComponent, MenuTriggerDirective],
  templateUrl: './fab-actions.component.html',
  styleUrl: './fab-actions.component.scss',
})
export class FabActionsComponent {
  protected readonly quick = inject(QuickActionsService);
}
