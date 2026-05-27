import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
import { filter, map } from 'rxjs';
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
  title?: string;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'PRINCIPAL',
    items: [
      { path: '/inventory',  label: 'Estoque',   icon: 'inventory_2', title: 'Panorama' },
      { path: '/dashboard',  label: 'Dashboard', icon: 'analytics',   title: 'Dashboard' },
      { path: '/analytics',  label: 'Análises',  icon: 'insights',    title: 'Análises' },
    ],
  },
  {
    label: 'REGISTROS',
    items: [
      { path: '/purchases', label: 'Compras', icon: 'shopping_cart', title: 'Compras' },
      { path: '/sales',     label: 'Vendas',  icon: 'sell',          title: 'Vendas' },
    ],
  },
  {
    label: 'SISTEMA',
    items: [
      { path: '/settings',     label: 'Configurações', icon: 'tune',         title: 'Configurações' },
      { path: '/instructions', label: 'Instruções',    icon: 'menu_book',    title: 'Instruções' },
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
        <a class="brand" routerLink="/inventory" aria-label="Lucrato">
          @if (isCompactSidebar()) {
            <span class="brand-mark">L</span>
          } @else {
            <span class="wordmark">
              <span class="wm-l">L</span><span class="wm-u">u</span><span>crato</span>
              <svg class="wm-arrow" viewBox="0 0 12 8" aria-hidden="true">
                <path d="M1 7 L6 1 L11 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="wm-tag">Gestão Mercado Livre</span>
          }
        </a>

        <nav class="nav" aria-label="Navegação principal">
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
                  <span class="active-dot" aria-hidden="true"></span>
                  <mat-icon>{{ item.icon }}</mat-icon>
                  <span class="nav-text">{{ item.label }}</span>
                </a>
              }
            </div>
          }
        </nav>

        <div class="sidebar-footer">
          @if (data.loaded()) {
            <div class="status" [matTooltip]="isCompactSidebar() ? statusLabel() : ''" matTooltipPosition="right">
              <span class="status-dot success"></span>
              <span class="status-text">{{ statusLabel() }}</span>
            </div>
          }
        </div>
      </mat-sidenav>

      <mat-sidenav-content>
        @if (auth.isLoggedIn()) {
          <mat-toolbar class="topbar">
            @if (isMobile()) {
              <button mat-icon-button class="hamburger-btn" (click)="toggleSidebar()" aria-label="Abrir menu">
                <mat-icon>menu</mat-icon>
              </button>
            }

            <div class="breadcrumb" aria-label="Localização">
              <span class="bc-root">Lucrato</span>
              <span class="bc-sep">/</span>
              <span class="bc-current">{{ currentPageTitle() }}</span>
            </div>

            <span class="topbar-spacer"></span>

            <button
              mat-icon-button
              class="topbar-btn"
              (click)="theme.toggle()"
              [matTooltip]="theme.isDark() ? 'Modo claro' : 'Modo escuro'"
              aria-label="Alternar tema"
            >
              <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
            </button>

            <button mat-button [matMenuTriggerFor]="userMenu" class="user-btn">
              <span class="user-btn-inner">
                <span class="avatar" aria-hidden="true">{{ avatarInitials() }}</span>
                <span class="user-name">{{ auth.storeName() }}</span>
                <mat-icon class="chevron">expand_more</mat-icon>
              </span>
            </button>
            <mat-menu #userMenu="matMenu" xPosition="before">
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
      background: var(--bg-canvas);
    }

    /* =================================================================
       SIDEBAR
       ================================================================= */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-sidebar);
      display: flex;
      flex-direction: column;
    }

    /* ----------- Brand / wordmark ----------- */
    .brand {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 22px 22px 16px;
      text-decoration: none;
      color: #FFFFFF;
      border-bottom: 1px solid var(--border-sidebar);
    }

    .wordmark {
      font-family: 'Geist', sans-serif;
      font-weight: 600;
      font-size: 22px;
      letter-spacing: -0.04em;
      color: #FFFFFF;
      display: inline-flex;
      align-items: baseline;
      gap: 1px;
    }

    .wordmark .wm-l { color: var(--brand-primary-3); }

    .wordmark .wm-u {
      position: relative;
      display: inline-block;
    }

    .wordmark .wm-arrow {
      width: 10px;
      height: 6px;
      margin-left: 1px;
      color: var(--brand-accent);
      transform: translateY(-2px);
    }

    .wm-tag {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-sidebar-muted);
    }

    .brand-mark {
      font-family: 'Geist', sans-serif;
      font-weight: 700;
      font-size: 24px;
      color: var(--brand-primary-3);
      letter-spacing: -0.04em;
      text-align: center;
      width: 100%;
    }

    /* ----------- Nav ----------- */
    .nav {
      flex: 1;
      overflow-y: auto;
      padding: 14px 12px;
    }

    .nav-group {
      margin: 0 0 18px;

      &:last-child { margin-bottom: 0; }
    }

    .nav-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--text-sidebar-muted);
      padding: 4px 12px 8px;
    }

    .nav-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-radius: var(--radius-md);
      color: var(--text-sidebar);
      font-size: 13.5px;
      font-weight: 500;
      transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
      margin-bottom: 2px;
      text-decoration: none;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        opacity: 0.85;
      }

      .nav-text { flex: 1; }

      .active-dot {
        position: absolute;
        left: -6px;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: 4px;
        border-radius: var(--radius-full);
        background: transparent;
        transition: background var(--dur-fast) var(--ease-out), height var(--dur-fast) var(--ease-out);
      }
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #FFFFFF;

      mat-icon { opacity: 1; }
    }

    .nav-item.active {
      background: var(--bg-sidebar-2);
      color: #FFFFFF;
      font-weight: 500;

      mat-icon { opacity: 1; color: var(--brand-primary-3); }

      .active-dot {
        background: var(--brand-accent);
        height: 16px;
      }
    }

    /* ----------- Footer ----------- */
    .sidebar-footer {
      padding: 14px 16px 18px;
      border-top: 1px solid var(--border-sidebar);
    }

    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--text-sidebar-muted);
      letter-spacing: 0.02em;
    }

    .status-text {
      font-variant-numeric: tabular-nums;
    }

    /* =================================================================
       TOPBAR
       ================================================================= */
    .topbar {
      background: var(--bg-canvas);
      border-bottom: 1px solid var(--border-subtle);
      height: var(--topbar-height);
      min-height: var(--topbar-height);
      padding: 0 24px;
      gap: 6px;
    }

    .topbar-spacer { flex: 1; }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);

      .bc-root {
        color: var(--text-muted);
        font-weight: 500;
      }

      .bc-sep {
        color: var(--text-muted);
        opacity: 0.6;
      }

      .bc-current {
        color: var(--text-primary);
        font-weight: 600;
      }
    }

    .topbar-btn {
      color: var(--text-secondary);
      transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);

      &:hover { color: var(--text-primary); }

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .user-btn {
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 500;
      height: 38px;
      padding: 0 10px 0 4px;
      border-radius: var(--radius-md);
    }

    .user-btn-inner {
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      line-height: 1;

      .avatar {
        width: 28px;
        height: 28px;
        border-radius: var(--radius-full);
        background: var(--brand-primary);
        color: #FFFFFF;
        font-size: 11px;
        font-weight: 600;
        font-family: 'Geist', sans-serif;
        letter-spacing: 0.02em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .chevron {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--text-muted);
        flex-shrink: 0;
      }
    }

    .user-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* =================================================================
       CONTENT
       ================================================================= */
    .page-container {
      height: calc(100vh - var(--topbar-height));
      overflow-y: auto;
      background: var(--bg-canvas);
    }

    .page-container.full-height {
      height: 100vh;
    }

    .hamburger-btn {
      color: var(--text-primary);
      margin-right: 8px;
      flex-shrink: 0;
    }

    /* =================================================================
       RESPONSIVE
       ================================================================= */
    @media (max-width: 768px) {
      .sidebar {
        width: 270px;
        box-shadow: var(--shadow-xl);
      }
      .topbar { padding: 0 16px; }
      .breadcrumb .bc-root { display: none; }
      .breadcrumb .bc-sep { display: none; }
    }

    @media (max-width: 480px) {
      .topbar { padding: 0 12px; gap: 4px; }
      .user-name { display: none; }
      .user-btn { padding: 0 4px; min-width: 0; }
    }

    /* =================================================================
       RAIL (compact sidebar 769–1024px)
       ================================================================= */
    .sidebar.rail {
      width: var(--sidebar-rail);

      .brand {
        padding: 18px 8px 14px;
        align-items: center;
      }

      .nav { padding: 14px 8px; }

      .nav-label { display: none; }

      .nav-item {
        justify-content: center;
        padding: 10px;
        gap: 0;

        .nav-text { display: none; }

        .active-dot { display: none; }

        &.active {
          background: var(--bg-sidebar-2);
        }
      }

      .sidebar-footer {
        padding: 12px 8px;
      }

      .status-text { display: none; }

      .status { justify-content: center; }
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

  /** Title of the current page, derived from the active route. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(e => (e as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  protected readonly currentPageTitle = computed(() => {
    const url = this.currentUrl() ?? '/';
    for (const group of NAV_GROUPS) {
      const found = group.items.find(it => url.startsWith(it.path));
      if (found) return found.title ?? found.label;
    }
    if (url.startsWith('/profile')) return 'Perfil';
    return '';
  });

  protected readonly statusLabel = computed(() => {
    const p = this.data.purchases().length;
    const s = this.data.sales().length;
    return `${p} ${p === 1 ? 'lote' : 'lotes'} · ${s} ${s === 1 ? 'venda' : 'vendas'}`;
  });

  protected readonly avatarInitials = computed(() => {
    const name = (this.auth.storeName() ?? '').trim();
    if (!name) return 'L';
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

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
