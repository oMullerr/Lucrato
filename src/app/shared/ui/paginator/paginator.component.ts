import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';
import { SelectComponent } from '../select/select.component';
import { OptionComponent } from '../select/option.component';

/** Shape-compatible com o `PageEvent` do Material — call sites não mudam. */
export interface PageChangeEvent {
  pageIndex: number;
  previousPageIndex?: number;
  pageSize: number;
  length: number;
}

/**
 * Paginador do design system. Reusa as chaves i18n `paginator.*` existentes.
 *
 *   <app-paginator [length]="total()" [pageSize]="pageSize()" [pageIndex]="pageIndex()"
 *                  [pageSizeOptions]="[10, 25, 50]" (page)="onPage($event)" />
 */
@Component({
  selector: 'app-paginator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslateModule, ButtonComponent, IconComponent, SelectComponent, OptionComponent],
  templateUrl: './paginator.component.html',
  styleUrl: './paginator.component.scss',
})
export class PaginatorComponent {
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  readonly length = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageIndex = input.required<number>();
  readonly pageSizeOptions = input<number[]>([10, 25, 50]);
  readonly showFirstLast = input(false);

  readonly page = output<PageChangeEvent>();

  protected readonly lastPageIndex = computed(() =>
    Math.max(0, Math.ceil(this.length() / Math.max(1, this.pageSize())) - 1),
  );

  protected readonly rangeLabel = computed(() => {
    this.lang.lang(); // reavalia quando o idioma muda
    const length = Math.max(0, this.length());
    const size = this.pageSize();
    if (length === 0 || size === 0) {
      return this.t.instant('paginator.range', { start: 0, end: 0, total: length });
    }
    const start = this.pageIndex() * size;
    const end = start < length ? Math.min(start + size, length) : start + size;
    return this.t.instant('paginator.range', { start: start + 1, end, total: length });
  });

  protected goTo(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.lastPageIndex()));
    if (clamped === this.pageIndex()) return;
    this.page.emit({
      pageIndex: clamped,
      previousPageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      length: this.length(),
    });
  }

  protected changeSize(size: number): void {
    /* Mantém o primeiro item visível na nova página (paridade Material). */
    const firstItem = this.pageIndex() * this.pageSize();
    this.page.emit({
      pageIndex: Math.floor(firstItem / size),
      previousPageIndex: this.pageIndex(),
      pageSize: size,
      length: this.length(),
    });
  }
}
