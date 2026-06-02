import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
import { NotifyService } from './core/services/notify.service';
import { FabActionsComponent } from './shared/components/fab-actions.component';
import { ConnectionBannerComponent } from './shared/components/connection-banner.component';
import { isChunkLoadError } from './core/services/firestore-errors';

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
    ConnectionBannerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  protected readonly quick = inject(QuickActionsService);
  protected readonly navGroups = NAV_GROUPS;
  private readonly router = inject(Router);
  private readonly bp = inject(BreakpointObserver);
  private readonly notify = inject(NotifyService);

  protected readonly isMobile = toSignal(
    this.bp.observe('(max-width: 768px)').pipe(map(r => r.matches)),
    { initialValue: globalThis.window ? globalThis.window.innerWidth <= 768 : false }
  );

  protected readonly isCompactSidebar = toSignal(
    this.bp.observe('(min-width: 769px) and (max-width: 1100px)').pipe(map(r => r.matches)),
    {
      initialValue: globalThis.window
        ? globalThis.window.innerWidth >= 769 && globalThis.window.innerWidth <= 1100
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

    this.router.events
      .pipe(filter((e): e is NavigationError => e instanceof NavigationError))
      .subscribe(event => {
        if (isChunkLoadError(event.error)) {
          this.notify.withAction(
            'Nova versão disponível. Recarregue a página.',
            'Recarregar',
            () => globalThis.location?.reload(),
            'warning',
          );
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
