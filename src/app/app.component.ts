import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ThemeService } from './core/services/theme.service';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';

interface NavGroup {
  label: string;
  items: NavItem[];
}
interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'PRINCIPAL',
    items: [
      { path: '/inventory',  label: 'Estoque',   icon: 'inventory_2' },
      { path: '/dashboard',  label: 'Dashboard', icon: 'analytics' },
      { path: '/analytics',  label: 'Análises',  icon: 'insights' },
    ],
  },
  {
    label: 'REGISTROS',
    items: [
      { path: '/purchases', label: 'Compras', icon: 'shopping_cart' },
      { path: '/sales',     label: 'Vendas',  icon: 'sell' },
    ],
  },
  {
    label: 'SISTEMA',
    items: [
      { path: '/settings',     label: 'Configurações', icon: 'settings' },
      { path: '/instructions', label: 'Instruções',    icon: 'help_outline' },
    ],
  },
];

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule, MatDividerModule, MatTooltipModule, MatMenuModule,
  ],
  template: `
    <mat-sidenav-container class="app-shell">
      <mat-sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="auth.isLoggedIn() && sidebarOpen()"
        (openedChange)="onSidenavChange($event)"
        class="sidebar"
      >
        <div class="brand">
          <div class="logo">
            <img src="favicon.svg" alt="Lucrato" width="26" height="26" />
          </div>
          <div class="brand-text">
            <strong>Lucrato</strong>
            <small>Sistema v1.0</small>
          </div>
        </div>

        <mat-divider />

        <nav class="nav">
          @for (group of navGroups; track group.label) {
            <div class="nav-group">
              <div class="nav-label">{{ group.label }}</div>
              @for (item of group.items; track item.path) {
                <a
                  [routerLink]="item.path"
                  routerLinkActive="active"
                  class="nav-item"
                  [matTooltip]="item.label"
                  matTooltipPosition="right"
                  (click)="closeSidebarOnMobile()"
                >
                  <mat-icon>{{ item.icon }}</mat-icon>
                  <span>{{ item.label }}</span>
                </a>
              }
            </div>
          }
        </nav>

        <div class="sidebar-footer">
          @if (data.loaded()) {
            <div class="status">
              <span class="dot"></span>
              {{ data.purchases().length }} lotes · {{ data.sales().length }} vendas
            </div>
          }
        </div>
      </mat-sidenav>

      <mat-sidenav-content>
        @if (auth.isLoggedIn()) {
          <mat-toolbar class="topbar">
            @if (isMobile()) {
              <button mat-icon-button class="hamburger-btn" (click)="toggleSidebar()" aria-label="Abrir menu de navegação">
                <mat-icon>menu</mat-icon>
              </button>
            }
            <span class="topbar-spacer"></span>
            <button
              mat-icon-button
              (click)="theme.toggle()"
              [matTooltip]="theme.isDark() ? 'Modo claro' : 'Modo escuro'"
              aria-label="Alternar tema"
            >
              <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
            </button>
            <button mat-button [matMenuTriggerFor]="userMenu" class="user-btn">
              <mat-icon>account_circle</mat-icon>
              <span class="user-name">{{ auth.storeName() }}</span>
            </button>
            <mat-menu #userMenu="matMenu">
              <button mat-menu-item (click)="logout()">
                <mat-icon>logout</mat-icon>
                <span>Sair</span>
              </button>
            </mat-menu>
          </mat-toolbar>
        }

        <div class="page-container" [class.full-height]="!auth.isLoggedIn()">
          <router-outlet />
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
    }

    .app-shell {
      height: 100vh;
      background: var(--bg-base);
    }

    .sidebar {
      width: 250px;
      background: var(--bg-sidebar) !important;
      border-right: none !important;
      display: flex;
      flex-direction: column;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px;
    }

    .logo {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #6366F1, #8B5CF6);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.45);
      flex-shrink: 0;
    }

    .brand-text strong {
      display: block;
      font-size: 15px;
      color: #FFFFFF;
      letter-spacing: -0.3px;
    }

    .brand-text small {
      display: block;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.35);
      margin-top: 2px;
      letter-spacing: 0.5px;
    }

    .nav {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
    }

    .nav-group {
      margin: 12px 0 16px;
    }

    .nav-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.2px;
      color: rgba(255, 255, 255, 0.25);
      padding: 0 12px 6px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-radius: 8px;
      color: var(--txt-sidebar);
      font-size: 13.5px;
      font-weight: 500;
      transition: all 0.15s ease;
      margin-bottom: 2px;
      cursor: pointer;
      text-decoration: none;
      border-left: 2px solid transparent;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.07);
      color: #FFFFFF;
      border-left-color: rgba(255, 255, 255, 0.2);
    }

    .nav-item.active {
      background: rgba(99, 102, 241, 0.18);
      color: #FFFFFF;
      font-weight: 600;
      border-left-color: #818CF8;
    }

    .nav-item mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .sidebar-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--brd-sidebar);
    }

    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.35);
    }

    .dot {
      width: 8px;
      height: 8px;
      background: var(--clr-green);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--clr-green);
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      50% { opacity: 0.5; }
    }

    .topbar {
      background: var(--bg-surface) !important;
      border-bottom: 1px solid var(--brd-default);
      box-shadow: 0 1px 0 color-mix(in srgb, var(--clr-blue) 8%, transparent);
      height: 56px;
      min-height: 56px;
      padding: 0 16px;
    }

    .topbar-spacer { flex: 1; }

    .user-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--txt-primary);
      font-size: 13px;
      font-weight: 500;
      height: 36px;
      padding: 0 10px;
      border-radius: 8px;
    }

    .user-btn mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: var(--txt-secondary);
    }

    .user-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .page-container {
      height: calc(100vh - 56px);
      overflow-y: auto;
    }

    .page-container.full-height {
      height: 100vh;
    }

    .hamburger-btn {
      color: var(--txt-primary);
      margin-right: 8px;
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .sidebar {
        width: 260px;
        box-shadow: var(--shadow-lg);
      }
    }
  `]
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  protected readonly navGroups = NAV_GROUPS;
  private readonly router = inject(Router);

  private readonly bp = inject(BreakpointObserver);

  protected readonly isMobile = toSignal(
    this.bp.observe('(max-width: 768px)').pipe(map(r => r.matches)),
    { initialValue: globalThis.window ? globalThis.window.innerWidth <= 768 : false }
  );

  protected readonly sidebarOpen = signal(
    globalThis.window ? globalThis.window.innerWidth > 768 : true
  );

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user === null) {
        this.router.navigate(['/login']);
      } else if (user !== undefined && this.router.url.startsWith('/login')) {
        this.router.navigate(['/inventory']);
      }
    });
  }

  protected toggleSidebar(): void { this.sidebarOpen.update(v => !v); }

  protected closeSidebarOnMobile(): void {
    if (this.isMobile()) this.sidebarOpen.set(false);
  }

  protected onSidenavChange(opened: boolean): void {
    if (this.auth.isLoggedIn()) this.sidebarOpen.set(opened);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
  }
}
