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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ThemeService } from './core/services/theme.service';
import { LanguageService } from './core/services/language.service';
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

/** Labels/titles are i18n keys resolved with the `translate` pipe in the template. */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'nav.groupMain',
    items: [
      { path: '/inventory',  label: 'nav.inventory', icon: 'inventory_2',    title: 'nav.inventoryTitle' },
      { path: '/dashboard',  label: 'nav.dashboard', icon: 'analytics',      title: 'nav.dashboard' },
      { path: '/analytics',  label: 'nav.analytics', icon: 'insights',       title: 'nav.analytics' },
      { path: '/fiscal',     label: 'nav.fiscal',    icon: 'account_balance', title: 'nav.fiscal' },
    ],
  },
  {
    label: 'nav.groupRecords',
    items: [
      { path: '/purchases', label: 'nav.purchases', icon: 'shopping_cart', title: 'nav.purchases' },
      { path: '/sales',     label: 'nav.sales',     icon: 'sell',          title: 'nav.sales' },
    ],
  },
  {
    label: 'nav.groupSystem',
    items: [
      { path: '/settings',     label: 'nav.settings',     icon: 'tune',      title: 'nav.settings' },
      { path: '/instructions', label: 'nav.instructions', icon: 'menu_book', title: 'nav.instructions' },
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
    TranslateModule,
    FabActionsComponent,
    ConnectionBannerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly lang = inject(LanguageService);
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  protected readonly quick = inject(QuickActionsService);
  protected readonly navGroups = NAV_GROUPS;
  private readonly router = inject(Router);
  private readonly bp = inject(BreakpointObserver);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

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

  /** Returns an i18n key; the template resolves it with the `translate` pipe. */
  protected readonly currentPageTitle = computed(() => {
    const url = this.currentUrl() ?? '/';
    for (const group of NAV_GROUPS) {
      const found = group.items.find(it => url.startsWith(it.path));
      if (found) return found.title ?? found.label;
    }
    if (url.startsWith('/profile')) return 'nav.profile';
    return '';
  });

  protected readonly statusLabel = computed(() => {
    this.lang.lang(); // re-evaluate when the language changes
    const p = this.data.purchases().length;
    const s = this.data.sales().length;
    const pl = this.t.instant(p === 1 ? 'topbar.batchOne' : 'topbar.batchOther');
    const sl = this.t.instant(s === 1 ? 'topbar.saleOne' : 'topbar.saleOther');
    return this.t.instant('topbar.status', { p, pl, s, sl });
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
            this.t.instant('errors.newVersion'),
            this.t.instant('errors.reload'),
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
