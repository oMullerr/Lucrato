import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { GuideComponent, GuideItem } from '../../shared/components/guide.component';

/**
 * Guia da integração com o Mercado Livre.
 *
 * Separado das Instruções de propósito: aquelas ensinam a usar o Lucrato à
 * mão, estas explicam o que passa a acontecer sozinho. Misturar as duas faria
 * quem nunca conectou a conta ler dez seções que não valem para ele.
 *
 * A ordem segue o caminho real: conectar, vincular, receber venda, conferir a
 * cobrança. Depois vêm as telas de apoio e, no fim, o que fazer quando algo
 * não bate.
 */
const SECOES: GuideItem[] = [
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

@Component({
  selector: 'app-ml-guide',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, GuideComponent, TranslateModule],
  templateUrl: './ml-guide.component.html',
  styleUrl: './ml-guide.component.scss',
})
export class MlGuideComponent {
  protected readonly secoes = SECOES;
}
