import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { GuideComponent, GuideItem } from '../../shared/components/guide.component';

/** Títulos e corpos são chaves i18n resolvidas no template do guia. */
const INSTRUCTIONS: GuideItem[] = [
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
  selector: 'app-instructions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, GuideComponent, TranslateModule],
  templateUrl: './instructions.component.html',
  styleUrl: './instructions.component.scss',
})
export class InstructionsComponent {
  protected readonly instructions = INSTRUCTIONS;
}
