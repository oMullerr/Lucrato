import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Venda } from '../../core/models/models';
import { DataService } from '../../core/services/data.service';
import { calcularVenda } from '../../core/services/calculations';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

export interface VendaDialogData {
  venda?: Venda;
}

@Component({
  selector: 'app-venda-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatTooltipModule, BrlPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ isEdit() ? 'edit' : 'sell' }}</mat-icon>
      {{ isEdit() ? 'Editar Venda' : 'Nova Venda' }}
    </h2>

    <mat-dialog-content>
      <form #form="ngForm" class="form-grid">
        <mat-form-field>
          <mat-label>ID Venda</mat-label>
          <input
            matInput
            [(ngModel)]="model().id"
            name="id"
            required
            pattern="V[0-9]{3,}"
            [readonly]="isEdit()"
          />
          <mat-hint>Formato: V001, V002...</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>ID Lote (da aba Compras)</mat-label>
          <mat-select
            [(ngModel)]="model().idLote"
            name="idLote"
            required
            (selectionChange)="aoEscolherLote()"
          >
            @for (lote of lotesDisponiveis(); track lote.id) {
              <mat-option [value]="lote.id">
                {{ lote.id }} — {{ lote.produto }}
                @if (lote.estoqueAtual <= 0) {
                  (esgotado)
                } @else {
                  ({{ lote.estoqueAtual }} disp.)
                }
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Produto</mat-label>
          <input matInput [value]="model().produto" name="produto" readonly />
          <mat-hint>Preenchido automaticamente pelo lote</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data da Venda</mat-label>
          <input matInput type="date" [(ngModel)]="model().dataVenda" name="dataVenda" required />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Canal</mat-label>
          <mat-select [(ngModel)]="model().canal" name="canal" required>
            @for (c of canais(); track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Qtd. Vendida</mat-label>
          <input matInput type="number" [(ngModel)]="model().qtdVendida" name="qtdVendida" min="1" required />
          @if (estoqueDisponivel() !== null) {
            <mat-hint>Disponível: {{ estoqueDisponivel() }} un.</mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Preço Unitário (R$)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="model().precoUnitario" name="precoUnitario" min="0.01" required />
        </mat-form-field>

        <!-- TAXA CUSTOMIZADA - destaque -->
        <div class="taxa-field full">
          <div class="taxa-header">
            <span class="taxa-label">
              <mat-icon>local_offer</mat-icon>
              Taxa Mercado Livre (%)
            </span>
            <button
              type="button"
              mat-icon-button
              (click)="resetarTaxa()"
              matTooltip="Resetar para padrão ({{ (taxaPadrao() * 100).toFixed(1) }}%)"
            >
              <mat-icon>restart_alt</mat-icon>
            </button>
          </div>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <input
              matInput
              type="number"
              step="0.01"
              min="0"
              max="100"
              [(ngModel)]="taxaInput"
              name="taxaInput"
              (ngModelChange)="onTaxaChange()"
              required
            />
            <span matSuffix>%</span>
          </mat-form-field>
          <small class="taxa-hint">
            Padrão: {{ (taxaPadrao() * 100).toFixed(1) }}% · Edite para essa venda específica
          </small>
        </div>

        <mat-form-field>
          <mat-label>Frete Vendedor (R$)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="model().freteVendedor" name="freteVendedor" min="0" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Desconto / Cupom (R$)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="model().desconto" name="desconto" min="0" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Outros Custos (R$)</mat-label>
          <input matInput type="number" step="0.01" [(ngModel)]="model().outrosCustos" name="outrosCustos" min="0" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="model().status" name="status" required>
            <mat-option value="Concluída">Concluída</mat-option>
            <mat-option value="Cancelada">Cancelada</mat-option>
            <mat-option value="Devolvida">Devolvida</mat-option>
            <mat-option value="Em disputa">Em disputa</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Observações</mat-label>
          <textarea matInput rows="2" [(ngModel)]="model().observacoes" name="observacoes"></textarea>
        </mat-form-field>
      </form>

      <!-- Preview -->
      <div class="preview">
        <div class="preview-title">
          <mat-icon>calculate</mat-icon>
          Resultado calculado
        </div>
        <div class="preview-stats">
          <div>
            <span>Receita Bruta</span>
            <strong class="text-info">{{ preview().receitaBruta | brl }}</strong>
          </div>
          <div>
            <span>Taxa ML</span>
            <strong class="text-warning">- {{ preview().taxaValor | brl }}</strong>
          </div>
          <div>
            <span>Receita Líquida</span>
            <strong>{{ preview().receitaLiquida | brl }}</strong>
          </div>
          <div>
            <span>Custo Produto</span>
            <strong class="text-danger">- {{ preview().custoTotalProporcional | brl }}</strong>
          </div>
          <div>
            <span>Lucro Líquido</span>
            <strong [class]="lucroClasse()">
              {{ preview().lucroLiquido | brl }}
            </strong>
          </div>
          <div>
            <span>Margem Líquida</span>
            <strong [class]="margemClasse()">
              {{ (preview().margemLiquida * 100).toFixed(1) }}%
            </strong>
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
    h2 mat-icon { color: var(--clr-green); }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding-top: 8px;
    }

    .form-grid .full { grid-column: 1 / -1; }

    .taxa-field {
      padding: 12px 16px;
      background: var(--bg-amber);
      border: 1px solid var(--clr-amber);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .taxa-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .taxa-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--clr-amber);

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .taxa-hint {
      font-size: 11px;
      color: var(--clr-amber);
    }

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

      mat-icon { font-size: 16px; width: 16px; height: 16px; }
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
      font-size: 14px;
      margin-top: 2px;
    }

    @media (max-width: 600px) {
      .form-grid { grid-template-columns: 1fr; }
      .preview-stats { grid-template-columns: 1fr; }
    }
  `]
})
export class VendaFormDialogComponent {
  private readonly dataService = inject(DataService);
  protected readonly ref = inject<MatDialogRef<VendaFormDialogComponent, Venda | null>>(MatDialogRef);
  private readonly data = inject<VendaDialogData>(MAT_DIALOG_DATA);

  protected readonly isEdit = signal(!!this.data.venda);
  protected readonly model = signal<Venda>(this.initialModel());
  protected taxaInput = (this.data.venda?.taxaPercentual ?? this.dataService.configuracoes()?.taxaMlPadrao ?? 0.12) * 100;

  protected readonly canais = computed(() => this.dataService.configuracoes()?.canais ?? []);
  protected readonly taxaPadrao = computed(() => this.dataService.configuracoes()?.taxaMlPadrao ?? 0.12);

  protected readonly lotesDisponiveis = computed(() =>
    this.dataService.comprasCalculadas()
      .filter(c => c.estoqueAtual > 0 || (this.isEdit() && c.id === this.model().idLote))
  );

  protected readonly estoqueDisponivel = computed(() => {
    const idLote = this.model().idLote;
    if (!idLote) return null;
    const lote = this.dataService.comprasCalculadas().find(c => c.id === idLote);
    return lote ? lote.estoqueAtual : null;
  });

  protected readonly preview = computed(() => {
    return calcularVenda(this.model(), this.dataService.compras());
  });

  protected lucroClasse(): string {
    const l = this.preview().lucroLiquido;
    return l < 0 ? 'text-danger' : l > 0 ? 'text-success' : '';
  }

  protected margemClasse(): string {
    const m = this.preview().margemLiquida;
    if (m < 0) return 'text-danger';
    const cfg = this.dataService.configuracoes();
    if (cfg && m < cfg.margemMinima) return 'text-warning';
    return 'text-success';
  }

  protected onTaxaChange(): void {
    this.model.update(m => ({ ...m, taxaPercentual: (this.taxaInput || 0) / 100 }));
  }

  protected resetarTaxa(): void {
    this.taxaInput = this.taxaPadrao() * 100;
    this.onTaxaChange();
  }

  protected aoEscolherLote(): void {
    const lote = this.dataService.buscarCompra(this.model().idLote);
    if (lote) {
      this.model.update(m => ({ ...m, produto: lote.produto }));
    }
  }

  protected isValid(): boolean {
    const m = this.model();
    return !!(m.id && m.idLote && m.produto && m.qtdVendida > 0 &&
              m.precoUnitario > 0 && m.dataVenda && m.canal && m.status);
  }

  protected salvar(): void {
    if (!this.isValid()) return;
    this.ref.close({ ...this.model() });
  }

  private initialModel(): Venda {
    if (this.data.venda) return { ...this.data.venda };
    const cfg = this.dataService.configuracoes();
    return {
      id: this.dataService.proximoIdVenda(),
      idLote: '',
      produto: '',
      qtdVendida: 1,
      precoUnitario: 0,
      dataVenda: new Date().toISOString().split('T')[0]!,
      canal: cfg?.canalPadrao ?? 'Mercado Livre',
      taxaPercentual: cfg?.taxaMlPadrao ?? 0.12,
      freteVendedor: 0,
      desconto: 0,
      outrosCustos: 0,
      status: 'Concluída',
      observacoes: '',
    };
  }
}
