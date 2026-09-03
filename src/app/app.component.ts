import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ThemeService } from './core/services/theme.service';
import { LanguageService } from './core/services/language.service';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';
import { QuickActionsService } from './core/services/quick-actions.service';
import { NotifyService } from './core/services/notify.service';
import { MlAutoApplyService } from './core/services/ml-auto-apply.service';
import { FabActionsComponent } from './shared/components/fab-actions.component';
import { ConnectionBannerComponent } from './shared/components/connection-banner.component';
import { isChunkLoadError } from './core/services/firestore-errors';
import { BreakpointService } from './shared/ui/breakpoint.service';
import { DrawerComponent } from './shared/ui/drawer/drawer.component';
import { MenuComponent } from './shared/ui/menu/menu.component';
import { MenuItemComponent } from './shared/ui/menu/menu-item.component';
import { MenuTriggerDirective } from './shared/ui/menu/menu-trigger.directive';
import { TooltipDirective } from './shared/ui/tooltip/tooltip.directive';
import { IconComponent } from './shared/ui/icon/icon.component';
import { ButtonComponent } from './shared/ui/button/button.component';
import { ToastHostComponent } from './shared/ui/toast/toast-host.component';
import { IconName } from './shared/ui/icon/icons';

interface NavGroup {
  label: string;
  items: NavItem[];
}
interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  title?: string;
}

/** Labels/títulos são chaves i18n resolvidas com o pipe `translate` no template. */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'nav.groupMain',
    items: [
      { path: '/inventory',  label: 'nav.inventory', icon: 'package',      title: 'nav.inventoryTitle' },
      { path: '/dashboard',  label: 'nav.dashboard', icon: 'chart-column', title: 'nav.dashboard' },
      { path: '/analytics',  label: 'nav.analytics', icon: 'chart-spline', title: 'nav.analytics' },
      { path: '/fiscal',     label: 'nav.fiscal',    icon: 'landmark',     title: 'nav.fiscal' },
    ],
  },
  {
    label: 'nav.groupRecords',
    items: [
      { path: '/purchases', label: 'nav.purchases', icon: 'shopping-cart', title: 'nav.purchases' },
      { path: '/sales',     label: 'nav.sales',     icon: 'tag',           title: 'nav.sales' },
      { path: '/returns',   label: 'nav.returns',   icon: 'rotate-ccw',    title: 'nav.returns' },
      { path: '/anuncios',  label: 'nav.listings',  icon: 'tags',          title: 'nav.listings' },
      { path: '/caixa-ml',  label: 'nav.mlInbox',   icon: 'download',      title: 'nav.mlInbox' },
    ],
  },
  {
    label: 'nav.groupSystem',
    items: [
      { path: '/integracoes',  label: 'nav.integrations', icon: 'store',              title: 'nav.integrations' },
      { path: '/settings',     label: 'nav.settings',     icon: 'sliders-horizontal', title: 'nav.settings' },
      { path: '/instructions', label: 'nav.instructions', icon: 'book-open',          title: 'nav.instructions' },
    ],
  },
];

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    TranslateModule,
    FabActionsComponent,
    ConnectionBannerComponent,
    DrawerComponent,
    MenuComponent, MenuItemComponent, MenuTriggerDirective,
    TooltipDirective, IconComponent, ButtonComponent,
    ToastHostComponent,
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
  protected readonly bp = inject(BreakpointService);
  protected readonly navGroups = NAV_GROUPS;
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  /* Injetado aqui de proposito: e o que faz o lancamento automatico das
     vendas do Mercado Livre rodar assim que o app abre. */
  private readonly mlAutoApply = inject(MlAutoApplyService);
  private readonly t = inject(TranslateService);

  protected readonly sidebarOpen = signal(true);

  /** Rail compacto: só quando o sidebar está em modo side (não no drawer mobile). */
  protected readonly railMode = computed(() => this.bp.isCompactSidebar() && !this.bp.isMobile());

  /** Título da página atual, derivado da rota ativa. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(e => (e as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** Retorna uma chave i18n; o template resolve com o pipe `translate`. */
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
    this.lang.lang(); // reavalia quando o idioma muda
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

    /* Ao cruzar o breakpoint, volta ao padrão do modo: aberto no desktop,
       fechado no mobile (o hambúrguer abre). */
    effect(() => {
      this.sidebarOpen.set(!this.bp.isMobile());
    }, { allowSignalWrites: true });

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
    if (this.bp.isMobile()) this.sidebarOpen.set(false);
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
    } else if (key === 'd') {
      event.preventDefault();
      this.quick.openNewReturn();
    }
  }
}
