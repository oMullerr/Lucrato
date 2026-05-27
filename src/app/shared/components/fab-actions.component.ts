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
      class="fab"
      [matMenuTriggerFor]="quickMenu"
      aria-label="Ações rápidas"
    >
      <mat-icon>add</mat-icon>
    </button>
    <mat-menu #quickMenu="matMenu" xPosition="before" yPosition="above" class="fab-menu">
      <button mat-menu-item (click)="quick.openNewSale()">
        <mat-icon class="menu-icon success">sell</mat-icon>
        <span>Nova venda</span>
      </button>
      <button mat-menu-item (click)="quick.openNewPurchase()">
        <mat-icon class="menu-icon brand">shopping_cart</mat-icon>
        <span>Nova compra</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    .fab {
      position: fixed;
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      right: calc(20px + env(safe-area-inset-right, 0px));
      z-index: 100;
      background: var(--brand-primary);
      color: #FFFFFF;
      box-shadow: var(--shadow-glow-brand);
      transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
    }

    .fab:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-xl), var(--shadow-glow-brand);
    }

    :host ::ng-deep .fab-menu {
      .menu-icon.success { color: var(--color-success); }
      .menu-icon.brand   { color: var(--brand-primary); }
    }
  `]
})
export class FabActionsComponent {
  protected readonly quick = inject(QuickActionsService);
}
