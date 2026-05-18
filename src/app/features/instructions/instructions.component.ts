import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { PageHeaderComponent } from '../../shared/components/page-header.component';

interface InstructionItem {
  icon: string;
  title: string;
  body: string;
}

const INSTRUCTIONS: InstructionItem[] = [
  {
    icon: 'apps',
    title: 'Estrutura do sistema',
    body: `O sistema é organizado em abas dedicadas para cada função:
• Estoque — visão executiva diária com KPIs e alertas. Comece sempre por aqui.
• Compras — onde você cadastra cada lote de produto. Uma linha por compra.
• Vendas — onde você registra cada venda. Uma linha por venda. Mesmo produto pode ter várias vendas com preços diferentes.
• Dashboard — gráficos e indicadores consolidados.
• Análises — resumos por produto, categoria, mês e estoque parado.
• Configurações — taxas, dias de alerta, listas e parâmetros editáveis.
• Instruções — este guia.`,
  },
  {
    icon: 'shopping_cart',
    title: 'Como cadastrar uma compra',
    body: `1. Vá para Compras e clique em "Nova Compra".
2. Preencha:
   • ID Lote: código único (ex: C011). Use código novo para cada compra, mesmo que o produto seja igual.
   • Produto, categoria, fornecedor, data.
   • Quantidade e custo unitário.
   • Frete e outros custos da compra (opcional).
3. Os campos calculados (custo total real, custo unitário real, estoque atual) aparecem automaticamente.`,
  },
  {
    icon: 'sell',
    title: 'Como registrar uma venda',
    body: `1. Vá para Vendas e clique em "Nova Venda".
2. Preencha:
   • ID Venda: código único (ex: V005).
   • ID Lote: selecione o lote correspondente — isso puxa o custo correto automaticamente.
   • Quantidade vendida, preço unitário, data, canal.
   • Taxa L: já vem preenchida com o padrão. Edite se a taxa foi diferente nessa venda.
   • Frete vendedor, desconto e outros custos (opcional).
3. O sistema calcula receita líquida, lucro e margem em tempo real.`,
  },
  {
    icon: 'sync_alt',
    title: 'Mesmo produto, preços diferentes',
    body: `Crie uma nova linha em Vendas para cada venda, mesmo que seja do mesmo produto. Cada venda tem seu próprio cálculo de lucro e margem.

Exemplo: lote C005 com 3 unidades por R$ 98,45.
• V010 | C005 | 1 unid. | R$ 220,00 → margem calculada individualmente
• V011 | C005 | 1 unid. | R$ 180,00 → margem calculada individualmente
• V012 | C005 | 1 unid. | R$ 195,00 → margem calculada individualmente

O custo (R$ 98,45) é puxado automaticamente nas três linhas via ID Lote.`,
  },
  {
    icon: 'vpn_key',
    title: 'Como funciona o ID Lote',
    body: `O ID Lote conecta compras e vendas. Sem ele preenchido corretamente, os cálculos de custo ficam errados.

• Comprou o mesmo produto novamente? Crie um ID novo (ex: C011). Cada lote tem seu próprio custo.
• Mesmo produto em fornecedores diferentes? Dois IDs diferentes.
• Sempre selecione o ID Lote ao registrar uma venda — ele está no select da aba Vendas.`,
  },
  {
    icon: 'analytics',
    title: 'Como ler a aba Estoque',
    body: `A aba Estoque é sua visão executiva. Nada precisa ser preenchido aqui.

KPIs principais:
• Total Investido — todo o dinheiro gasto comprando produtos.
• Capital Parado — Estoque × Custo Unit. Real. Dinheiro travado em produto.
• Receita Bruta / Líquida — total faturado e o que você recebe de fato.
• Lucro Líquido — resultado real após taxas, fretes e custos.
• Margem Líquida — eficiência das vendas.

Status do lote:
• Vendido: lote zerado.
• Em Estoque: dentro do prazo normal.
• Atenção: parado há ≥25 dias. Considere reduzir o preço.
• Parado: parado há ≥30 dias. Ação urgente.`,
  },
  {
    icon: 'notifications',
    title: 'Alertas visuais',
    body: `Na aba Compras, a coluna "Data da Compra" muda de cor automaticamente:
• Amarelo: estoque > 0 e entre 25 e 29 dias desde a compra.
• Vermelho: estoque > 0 e ≥30 dias desde a compra.
• Sem cor: estoque = 0 (vendido).

Os limites de dias são configuráveis em Configurações.`,
  },
  {
    icon: 'tune',
    title: 'Parâmetros configuráveis',
    body: `Na aba Configurações você pode ajustar:
• Taxa L padrão (12% por padrão).
• Dias para alertas amarelo (25) e vermelho (30).
• Margem líquida mínima desejada (10%).
• Frete padrão de compra.
• Listas de categorias, fornecedores e canais de venda.

Lembre-se de clicar em "Salvar" após mudar.`,
  },
  {
    icon: 'today',
    title: 'Fluxo do dia a dia',
    body: `Comprou um produto?
→ Aba Compras → "Nova Compra" → preencha → pronto.

Fez uma venda?
→ Aba Vendas → "Nova Venda" → ID Lote correto → preço e quantidade → pronto.
→ O estoque na aba Compras e o panorama na aba Estoque atualizam automaticamente.

Revisão semanal (5 minutos):
1. Aba Estoque → veja KPIs e alertas.
2. Datas amarelas/vermelhas → produtos que precisam de atenção.
3. Margens laranjas/vermelhas em Vendas → vendas abaixo do esperado.
4. Dashboard → evolução de receita e lucro.`,
  },
  {
    icon: 'lightbulb',
    title: 'Dicas importantes',
    body: `• Sempre preencha o ID Lote nas vendas — sem ele, o custo fica zerado e o lucro inflado.
• Use IDs novos para compras novas do mesmo produto.
• A taxa do L pode variar por venda — edite no formulário quando necessário.
• Use Compras → Backup para exportar/importar seus dados em JSON.
• O sistema funciona offline e salva tudo no seu navegador (localStorage).
• Pode alternar entre tema claro e escuro a qualquer momento no botão do canto superior direito.`,
  },
];

@Component({
  selector: 'app-instructions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule, MatIconModule, MatExpansionModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      icon="help_outline"
      title="Instruções de Uso"
      subtitle="Guia completo do sistema Lucrato"
    />

    <div class="content">
      <mat-card class="intro-card">
        <mat-icon class="intro-icon">menu_book</mat-icon>
        <div>
          <h3>Bem-vindo ao Lucrato</h3>
          <p>
            Este guia explica passo a passo como usar o sistema. Clique em cada
            seção para expandir e ver os detalhes.
          </p>
        </div>
      </mat-card>

      <mat-accordion multi class="instructions">
        @for (item of instructions; track item.title) {
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title>
                <mat-icon>{{ item.icon }}</mat-icon>
                {{ item.title }}
              </mat-panel-title>
            </mat-expansion-panel-header>
            <p class="instruction-body">{{ item.body }}</p>
          </mat-expansion-panel>
        }
      </mat-accordion>
    </div>
  `,
  styles: [`
    .content {
      padding: 24px 32px 48px;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .intro-card {
      padding: 20px 24px !important;
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--bg-blue) !important;
      border: 1px solid var(--clr-blue) !important;
    }

    .intro-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: var(--clr-blue);
    }

    .intro-card h3 {
      font-size: 16px;
      color: var(--txt-primary);
      margin: 0 0 4px;
    }

    .intro-card p {
      color: var(--txt-secondary);
      font-size: 13px;
      margin: 0;
      line-height: 1.5;
    }

    .instructions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    ::ng-deep .mat-expansion-panel {
      background: var(--bg-surface) !important;
      border: 1px solid var(--brd-default);
      border-radius: 10px !important;
      box-shadow: var(--shadow-sm) !important;
    }

    mat-panel-title {
      display: flex !important;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      color: var(--txt-primary);

      mat-icon {
        color: var(--clr-blue);
      }
    }

    .instruction-body {
      color: var(--txt-secondary);
      font-size: 13.5px;
      line-height: 1.7;
      margin: 0;
      white-space: pre-wrap;
    }
  `]
})
export class InstructionsComponent {
  protected readonly instructions = INSTRUCTIONS;
}
