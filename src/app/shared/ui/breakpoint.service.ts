import { Injectable, Signal, inject } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/**
 * Fonte única de breakpoints em TS — espelha $bp de src/styles/_breakpoints.scss
 * (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1600 / 3xl 1920).
 * Mudou lá, mude aqui.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly observer = inject(BreakpointObserver);

  private watch(query: string): Signal<boolean> {
    return toSignal(this.observer.observe(query).pipe(map((r) => r.matches)), {
      initialValue: this.observer.isMatched(query),
    });
  }

  /** < md (768): telefone — tabelas viram cards, drawers em full-screen/overlay */
  readonly isMobile = this.watch('(max-width: 767.98px)');

  /** [md, lg): tablet retrato */
  readonly isTabletPortrait = this.watch('(min-width: 768px) and (max-width: 1023.98px)');

  /** [md, 1100]: faixa do sidebar em modo rail (limite herdado do shell atual) */
  readonly isCompactSidebar = this.watch('(min-width: 768px) and (max-width: 1100px)');

  /** ≥ 2xl (1600): desktop largo — drawers de detalhe em side-mode */
  readonly isWide = this.watch('(min-width: 1600px)');

  /** ≥ 3xl (1920): ultrawide — dashboard em 3 colunas */
  readonly isUltra = this.watch('(min-width: 1920px)');
}
