import { ChangeDetectionStrategy, Component, HostListener, effect, inject, signal } from '@angular/core';
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
import { QuickActionsService } from './core/services/quick-actions.service';
import { FabActionsComponent } from './shared/components/fab-actions.component';

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
    FabActionsComponent,
  ],
  template: `
    <mat-sidenav-container class="app-shell">
      <mat-sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="auth.isLoggedIn() && sidebarOpen()"
        (openedChange)="onSidenavChange($event)"
        class="sidebar"
        [class.rail]="isCompactSidebar()"
      >
        <div class="brand">
          <div class="brand-logo">L</div>
          <div class="brand-text">
            <strong>Lucrato</strong>
            <small>Gestão Mercado Livre</small>
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
                  [matTooltip]="isCompactSidebar() ? item.label : ''"
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
              <span class="status-text">{{ data.purchases().length }} lotes · {{ data.sales().length }} vendas</span>
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

            @if (!isMobile()) {
              <button
                mat-flat-button
                color="primary"
                class="register-btn"
                [matMenuTriggerFor]="registerMenu"
                matTooltip="Atalho: N (venda) · Shift+N (compra)"
              >
                <mat-icon>add</mat-icon>
                <span>Registrar</span>
                <mat-icon class="chevron">expand_more</mat-icon>
              </button>
              <mat-menu #registerMenu="matMenu" xPosition="before">
                <button mat-menu-item (click)="quick.openNewSale()">
                  <mat-icon>sell</mat-icon>
                  <span>Nova venda</span>
                  <span class="shortcut">N</span>
                </button>
                <button mat-menu-item (click)="quick.openNewPurchase()">
                  <mat-icon>shopping_cart</mat-icon>
                  <span>Nova compra</span>
                  <span class="shortcut">⇧ N</span>
                </button>
              </mat-menu>
            }

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
              <mat-icon class="chevron">expand_more</mat-icon>
            </button>
            <mat-menu #userMenu="matMenu">
              <button mat-menu-item routerLink="/profile">
                <mat-icon>person</mat-icon>
                <span>Perfil</span>
              </button>
              <mat-divider />
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

        @if (auth.isLoggedIn() && isMobile()) {
          <app-fab-actions />
        }
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
      background: var(--bg-sidebar);
      border-right: none;
      display: flex;
      flex-direction: column;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px;
    }

    .brand-logo {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #1E40AF, #3B82F6);
      color: #FFFFFF;
      display: grid;
      place-items: center;
      border-radius: 10px;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.5px;
      box-shadow: 0 4px 12px rgba(30, 64, 175, 0.4);
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
      font-size: 10.5px;
      color: rgba(255, 255, 255, 0.45);
      margin-top: 2px;
      letter-spacing: 0.3px;
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
      color: rgba(255, 255, 255, 0.32);
      padding: 0 12px 6px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-radius: 9px;
      color: var(--txt-sidebar);
      font-size: 13.5px;
      font-weight: 500;
      transition: background 0.15s ease, color 0.15s ease;
      margin-bottom: 2px;
      cursor: pointer;
      text-decoration: none;
      border-left: 2px solid transparent;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #FFFFFF;
    }

    .nav-item.active {
      background: color-mix(in srgb, #3B82F6 20%, transparent);
      color: #FFFFFF;
      font-weight: 600;
      border-left-color: #60A5FA;
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
      color: rgba(255, 255, 255, 0.42);
    }

    .status-text {
      font-variant-numeric: tabular-nums;
    }

    .dot {
      width: 7px;
      height: 7px;
      background: #10B981;
      border-radius: 50%;
      box-shadow: 0 0 8px #10B981;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      50% { opacity: 0.45; }
    }

    .topbar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--brd-default);
      height: 56px;
      min-height: 56px;
      padding: 0 16px;
      gap: 6px;
    }

    .topbar-spacer { flex: 1; }

    .register-btn {
      font-weight: 600;
      letter-spacing: 0.1px;
      border-radius: 10px;
      padding: 0 14px;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .chevron { margin-left: 2px; opacity: 0.85; }
    }

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

    .user-btn mat-icon:not(.chevron) {
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: var(--txt-secondary);
    }

    .user-btn .chevron {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--txt-muted);
    }

    .user-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shortcut {
      margin-left: auto;
      font-size: 10.5px;
      font-weight: 600;
      color: var(--txt-muted);
      background: var(--bg-elevated-2);
      padding: 1px 6px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
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

    @media (max-width: 480px) {
      .topbar { padding: 0 8px; gap: 4px; }
      .user-name { display: none; }
      .user-btn { padding: 0 6px; min-width: 0; }
    }

    .sidebar.rail {
      width: 64px;

      .brand {
        justify-content: center;
        padding: 16px 8px;
      }

      .brand-text { display: none; }

      .nav { padding: 8px 6px; }

      .nav-label { display: none; }

      .nav-item {
        justify-content: center;
        padding: 10px 8px;
        gap: 0;
        border-left: none;

        span { display: none; }

        &.active {
          background: color-mix(in srgb, #3B82F6 22%, transparent);
          border-left-color: transparent;
        }
      }

      .sidebar-footer {
        padding: 12px 8px;
      }

      .status-text { display: none; }

      .status {
        justify-content: center;
      }
    }
  `]
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  protected readonly quick = inject(QuickActionsService);
  protected readonly navGroups = NAV_GROUPS;
  private readonly router = inject(Router);
  private readonly bp = inject(BreakpointObserver);

  protected readonly isMobile = toSignal(
    this.bp.observe('(max-width: 768px)').pipe(map(r => r.matches)),
    { initialValue: globalThis.window ? globalThis.window.innerWidth <= 768 : false }
  );

  protected readonly isCompactSidebar = toSignal(
    this.bp.observe('(min-width: 769px) and (max-width: 1024px)').pipe(map(r => r.matches)),
    {
      initialValue: globalThis.window
        ? globalThis.window.innerWidth >= 769 && globalThis.window.innerWidth <= 1024
        : false,
    }
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

  @HostListener('document:keydown', ['$event'])
  handleShortcut(event: KeyboardEvent): void {
    if (!this.auth.isLoggedIn()) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'n' && event.shiftKey) {
      event.preventDefault();
      this.quick.openNewPurchase();
    } else if (key === 'n' && !event.shiftKey) {
      event.preventDefault();
      this.quick.openNewSale();
    }
  }
}
