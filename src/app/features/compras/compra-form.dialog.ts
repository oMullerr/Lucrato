import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Compra } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

export interface CompraDialogData {
  compra?: Compra;
}

@Component({
  selector: 'app-compra-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatDatepickerModule, BrlPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ isEdit() ? 'edit' : 'add_circle' }}</mat-icon>
      {{ isEdit() ? 'Editar Compra' : 'Nova Compra' }}
    </h2>

    <mat-dialog-content>
      <form #form="ngForm" class="form-grid">
        <mat-form-field>
          <mat-label>ID Lote</mat-label>
          <input
            matInput
            [(ngModel)]="model().id"
            name="id"
            required
            pattern="C[0-9]{3,}"
            [readonly]="isEdit()"
          />
          <mat-hint>Formato: C001, C002...</mat-hint>
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Produto</mat-label>
          <input matInput [(ngModel)]="model().produto" name="produto" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Categoria</mat-label>
          <mat-select [(ngModel)]="model().categoria" name="categoria" required>
            @for (cat of categorias(); track cat) {
              <mat-option [value]="cat">{{ cat }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Fornecedor</mat-label>
          <mat-select [(ngModel)]="model().fornecedor" name="fornecedor" required>
            @for (f of fornecedores(); track f) {
              <mat-option [value]="f">{{ f }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data da Compra</mat-label>
          <input
            matInput
            [matDatepicker]="pickerCompra"
            [ngModel]="dataAsDate(model().dataCompra)"
            (ngModelChange)="setDataCompra($event)"
            name="dataCompra"
            required
          />
          <mat-datepicker-toggle matIconSuffix [for]="pickerCompra"></mat-datepicker-toggle>
          <mat-datepicker #pickerCompra></mat-datepicker>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Quantidade Comprada</mat-label>
          <input matInput type="number" [(ngModel)]="model().qtdComprada" name="qtdComprada" min="1" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Custo Unitário (R$)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="model().custoUnitario" name="custoUnitario" min="0" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Frete da Compra (R$)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="model().freteCompra" name="freteCompra" min="0" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Outros Custos (R$)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="model().outrosCustos" name="outrosCustos" min="0" />
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Link da Compra (opcional)</mat-label>
          <input matInput type="url" [(ngModel)]="model().link" name="link" placeholder="https://..." />
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Observações</mat-label>
          <textarea matInput rows="2" [(ngModel)]="model().observacoes" name="observacoes"></textarea>
        </mat-form-field>
      </form>

      <div class="preview">
        <div class="preview-title">
          <mat-icon>calculate</mat-icon>
          Cálculo automático
        </div>
        <div class="preview-stats">
          <div>
            <span>Custo Total</span>
            <strong>{{ custoTotalCompra() | brl }}</strong>
          </div>
          <div>
            <span>Custo Total Real</span>
            <strong>{{ custoTotalReal() | brl }}</strong>
          </div>
          <div>
            <span>Custo Unit. Real</span>
            <strong>{{ custoUnitarioReal() | brl }}</strong>
          </div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="salvar()" [disabled]="!isValid()">
        <mat-icon>save</mat-icon>
        {{ isEdit() ? 'Salvar' : 'Adicionar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 { display: flex; align-items: center; gap: 10px; }
    h2 mat-icon { color: var(--clr-blue); }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding-top: 8px;
    }

    .form-grid .full { grid-column: 1 / -1; }

    .preview {
      margin-top: 16px;
      padding: 16px;
      background: var(--bg-blue);
      border: 1px solid var(--clr-blue);
      border-radius: 10px;
    }

    .preview-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--clr-blue);
      margin-bottom: 12px;
      letter-spacing: 0.3px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .preview-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .preview-stats > div {
      display: flex;
      flex-direction: column;
    }

    .preview-stats span {
      font-size: 11px;
      color: var(--txt-secondary);
    }

    .preview-stats strong {
      font-size: 15px;
      color: var(--clr-blue);
      margin-top: 2px;
    }

    @media (max-width: 600px) {
      .form-grid { grid-template-columns: 1fr; }
      .preview-stats { grid-template-columns: 1fr; }
    }
  `]
})
export class CompraFormDialogComponent {
  private readonly dataService = inject(DataService);
  protected readonly ref = inject<MatDialogRef<CompraFormDialogComponent, Compra | null>>(MatDialogRef);
  private readonly data = inject<CompraDialogData>(MAT_DIALOG_DATA);

  protected readonly isEdit = signal(!!this.data.compra);
  protected readonly model = signal<Compra>(this.initialModel());

  protected readonly categorias = computed(() => this.dataService.configuracoes()?.categorias ?? []);
  protected readonly fornecedores = computed(() => this.dataService.configuracoes()?.fornecedores ?? []);

  protected readonly custoTotalCompra = computed(() =>
    (this.model().qtdComprada ?? 0) * (this.model().custoUnitario ?? 0)
  );
  protected readonly custoTotalReal = computed(() =>
    this.custoTotalCompra() + (this.model().freteCompra ?? 0) + (this.model().outrosCustos ?? 0)
  );
  protected readonly custoUnitarioReal = computed(() => {
    const m = this.model();
    return m.qtdComprada > 0 ? this.custoTotalReal() / m.qtdComprada : 0;
  });

  protected dataAsDate(s: string | undefined): Date | null {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  protected setDataCompra(d: Date | null): void {
    this.model.update(m => ({ ...m, dataCompra: this.dateAsString(d) }));
  }

  private dateAsString(d: Date | null): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  protected isValid(): boolean {
    const m = this.model();
    return !!(m.id && m.produto && m.categoria && m.fornecedor &&
              m.dataCompra && m.qtdComprada > 0 && m.custoUnitario >= 0);
  }

  protected salvar(): void {
    if (!this.isValid()) return;
    this.ref.close({ ...this.model() });
  }

  private initialModel(): Compra {
    if (this.data.compra) return { ...this.data.compra };
    const cfg = this.dataService.configuracoes();
    return {
      id: this.dataService.proximoIdCompra(),
      produto: '',
      categoria: cfg?.categorias[0] ?? 'Eletrônicos',
      fornecedor: cfg?.fornecedores[0] ?? 'Amazon BR',
      link: '',
      dataCompra: new Date().toISOString().split('T')[0]!,
      qtdComprada: 1,
      custoUnitario: 0,
      freteCompra: cfg?.fretePadrao ?? 0,
      outrosCustos: 0,
      observacoes: '',
    };
  }
}
