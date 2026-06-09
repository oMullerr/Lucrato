import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

interface InstructionItem {
  icon: string;
  titleKey: string;
  bodyKey: string;
}

/** Titles/bodies are i18n keys resolved with the `translate` pipe in the template. */
const INSTRUCTIONS: InstructionItem[] = [
  { icon: 'apps',          titleKey: 'instructions.sec1Title',  bodyKey: 'instructions.sec1Body' },
  { icon: 'shopping_cart', titleKey: 'instructions.sec2Title',  bodyKey: 'instructions.sec2Body' },
  { icon: 'sell',          titleKey: 'instructions.sec3Title',  bodyKey: 'instructions.sec3Body' },
  { icon: 'sync_alt',      titleKey: 'instructions.sec4Title',  bodyKey: 'instructions.sec4Body' },
  { icon: 'vpn_key',       titleKey: 'instructions.sec5Title',  bodyKey: 'instructions.sec5Body' },
  { icon: 'analytics',     titleKey: 'instructions.sec6Title',  bodyKey: 'instructions.sec6Body' },
  { icon: 'notifications', titleKey: 'instructions.sec7Title',  bodyKey: 'instructions.sec7Body' },
  { icon: 'tune',          titleKey: 'instructions.sec8Title',  bodyKey: 'instructions.sec8Body' },
  { icon: 'today',         titleKey: 'instructions.sec9Title',  bodyKey: 'instructions.sec9Body' },
  { icon: 'lightbulb',     titleKey: 'instructions.sec10Title', bodyKey: 'instructions.sec10Body' },
];

@Component({
  selector: 'app-instructions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, TranslateModule],
  templateUrl: './instructions.component.html',
  styleUrl: './instructions.component.scss',
})
export class InstructionsComponent {
  protected readonly instructions = INSTRUCTIONS;
}
