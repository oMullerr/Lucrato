import { ChangeDetectionStrategy, Component } from '@angular/core';
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
  imports: [PageHeaderComponent],
  templateUrl: './instructions.component.html',
  styleUrl: './instructions.component.scss',
})
export class InstructionsComponent {
  protected readonly instructions = INSTRUCTIONS;
}
