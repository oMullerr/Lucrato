import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { NotifyService } from '../../core/services/notify.service';

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

  readonly itemsChange = output<string[]>();

  protected draft = '';

  protected add(): void {
    const v = this.draft.trim();
    if (!v) return;
    if (this.items().includes(v)) {
      this.notify.warning(`"${v}" já existe na lista.`);
      return;
    }
    this.itemsChange.emit([...this.items(), v]);
    this.draft = '';
  }

  protected remove(index: number): void {
    this.itemsChange.emit(this.items().filter((_, i) => i !== index));
  }

  protected move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.items().length) return;
    const arr = [...this.items()];
    moveItemInArray(arr, index, target);
    this.itemsChange.emit(arr);
  }
}
