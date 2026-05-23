import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { QuickActionsService } from '../../core/services/quick-actions.service';

@Component({
  selector: 'app-fab-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <button
      mat-fab
      color="primary"
      class="fab"
      [matMenuTriggerFor]="quickMenu"
      aria-label="Ações rápidas"
      matTooltipPosition="left"
    >
      <mat-icon>add</mat-icon>
    </button>
    <mat-menu #quickMenu="matMenu" xPosition="before" yPosition="above">
      <button mat-menu-item (click)="quick.openNewSale()">
        <mat-icon>sell</mat-icon>
        <span>Nova venda</span>
      </button>
      <button mat-menu-item (click)="quick.openNewPurchase()">
        <mat-icon>shopping_cart</mat-icon>
        <span>Nova compra</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    .fab {
      position: fixed;
      bottom: calc(20px + env(safe-area-inset-bottom));
      right: calc(20px + env(safe-area-inset-right));
      z-index: 100;
      box-shadow: var(--shadow-lg);
    }
  `]
})
export class FabActionsComponent {
  protected readonly quick = inject(QuickActionsService);
}
