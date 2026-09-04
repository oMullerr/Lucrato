import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/** Uma seção do guia. Título e corpo são chaves i18n. */
export interface GuideItem {
  titleKey: string;
  bodyKey: string;
}

/**
 * Guia numerado com índice lateral.
 *
 * Extraído da página de Instruções quando o guia do Mercado Livre passou a
 * precisar do mesmo desenho. Duplicar as 170 linhas de layout garantiria que
 * um dia as duas telas ficariam diferentes sem ninguém decidir isso.
 *
 * Só o layout: cada página traz o próprio cabeçalho, porque título e subtítulo
 * são a parte que muda.
 */
@Component({
  selector: 'app-guide',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  templateUrl: './guide.component.html',
  styleUrl: './guide.component.scss',
})
export class GuideComponent {
  readonly items = input.required<readonly GuideItem[]>();
  /** Rótulo do índice, para leitores de tela. */
  readonly indexAria = input<string>('');
  readonly tocTitle = input<string>('');

  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;

  /**
   * Rola até a seção clicada no índice.
   *
   * O conteúdo do shell rola dentro de um container interno com `overflow`,
   * então link `#fragment` nativo não rola — `scrollIntoView` encontra o
   * ancestral rolável certo e respeita o `scroll-margin-top` da seção.
   */
  protected scrollToSection(event: MouseEvent, index: number): void {
    event.preventDefault();
    const target = this.host.nativeElement.querySelector(`#sec-${index}`);
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /** Numeração com zero à esquerda, para o índice não dançar entre 9 e 10. */
  protected numero(i: number): string {
    return i + 1 < 10 ? `0${i + 1}` : String(i + 1);
  }
}
