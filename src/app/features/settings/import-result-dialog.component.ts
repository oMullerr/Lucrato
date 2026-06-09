import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

export interface ImportResultDialogData {
  purchaseCount: number;
  saleCount: number;
  errors: string[];
}

@Component({
  selector: 'app-import-result-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './import-result-dialog.component.html',
  styleUrl: './import-result-dialog.component.scss',
})
export class ImportResultDialogComponent {
  readonly ref = inject(MatDialogRef);
  readonly data = inject<ImportResultDialogData>(MAT_DIALOG_DATA);
}
