# Escopo do Projeto — Lucrato

> Documento de escopo completo descrevendo tudo que é necessário para construir o sistema Lucrato do zero.

---

## 1. Visão Geral

**Nome do Produto:** Lucrato
**Tagline:** Gestão de estoque e vendas

**Objetivo:** Ferramenta web para pequenos e médios vendedores de marketplace (Mercado Livre, Shopee, Amazon, Instagram, WhatsApp) gerenciarem compras, estoque e vendas com controle financeiro real — lucro líquido, margem, capital parado e alertas de giro de estoque.

**Problema que resolve:**
- Vendedores não sabem o custo real por unidade (considerando frete e outros custos da compra)
- Não conseguem calcular a margem líquida após taxas de marketplace
- Não têm visão de quais produtos estão parados há muito tempo
- Não conseguem separar dados por lote de compra (mesmo produto comprado em datas/preços diferentes)

**Premissa central:** Cada lote de compra tem seu próprio custo. Cada venda é vinculada a um lote específico, puxando o custo correto para o cálculo de lucro.

---

## 2. Público-Alvo

| Perfil | Descrição |
|--------|-----------|
| Revendedor individual | Compra produtos no atacado e vende em marketplaces |
| Pequeno lojista online | Opera em 1–3 canais de venda, sem sistema de gestão |
| Vendedor Mercado Livre | Precisa entender taxas L e lucro real por venda |

**Nível técnico esperado:** Baixo — interface deve ser intuitiva, sem jargões de ERP.

---

## 3. Stack Tecnológica

### Frontend
| Tecnologia | Versão | Uso |
|------------|--------|-----|
| Angular | 18.2 | Framework principal |
| Angular Material | 18.2 | Componentes de UI (Material Design 3) |
| Angular CDK | 18.2 | Layout, drag-and-drop, breakpoints |
| RxJS | 7.8 | Reatividade e observables |
| SCSS | — | Estilização com variáveis CSS customizadas |

### Backend / Infraestrutura
| Tecnologia | Versão | Uso |
|------------|--------|-----|
| Firebase Auth | 10.14 | Autenticação de usuários (email/senha) |
| Firebase Firestore | 10.14 | Banco de dados NoSQL em tempo real |
| @angular/fire | 18.0 | SDK Angular para Firebase |

### Bibliotecas auxiliares
| Biblioteca | Versão | Uso |
|------------|--------|-----|
| Chart.js | 4.4.4 | Renderização de gráficos |
| ng2-charts | 6.0.1 | Wrapper Angular para Chart.js |
| xlsx | 0.18.5 | Importação/exportação de planilhas Excel |

### Ferramentas de desenvolvimento
| Ferramenta | Uso |
|------------|-----|
| Angular CLI | Scaffolding, build, serve |
| TypeScript | Tipagem estática |
| Node.js / npm | Gerenciamento de dependências |

---

## 4. Arquitetura do Sistema

### Padrão Arquitetural
- **Standalone Components** (sem NgModules)
- **Signals** como mecanismo de estado reativo (sem NgRx)
- **OnPush Change Detection** em todos os componentes
- **Lazy Loading** em todas as rotas

### Estrutura de Pastas

```
src/
├── app/
│   ├── core/
│   │   ├── constants/       # Constantes da aplicação
│   │   ├── guards/          # Guards de rota (auth, guest)
│   │   ├── models/          # Interfaces TypeScript
│   │   └── services/        # Serviços de negócio
│   ├── features/
│   │   ├── auth/            # Tela de login/cadastro
│   │   ├── analytics/       # Análises detalhadas
│   │   ├── dashboard/       # Dashboard com gráficos
│   │   ├── instructions/    # Guia de uso
│   │   ├── inventory/       # Panorama de estoque
│   │   ├── purchases/       # Cadastro de compras
│   │   ├── sales/           # Registro de vendas
│   │   └── settings/        # Configurações do sistema
│   ├── shared/
│   │   ├── components/      # Componentes reutilizáveis
│   │   └── pipes/           # Pipes customizados (BRL, data BR)
│   ├── app.component.ts     # Shell com sidenav
│   ├── app.config.ts        # Providers globais (Firebase, Material, Router)
│   └── app.routes.ts        # Definição de rotas
├── environments/            # Configurações por ambiente
└── styles.scss              # Estilos globais e variáveis CSS
```

### Fluxo de Dados

```
Firestore (nuvem)
     ↓ onSnapshot (tempo real)
DataService (signals)
     ↓ computed()
Componentes (OnPush)
     ↓ ações do usuário
DataService.setDoc()
     ↓
Firestore (nuvem)
```

### Armazenamento no Firestore

Cada usuário possui um único documento:

```
users/{uid}/db/main → { purchases[], sales[], settings, metadata }
```

---

## 5. Autenticação e Segurança

### Firebase Auth
- Método: **Email e senha**
- Registro com campo `displayName` (nome da loja)
- Persistência de sessão automática

### Guards de Rota
| Guard | Comportamento |
|-------|--------------|
| `authGuard` | Redireciona para `/login` se não autenticado |
| `guestGuard` | Redireciona para `/inventory` se já autenticado |

### Regras Firestore (Security Rules)
- Cada usuário lê e escreve apenas em `users/{seu próprio uid}/db/main`
- Nenhum acesso entre usuários diferentes

---

## 6. Modelos de Dados

### `Purchase` — Lote de Compra

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID único (ex: C001) |
| `product` | string | Nome do produto |
| `category` | string | Categoria |
| `supplier` | string | Fornecedor |
| `link` | string | Link do produto (opcional) |
| `purchaseDate` | string | Data da compra (ISO) |
| `receiptDate` | string | Data do recebimento (opcional) |
| `quantityPurchased` | number | Quantidade comprada |
| `unitCost` | number | Custo unitário (R$) |
| `purchaseShipping` | number | Frete da compra |
| `otherCosts` | number | Outros custos do lote |
| `notes` | string | Observações |

### `Sale` — Venda Individual

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID único (ex: V001) |
| `batchId` | string | ID do lote vinculado |
| `product` | string | Nome do produto |
| `quantitySold` | number | Quantidade vendida |
| `unitPrice` | number | Preço de venda unitário |
| `saleDate` | string | Data da venda (ISO) |
| `channel` | string | Canal de venda |
| `feePercentage` | number | Taxa do marketplace (0–1) |
| `shippingType` | 'correios' \| 'flex' | Tipo de frete |
| `sellerShipping` | number | Frete cobrado do comprador |
| `flexRefund` | number | Reembolso flex recebido |
| `discount` | number | Desconto concedido |
| `otherCosts` | number | Outros custos da venda |
| `status` | SaleStatus | Status da venda |
| `notes` | string | Observações |

### `Settings` — Configurações

| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `defaultMlFee` | number | 0.12 | Taxa padrão do marketplace |
| `yellowAlertDays` | number | 25 | Dias para alerta amarelo |
| `redAlertDays` | number | 30 | Dias para alerta vermelho (parado) |
| `minimumMargin` | number | 0.10 | Margem mínima desejada |
| `lowStockAlert` | number | 1 | Limiar de estoque baixo |
| `defaultShipping` | number | 0 | Frete padrão de compra |
| `defaultChannel` | string | 'Mercado Livre' | Canal padrão de venda |
| `categories` | string[] | [] | Lista de categorias |
| `suppliers` | string[] | [] | Lista de fornecedores |
| `channels` | string[] | [] | Lista de canais de venda |

### Status

**`InventoryStatus`**
- `'Em Estoque'` — estoque > 0, dentro do prazo
- `'Atenção'` — estoque > 0, parado entre `yellowAlertDays` e `redAlertDays` dias
- `'Parado'` — estoque > 0, parado há ≥ `redAlertDays` dias
- `'Vendido'` — estoque zerado
- `'Ainda não recebido'` — `receiptDate` não preenchida

**`SaleStatus`**
- `'Concluída'` | `'Cancelada'` | `'Devolvida'` | `'Em disputa'`

---

## 7. Motor de Cálculo

Todas as métricas são derivadas, nunca armazenadas. Calculadas em tempo real via Angular Signals.

### Por Lote (`ComputedPurchase`)

```
totalPurchaseCost   = quantityPurchased × unitCost
totalActualCost     = totalPurchaseCost + purchaseShipping + otherCosts
actualUnitCost      = totalActualCost / quantityPurchased
quantitySold        = soma das quantidades de vendas vinculadas (status ≠ Cancelada/Devolvida)
currentStock        = quantityPurchased − quantitySold
idleValue           = currentStock × actualUnitCost
daysInStock         = dias desde receiptDate (ou purchaseDate) até hoje (ou lastSale se vendido)
status              = determinado por currentStock e daysInStock vs thresholds configurados
averageMargin       = média ponderada das margens das vendas vinculadas
```

### Por Venda (`ComputedSale`)

```
grossRevenue        = quantitySold × unitPrice
feeAmount           = grossRevenue × feePercentage
netRevenue          = grossRevenue − feeAmount − sellerShipping + flexRefund − discount − otherCosts
actualUnitCost      = puxado do lote vinculado
proportionalCost    = quantitySold × actualUnitCost
grossProfit         = grossRevenue − proportionalCost
netProfit           = netRevenue − proportionalCost
netMargin           = netProfit / grossRevenue
```

### KPIs Consolidados (`KpiSummary`)

```
totalInvested       = soma totalActualCost de todos os lotes
idleCapital         = soma idleValue de lotes com estoque > 0
grossRevenue        = soma grossRevenue de vendas Concluídas
netRevenue          = soma netRevenue de vendas Concluídas
totalFees           = soma feeAmount de vendas Concluídas
grossProfit         = soma grossProfit de vendas Concluídas
netProfit           = soma netProfit de vendas Concluídas
netMargin           = netProfit / grossRevenue
totalSold           = soma quantitySold de vendas Concluídas
averageTicket       = grossRevenue / totalSold
```

---

## 8. Telas e Funcionalidades

### 8.1 Login / Cadastro (`/login`)

- Tabs: "Entrar" e "Criar conta"
- **Login:** e-mail + senha, tratamento de erros amigável
- **Cadastro:** nome da loja + e-mail + senha (mín. 6 caracteres)
- Toggle de visibilidade de senha
- Loading state durante requisições Firebase

---

### 8.2 Shell da Aplicação (sidenav)

Layout principal presente em todas as telas autenticadas:

**Sidebar (fixo em desktop, overlay em mobile):**
- Logo + nome do app
- Navegação agrupada em 3 seções:
  - **PRINCIPAL:** Estoque, Dashboard, Análises
  - **REGISTROS:** Compras, Vendas
  - **SISTEMA:** Configurações, Instruções
- Rodapé com status de conexão e contadores (lotes · vendas)

**Topbar:**
- Botão hambúrguer (visível apenas em mobile)
- Nome da loja (do `displayName` do Firebase)
- Toggle de tema (claro/escuro)
- Menu do usuário com logout

---

### 8.3 Estoque — Panorama (`/inventory`)

Visão executiva consolidada. Nenhum dado é preenchido aqui.

**Seção 1: Financeiro Geral** (6 KPI cards)
- Total Investido, Capital Parado, Receita Bruta, Receita Líquida, Lucro Líquido, Margem Líquida

**Seção 2: Estoque em Números** (6 KPI cards)
- Lotes em Estoque, Lotes Vendidos, Qtde. Vendida, Taxas Pagas, Ticket Médio, Total de Lotes

**Seção 3: Posição Detalhada por Lote** (tabela)
- Colunas: ID, Produto, Categoria, Fornecedor, Comprado, Recebido, Custo Unit. Real, Custo Total Real, Qtd., Vendida, Estoque, Capital Parado, Primeira Venda, Última Venda, Margem Média, Status

**Seção 4: Alertas de Estoque Parado**
- Cards para lotes com status "Atenção" e "Parado"

---

### 8.4 Compras (`/purchases`)

Cadastro e gestão de lotes de compra.

**Funcionalidades:**
- Listagem com filtro por texto (produto, ID, categoria) e chips de status
- Totalizadores: Total, Em Estoque, Atenção, Parado, Vendido
- Ações por linha: editar, excluir (bloqueado se houver vendas vinculadas)
- Alerta visual na coluna de data: amarelo (≥ X dias), vermelho (≥ Y dias)

**Formulário de cadastro/edição (dialog):**
- ID do lote (auto-gerado, editável)
- Produto, categoria, fornecedor, link
- Data da compra, data de recebimento
- Quantidade, custo unitário
- Frete da compra, outros custos, observações
- Campos calculados exibidos em tempo real (custo total real, custo unitário real, estoque atual)

---

### 8.5 Vendas (`/sales`)

Registro e gestão de vendas individuais.

**Funcionalidades:**
- Listagem com filtro por texto, canal e status
- Cards de totais: total de vendas, receita bruta, taxas pagas, lucro líquido, margem média
- Indicação visual de taxa customizada (difere do padrão)
- Cor de margem: verde (≥ mínimo), amarelo (abaixo do mínimo), vermelho (negativo)
- Ações por linha: editar, excluir

**Formulário de cadastro/edição (dialog):**
- ID da venda (auto-gerado, editável)
- Seleção de lote (ID + nome do produto)
- Quantidade, preço unitário, data, canal, status
- Taxa do marketplace (pré-preenchida com padrão, editável)
- Tipo de frete (Correios / Flex), frete do vendedor, reembolso flex
- Desconto, outros custos, observações
- Cálculos exibidos em tempo real (receita bruta, líquida, lucro, margem)

---

### 8.6 Dashboard (`/dashboard`)

Gráficos e indicadores consolidados.

**KPI Cards** (6): Total Investido, Capital Parado, Receita Bruta, Lucro Líquido, Margem Líquida, Taxas Pagas

**Gráficos:**
1. **Evolução Mensal** — Linha dupla (Receita Líquida vs Lucro Líquido)
2. **Lucro Líquido por Produto** — Barras verticais (top produtos)
3. **Composição da Receita** — Rosca (5 segmentos: Lucro, Custo, Taxas, Frete, Descontos)
4. **Capital Parado por Lote** — Barras horizontais (top lotes com capital imobilizado)
5. **Comparativo Geral** — Barras agrupadas (6 métricas financeiras)

---

### 8.7 Análises (`/analytics`)

Relatórios tabulares detalhados com 4 abas:

1. **Ranking por Produto** — qty vendida, receita bruta/líquida, custo, lucro bruto/líquido, margem
2. **Por Categoria** — lotes, investido, capital parado, receita, lucro, margem
3. **Evolução Mensal** — qty, receita, taxas, receita líquida, custo, lucro, margem
4. **Estoque Parado** — lotes com estoque > 0, custo unitário, capital parado, dias parado, status

Resumo financeiro consolidado com 10 métricas no topo.

---

### 8.8 Configurações (`/settings`)

Parametrização do sistema.

**Seção 1: Parâmetros do Sistema**
- Taxa L padrão (%)
- Margem líquida mínima (%)
- Dias para alerta amarelo
- Dias para alerta vermelho
- Frete padrão de compra (R$)
- Canal padrão de venda

**Seção 2: Listas**
- Categorias, Fornecedores, Canais de Venda
- Adicionar via chip input, remover por clique, reordenar via drag-and-drop
- Alterações nas listas salvas imediatamente no Firestore

**Seção 3: Importação em Massa** *(oculto em mobile)*
- Download do template Excel (.xlsx) pré-formatado
- Upload de arquivo .xlsx/.xls com dados de compras e vendas
- Dialog de resultado: quantidades importadas + erros encontrados

**Seção 4: Zona de Perigo**
- Botão "Resetar tudo" (apaga compras, vendas e configurações, restaura estado inicial com dados de exemplo)

**Comportamento de salvamento:**
- Alterações nos parâmetros numéricos requerem clicar em "Salvar"
- Alterações nas listas e importações são salvas imediatamente
- Botão "Descartar" reverte para o último estado salvo

---

### 8.9 Instruções (`/instructions`)

Guia de uso do sistema com 10 seções:

1. Estrutura do sistema
2. Como cadastrar uma compra
3. Como registrar uma venda
4. Mesmo produto, preços diferentes
5. Como funciona o ID Lote
6. Como ler a aba Estoque
7. Alertas visuais
8. Parâmetros configuráveis
9. Fluxo do dia a dia
10. Dicas importantes

---

## 9. Componentes Compartilhados

| Componente | Descrição |
|------------|-----------|
| `PageHeaderComponent` | Cabeçalho de tela com ícone, título, subtítulo e slot de ações |
| `KpiCardComponent` | Card de métrica com ícone, valor, nota e variante de cor |
| `StatusBadgeComponent` | Badge de status com cores e labels padronizadas |
| `ConfirmDialogComponent` | Dialog de confirmação para ações destrutivas |
| `ImportResultDialogComponent` | Dialog com resultado da importação em massa |

**Pipes customizados:**

| Pipe | Comportamento |
|------|--------------|
| `BrlPipe` | Formata número como R$ 1.234,56 |
| `BrDatePipe` | Formata data como DD/MM/AAAA |

---

## 10. Serviços

| Serviço | Responsabilidade |
|---------|-----------------|
| `DataService` | Estado central, CRUD, sincronização Firestore |
| `AuthService` | Login, cadastro, logout, estado do usuário |
| `ThemeService` | Toggle claro/escuro, detecção de preferência do sistema |
| `NotifyService` | Toast notifications (success, error, warning, info) |
| `ImportService` | Parsing de XLSX, geração de template, validação de dados |
| `calculations.ts` | Funções puras de cálculo (sem estado) |

---

## 11. Integrações Externas

### Firebase
- **Firebase Auth:** autenticação por e-mail/senha
- **Firestore:** banco de dados NoSQL com sync em tempo real via `onSnapshot`
- Configurado por ambiente (`environment.ts` / `environment.prod.ts`)

### Chart.js + ng2-charts
- Gráficos: linha, barra vertical, barra horizontal, rosca
- Integração com tema do sistema (cores atualizadas via Signals)

### XLSX (SheetJS)
- Download de planilha Excel pré-formatada como template de importação
- Leitura de arquivo .xlsx/.xls para importação de compras e vendas em massa

---

## 12. Requisitos Não-Funcionais

### Responsividade
- Layout 100% responsivo para mobile (375px), tablet (768px) e desktop (1280px+)
- Sidebar fixa em desktop; overlay com botão hambúrguer em mobile
- Tabelas com scroll horizontal em telas pequenas
- KPI cards em grid 2 colunas em mobile
- Seção de Importação em Massa oculta em mobile

### Tema
- Suporte a tema claro e escuro (toggle manual + detecção do sistema operacional)
- Sistema de variáveis CSS (`--clr-*`, `--bg-*`, `--txt-*`, `--brd-*`, `--shadow-*`)
- Sidebar sempre escura independente do tema global

### Performance
- `ChangeDetectionStrategy.OnPush` em todos os componentes
- Lazy loading de todas as rotas
- Computed signals para derivações (sem recálculo desnecessário)
- Dados sincronizados apenas 1 vez por sessão (onSnapshot persistente)

### Internacionalização
- Idioma: Português (Brasil)
- Moeda: Real Brasileiro (R$)
- Formato de data: DD/MM/AAAA
- Separador decimal: vírgula; milhar: ponto

### Acessibilidade
- Atributos `aria-label` em botões de ícone
- Navegação por teclado via Angular Material
- Contraste de cores adequado em ambos os temas

---

## 13. Fases de Desenvolvimento Sugeridas

### Fase 1 — Fundação (1–2 semanas)
- Configuração do projeto Angular + Material + Firebase
- Modelos de dados (`models.ts`)
- `DataService` com Firestore sync
- `AuthService` + guards de rota
- Shell da aplicação (sidenav + topbar)

### Fase 2 — CRUD Core (1–2 semanas)
- Tela de Compras com formulário e tabela
- Tela de Vendas com formulário e tabela
- Motor de cálculo (`calculations.ts`)
- Pipes BRL e data BR
- Componentes compartilhados (PageHeader, KpiCard, StatusBadge, ConfirmDialog)

### Fase 3 — Visualizações (1 semana)
- Tela Estoque (KPIs + tabela + alertas)
- Dashboard (gráficos Chart.js)
- Tela Análises (4 abas de relatórios)

### Fase 4 — Configurações e Importação (1 semana)
- Tela de Configurações completa
- Drag-and-drop nas listas
- Importação em massa via XLSX
- Geração de template Excel

### Fase 5 — Polimento (1 semana)
- Tema claro/escuro com ThemeService
- Tela de Instruções
- Responsividade mobile completa
- Notificações toast
- Tela de Login com design final

### Fase 6 — Deploy e Ajustes (3–5 dias)
- Configuração de ambientes (`environment.ts` / `environment.prod.ts`)
- Build de produção Angular
- Hosting (Firebase Hosting ou equivalente)
- Testes de aceitação em dispositivos reais

---

## 14. Estimativa de Esforço

| Fase | Esforço Estimado |
|------|-----------------|
| Fase 1 — Fundação | 20–30 horas |
| Fase 2 — CRUD Core | 30–40 horas |
| Fase 3 — Visualizações | 20–25 horas |
| Fase 4 — Configurações e Importação | 15–20 horas |
| Fase 5 — Polimento | 15–20 horas |
| Fase 6 — Deploy | 5–8 horas |
| **Total** | **~105–143 horas** |

---

## 15. Glossário

| Termo | Definição |
|-------|-----------|
| **Lote** | Um lote de compra (batch). Agrupa unidades do mesmo produto compradas juntas |
| **ID Lote** | Código único de um lote (ex: C001). Vincula vendas a compras |
| **Taxa L** | Taxa cobrada pelo marketplace sobre a venda (ex: 12% Mercado Livre) |
| **Capital Parado** | Dinheiro imobilizado em produtos ainda em estoque |
| **Custo Unitário Real** | Custo por unidade incluindo frete e outros custos do lote |
| **Margem Líquida** | Lucro líquido dividido pela receita bruta |
| **Frete Flex** | Modalidade de entrega do Mercado Livre com reembolso ao vendedor |
| **Status Parado** | Lote com estoque > 0 e sem venda há ≥ `redAlertDays` dias |
