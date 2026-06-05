import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { NotifyService } from '../../core/services/notify.service';
import { DEFAULT_CATEGORY_COLOR } from '../../core/constants/app.constants';

@Component({
  selector: 'app-editable-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './editable-list.component.html',
  styleUrl: './editable-list.component.scss',
})
export class EditableListComponent {
  private readonly notify = inject(NotifyService);

  readonly items = input.required<string[]>();
  readonly addLabel = input<string>('');
  readonly placeholder = input<string>('Digite e pressione Enter');

  /** Quando true, cada item ganha um seletor de cor e o mapa `colors` é editado junto. */
  readonly withColor = input<boolean>(false);
  readonly colors = input<Record<string, string>>({});
  readonly defaultColor = input<string>(DEFAULT_CATEGORY_COLOR);

  readonly itemsChange = output<string[]>();
  readonly colorsChange = output<Record<string, string>>();

  protected draft = '';
  protected draftColor = DEFAULT_CATEGORY_COLOR;

  protected colorOf(item: string): string {
    return this.colors()[item] ?? this.defaultColor();
  }

  protected add(): void {
    const v = this.draft.trim();
    if (!v) return;
    if (this.items().includes(v)) {
      this.notify.warning(`"${v}" já existe na lista.`);
      return;
    }
    this.itemsChange.emit([...this.items(), v]);
    if (this.withColor()) {
      this.colorsChange.emit({ ...this.colors(), [v]: this.draftColor });
      this.draftColor = this.defaultColor();
    }
    this.draft = '';
  }

  protected setColor(item: string, color: string): void {
    this.colorsChange.emit({ ...this.colors(), [item]: color });
  }

  protected remove(index: number): void {
    const name = this.items()[index];
    this.itemsChange.emit(this.items().filter((_, i) => i !== index));
    if (this.withColor() && name in this.colors()) {
      const next = { ...this.colors() };
      delete next[name];
      this.colorsChange.emit(next);
    }
  }

  protected move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.items().length) return;
    const arr = [...this.items()];
    moveItemInArray(arr, index, target);
    this.itemsChange.emit(arr);
  }
}
