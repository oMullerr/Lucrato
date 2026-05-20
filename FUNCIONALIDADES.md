# Funcionalidades por Tela — Lucrato

> Descrição funcional do sistema. O que cada tela oferece e o que o usuário pode fazer nela.

---

## Navegação e Cabeçalho

Presente em todas as telas após o login.

**O usuário vê:**
- Menu lateral com os nomes de todas as telas do sistema
- Nome da sua loja no topo da página
- Botão para alternar entre tema claro e escuro
- Botão de sair (logout)
- Contador de lotes e vendas cadastrados no rodapé do menu

**O usuário pode:**
- Navegar entre as telas pelo menu lateral
- Em celular: abrir e fechar o menu pelo botão de hambúrguer (≡)
- Trocar o visual do sistema entre claro e escuro
- Fazer logout da conta

---

## 1. Login / Cadastro

Tela inicial antes de acessar o sistema.

**O usuário vê:**
- Formulário com abas: "Entrar" e "Criar conta"
- Campos de e-mail e senha
- Indicador de carregamento durante o acesso

**O usuário pode:**
- Entrar com e-mail e senha cadastrados
- Criar uma conta informando nome da loja, e-mail e senha
- Ver ou ocultar a senha digitada
- Receber mensagens de erro claras (ex: "E-mail ou senha incorretos")

---

## 2. Estoque — Panorama

Visão executiva do negócio. Nenhum dado é preenchido aqui — tudo é calculado automaticamente.

**O usuário vê:**

*Financeiro Geral:*
- Total Investido — quanto foi gasto em compras no total
- Capital Parado — quanto está imobilizado em produtos ainda em estoque
- Receita Bruta — tudo que entrou de vendas
- Receita Líquida — o que sobrou após taxas, fretes e descontos
- Lucro Líquido — resultado real após descontar o custo dos produtos
- Margem Líquida — eficiência das vendas em percentual

*Estoque em Números:*
- Quantidade de lotes em estoque, vendidos e total
- Quantidade de itens vendidos
- Quanto foi pago em taxas de marketplace
- Ticket médio por item vendido

*Tabela de lotes:* visão completa de cada lote com custo real, estoque atual, capital parado, datas de venda e margem média.

*Alertas:* cartões destacando lotes com produtos parados há muito tempo (atenção ou urgência).

**O usuário pode:**
- Acessar a tela de Compras ou Vendas pelos botões no topo
- Visualizar a situação financeira completa do negócio de relance

---

## 3. Compras

Cadastro e gestão dos lotes de compra.

**O usuário vê:**
- Lista de todos os lotes com colunas: ID, produto, categoria, fornecedor, datas, quantidade, custo unitário real, custo total real, vendas, estoque atual e status
- Totalizadores de lotes por status (em estoque, atenção, parado, vendido)
- Campo de busca por produto, ID ou categoria
- Filtro por status (chips clicáveis)
- Alertas visuais na data da compra: amarelo (produto parado há mais de X dias), vermelho (parado há mais de Y dias)

**O usuário pode:**
- Cadastrar um novo lote de compra
- Editar um lote existente
- Excluir um lote (apenas se não houver vendas vinculadas a ele)
- Filtrar e buscar lotes
- Ver o custo unitário real calculado automaticamente (inclui frete e outros custos rateados)

**Ao cadastrar ou editar um lote, o usuário preenche:**
- ID do lote (gerado automaticamente, mas editável)
- Nome do produto, categoria e fornecedor
- Link do produto (opcional)
- Data da compra e data de recebimento
- Quantidade comprada e custo por unidade
- Frete da compra, outros custos e observações

---

## 4. Vendas

Registro e gestão de cada venda realizada.

**O usuário vê:**
- Resumo no topo: total de vendas, receita bruta, taxas pagas, lucro líquido e margem média (dos resultados filtrados)
- Lista de todas as vendas com colunas: ID da venda, ID do lote, produto, data, canal, quantidade, preço unitário, receita bruta, taxa, receita líquida, custo, lucro líquido, margem e status
- Campo de busca por produto, ID da venda ou ID do lote
- Filtros por canal de venda e por status

**O usuário pode:**
- Registrar uma nova venda
- Editar uma venda existente
- Excluir uma venda
- Filtrar e buscar vendas
- Visualizar a margem de cada venda com indicação de cor (verde = saudável, amarelo = abaixo do mínimo, vermelho = negativo)

**Ao cadastrar ou editar uma venda, o usuário preenche:**
- ID da venda (gerado automaticamente, mas editável)
- Lote de origem (selecionado por ID — puxa o custo automaticamente)
- Quantidade vendida e preço por unidade
- Data da venda, canal de venda e status (Concluída, Cancelada, Devolvida, Em disputa)
- Taxa do marketplace (pré-preenchida com o padrão configurado, editável)
- Tipo de frete (Correios ou Flex), frete cobrado e reembolso flex
- Desconto, outros custos e observações
- Todos os cálculos (receita, lucro, margem) aparecem em tempo real enquanto preenche

---

## 5. Dashboard

Painel visual com gráficos para acompanhar o desempenho do negócio.

**O usuário vê:**
- 6 KPIs principais: total investido, capital parado, receita bruta, lucro líquido, margem líquida e taxas pagas
- Gráfico de linha: evolução mensal comparando receita líquida e lucro líquido
- Gráfico de barras: lucro líquido por produto (ranking dos mais lucrativos)
- Gráfico de rosca: como a receita bruta se divide (lucro, custo do produto, taxas, frete e descontos)
- Gráfico de barras horizontais: quais lotes têm mais capital parado
- Gráfico de barras agrupadas: comparativo financeiro geral (investido, receita, custo, taxas, frete, lucro)

**O usuário pode:**
- Visualizar a evolução do negócio ao longo do tempo
- Identificar quais produtos geram mais lucro
- Entender para onde vai cada real faturado

---

## 6. Análises

Relatórios detalhados com 4 abas de análise.

**O usuário vê:**
- Resumo financeiro completo com 10 métricas no topo da tela
- **Aba 1 — Ranking por Produto:** tabela com cada produto, quantidade vendida, receita, custo, lucro e margem — ordenados por desempenho
- **Aba 2 — Por Categoria:** resumo financeiro agrupado por categoria (lotes, investido, capital parado, receita, lucro, margem)
- **Aba 3 — Evolução Mensal:** tabela mês a mês com quantidade vendida, receita, taxas, custo, lucro e margem
- **Aba 4 — Estoque Parado:** lista de lotes com produto ainda em estoque, mostrando custo unitário, capital parado, dias parado e status

**O usuário pode:**
- Identificar os produtos e categorias mais rentáveis
- Acompanhar a evolução do negócio mês a mês
- Identificar quais produtos precisam de ação urgente (parados há muito tempo)

---

## 7. Configurações

Personalização dos parâmetros e dados do sistema.

**O usuário vê:**
- Formulário com os parâmetros configuráveis do sistema
- Listas de categorias, fornecedores e canais de venda (editáveis)
- Seção de importação em massa via planilha *(visível apenas no computador)*
- Zona de perigo com opção de resetar todos os dados

**O usuário pode:**

*Parâmetros do sistema:*
- Definir a taxa padrão do marketplace (ex: 12%)
- Definir a margem mínima desejada (ex: 10%)
- Configurar quantos dias sem venda acionam o alerta amarelo e o alerta vermelho
- Definir o frete padrão de compra
- Definir o canal de venda padrão

*Listas:*
- Adicionar e remover categorias de produto
- Adicionar e remover fornecedores
- Adicionar e remover canais de venda
- Reordenar itens das listas arrastando e soltando

*Importação em massa (somente no computador):*
- Baixar um modelo de planilha Excel pré-formatado
- Enviar uma planilha Excel com compras e vendas para importar tudo de uma vez
- Ver o resultado da importação (quantos registros foram importados e quais erros ocorreram)

*Zona de perigo:*
- Resetar todos os dados do sistema (compras, vendas e configurações) voltando ao estado inicial com dados de exemplo

---

## 8. Instruções

Guia de uso completo do sistema.

**O usuário vê:**
- 10 seções explicativas cobrindo todas as funcionalidades
- Cada seção com ícone, título e explicação em linguagem simples

**Conteúdo das seções:**
1. Estrutura do sistema — o que cada tela faz
2. Como cadastrar uma compra
3. Como registrar uma venda
4. Como lidar com o mesmo produto a preços diferentes
5. Como funciona o ID do Lote e por que é importante
6. Como interpretar a tela de Estoque
7. O que significam os alertas de cores (amarelo e vermelho)
8. O que pode ser configurado em Configurações
9. Fluxo do dia a dia (comprei → cadastrei, vendi → registrei)
10. Dicas importantes para não errar nos cálculos
