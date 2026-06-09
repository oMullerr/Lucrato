import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateModule } from '@ngx-translate/core';
import { QuickActionsService } from '../../core/services/quick-actions.service';

@Component({
  selector: 'app-fab-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule, TranslateModule],
  templateUrl: './fab-actions.component.html',
  styleUrl: './fab-actions.component.scss',
})
export class FabActionsComponent {
  protected readonly quick = inject(QuickActionsService);
}
