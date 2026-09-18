import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { GuideComponent, GuideItem } from '../../shared/components/guide.component';

/**
 * Guia único do Lucrato.
 *
 * Eram duas telas com o mesmo desenho e dois lugares no menu: "Instruções", que
 * ensinava a digitar tudo à mão, e "Guia do Mercado Livre", que explicava o que
 * passa a acontecer sozinho. A separação fazia sentido quando o manual era o
 * caminho principal. Com a integração, ele virou exceção — e as Instruções
 * seguiam ensinando o caminho de exceção como se fosse o normal, na frente.
 *
 * A ordem aqui é a do uso real: primeiro o que o app faz sozinho, depois o que
 * você faz à mão quando precisa (venda fora da plataforma, correção, o custo do
 * fornecedor que a API nunca vai saber).
 *
 * Os dois blocos continuam com índice próprio de propósito: são vinte e três
 * seções ao todo, e um índice único dessa altura não ajuda ninguém a achar nada.
 */
const INTEGRACAO: GuideItem[] = [
  { titleKey: 'mlGuide.sec1Title',  bodyKey: 'mlGuide.sec1Body' },
  { titleKey: 'mlGuide.sec2Title',  bodyKey: 'mlGuide.sec2Body' },
  { titleKey: 'mlGuide.sec3Title',  bodyKey: 'mlGuide.sec3Body' },
  { titleKey: 'mlGuide.sec4Title',  bodyKey: 'mlGuide.sec4Body' },
  { titleKey: 'mlGuide.sec5Title',  bodyKey: 'mlGuide.sec5Body' },
  { titleKey: 'mlGuide.sec6Title',  bodyKey: 'mlGuide.sec6Body' },
  { titleKey: 'mlGuide.sec7Title',  bodyKey: 'mlGuide.sec7Body' },
  { titleKey: 'mlGuide.sec8Title',  bodyKey: 'mlGuide.sec8Body' },
  { titleKey: 'mlGuide.sec9Title',  bodyKey: 'mlGuide.sec9Body' },
  { titleKey: 'mlGuide.sec10Title', bodyKey: 'mlGuide.sec10Body' },
  { titleKey: 'mlGuide.sec11Title', bodyKey: 'mlGuide.sec11Body' },
  { titleKey: 'mlGuide.sec13Title', bodyKey: 'mlGuide.sec13Body' },
  { titleKey: 'mlGuide.sec12Title', bodyKey: 'mlGuide.sec12Body' },
];

const MANUAL: GuideItem[] = [
  { titleKey: 'instructions.sec1Title',  bodyKey: 'instructions.sec1Body' },
  { titleKey: 'instructions.sec2Title',  bodyKey: 'instructions.sec2Body' },
  { titleKey: 'instructions.sec3Title',  bodyKey: 'instructions.sec3Body' },
  { titleKey: 'instructions.sec4Title',  bodyKey: 'instructions.sec4Body' },
  { titleKey: 'instructions.sec5Title',  bodyKey: 'instructions.sec5Body' },
  { titleKey: 'instructions.sec6Title',  bodyKey: 'instructions.sec6Body' },
  { titleKey: 'instructions.sec7Title',  bodyKey: 'instructions.sec7Body' },
  { titleKey: 'instructions.sec8Title',  bodyKey: 'instructions.sec8Body' },
  { titleKey: 'instructions.sec9Title',  bodyKey: 'instructions.sec9Body' },
  { titleKey: 'instructions.sec10Title', bodyKey: 'instructions.sec10Body' },
];

@Component({
  selector: 'app-guide-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, GuideComponent, TranslateModule],
  templateUrl: './guide-page.component.html',
  styleUrl: './guide-page.component.scss',
})
export class GuidePageComponent {
  protected readonly integracao = INTEGRACAO;
  protected readonly manual = MANUAL;
  protected readonly total = INTEGRACAO.length + MANUAL.length;
}
