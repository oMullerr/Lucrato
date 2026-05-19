import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
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
• A taxa do ML pode variar por venda — edite no formulário quando necessário.
• Use Configurações → Importação em Massa para importar compras e vendas via planilha Excel.
• Seus dados ficam salvos na nuvem e acessíveis de qualquer dispositivo após login.
• Pode alternar entre tema claro e escuro a qualquer momento no botão do canto superior direito.`,
  },
];

@Component({
  selector: 'app-instructions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      icon="help_outline"
      title="Instruções de Uso"
      subtitle="Guia completo do sistema Lucrato"
    />

    <div class="content">
      <div class="hero">
        <div class="hero-icon">
          <mat-icon>menu_book</mat-icon>
        </div>
        <div class="hero-text">
          <h2>Bem-vindo ao Lucrato</h2>
          <p>Este guia cobre todas as funcionalidades do sistema. Cada seção explica um aspecto diferente — do cadastro de compras aos alertas de estoque parado.</p>
        </div>
        <div class="hero-stat">
          <span class="stat-number">{{ instructions.length }}</span>
          <span class="stat-label">seções</span>
        </div>
      </div>

      <div class="cards-grid">
        @for (item of instructions; track item.title) {
          <div class="instruction-card">
            <div class="card-header">
              <div class="icon-badge">
                <mat-icon>{{ item.icon }}</mat-icon>
              </div>
              <h3 class="card-title">{{ item.title }}</h3>
            </div>
            <p class="card-body">{{ item.body }}</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .content {
      padding: 24px 32px 48px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .hero {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 28px 32px;
      background: linear-gradient(135deg, var(--bg-blue) 0%, var(--bg-surface) 100%);
      border: 1px solid color-mix(in srgb, var(--clr-blue) 30%, transparent);
      border-radius: 14px;
    }

    .hero-icon {
      width: 56px;
      height: 56px;
      background: var(--clr-blue);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 14px color-mix(in srgb, var(--clr-blue) 35%, transparent);

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
        color: #fff;
      }
    }

    .hero-text {
      flex: 1;

      h2 {
        font-size: 18px;
        font-weight: 700;
        color: var(--txt-primary);
        margin: 0 0 6px;
      }

      p {
        font-size: 13.5px;
        color: var(--txt-secondary);
        margin: 0;
        line-height: 1.55;
      }
    }

    .hero-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 24px;
      background: var(--bg-surface);
      border-radius: 12px;
      border: 1px solid var(--brd-default);
      flex-shrink: 0;
    }

    .stat-number {
      font-size: 32px;
      font-weight: 800;
      color: var(--clr-blue);
      line-height: 1;
    }

    .stat-label {
      font-size: 11px;
      color: var(--txt-muted);
      margin-top: 3px;
      letter-spacing: 0.3px;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .instruction-card {
      background: var(--bg-surface);
      border: 1px solid var(--brd-default);
      border-radius: 12px;
      padding: 20px 24px;
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;

      &:hover {
        box-shadow: var(--shadow-md);
        border-color: color-mix(in srgb, var(--clr-blue) 25%, var(--brd-default));
      }
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .icon-badge {
      width: 36px;
      height: 36px;
      background: var(--bg-blue);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--clr-blue);
      }
    }

    .card-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--txt-primary);
      margin: 0;
    }

    .card-body {
      font-size: 13px;
      color: var(--txt-secondary);
      line-height: 1.75;
      margin: 0;
      white-space: pre-wrap;
    }

    @media (max-width: 1000px) {
      .cards-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 700px) {
      .content { padding: 16px 16px 32px; }
      .hero { flex-wrap: wrap; }
      .hero-stat { display: none; }
    }
  `]
})
export class InstructionsComponent {
  protected readonly instructions = INSTRUCTIONS;
}
