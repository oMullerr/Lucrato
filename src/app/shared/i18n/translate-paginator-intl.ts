import { inject, Injectable, OnDestroy } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

/**
 * MatPaginatorIntl that pulls its labels from ngx-translate and updates
 * reactively when the active language changes.
 */
@Injectable()
export class TranslatePaginatorIntl extends MatPaginatorIntl implements OnDestroy {
  private readonly translate = inject(TranslateService);
  private readonly sub: Subscription;

  constructor() {
    super();
    this.sub = this.translate.onLangChange.subscribe(() => this.applyLabels());
    this.applyLabels();
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return this.translate.instant('paginator.range', { start: 0, end: 0, total: length });
    }
    const safeLength = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex = startIndex < safeLength
      ? Math.min(startIndex + pageSize, safeLength)
      : startIndex + pageSize;
    return this.translate.instant('paginator.range', {
      start: startIndex + 1,
      end: endIndex,
      total: safeLength,
    });
  };

  private applyLabels(): void {
    this.itemsPerPageLabel = this.translate.instant('paginator.itemsPerPage');
    this.nextPageLabel = this.translate.instant('paginator.nextPage');
    this.previousPageLabel = this.translate.instant('paginator.previousPage');
    this.firstPageLabel = this.translate.instant('paginator.firstPage');
    this.lastPageLabel = this.translate.instant('paginator.lastPage');
    this.changes.next();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
