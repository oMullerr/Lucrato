import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { A11yModule } from '@angular/cdk/a11y';
import { TranslateModule } from '@ngx-translate/core';
import { DialogShellComponent } from '../../shared/ui/dialog/dialog-shell.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';

export interface ImportResultDialogData {
  purchaseCount: number;
  saleCount: number;
  errors: string[];
}

@Component({
  selector: 'app-import-result-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, TranslateModule, DialogShellComponent, ButtonComponent],
  templateUrl: './import-result-dialog.component.html',
  styleUrl: './import-result-dialog.component.scss',
})
export class ImportResultDialogComponent {
  readonly ref = inject(DialogRef);
  readonly data = inject<ImportResultDialogData>(DIALOG_DATA);
}
