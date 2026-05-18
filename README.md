# 📦 Lucrato

Sistema de gestão de compras, vendas e estoque para vendedores do **Mercado Livre** (e outros marketplaces). Construído em **Angular 18 + Material**, com tema **light/dark**, gráficos interativos e persistência local.

![Angular](https://img.shields.io/badge/Angular-18-DD0031?style=flat-square&logo=angular)
![Material](https://img.shields.io/badge/Material-18-757575?style=flat-square&logo=material-design)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript)

---

## 🎯 Funcionalidades

- **📦 Estoque** — visão executiva com KPIs, status de cada lote, alertas visuais (amarelo ≥25 dias, vermelho ≥30 dias).
- **🛒 Compras** — cadastro de lotes com cálculo automático de custo total real (custo + frete + outros).
- **💰 Vendas** — registro de cada venda individual, com **taxa ML customizável por venda**, vínculo ao lote via ID e cálculo de lucro/margem em tempo real.
- **📈 Dashboard** — gráficos de evolução mensal, ranking de produtos, composição da receita e capital parado.
- **📊 Análises** — resumos por produto, categoria e mês com tabelas detalhadas.
- **⚙️ Configurações** — taxa padrão, margem mínima, dias de alerta, listas editáveis.
- **🌗 Light/Dark mode** com persistência e detecção da preferência do sistema.
- **💾 Backup** — exportação e importação de dados em JSON.
- **📱 Responsivo** — funciona em desktop, tablet e mobile.

---

## 🚀 Como rodar

### Pré-requisitos
- Node.js 18.19+ ou 20.11+
- npm 9+

### Instalação e execução

```bash
# 1. Instale as dependências
npm install

# 2. Rode em modo desenvolvimento
npm start
# Abre em http://localhost:4200

# 3. Build de produção
npm run build
# Gera os arquivos em dist/ml-gestao/browser
```

---

## 🛠️ Stack

- [Angular 18](https://angular.dev) — framework
- [Angular Material 18](https://material.angular.io) — componentes UI
- [Chart.js](https://www.chartjs.org) + [ng2-charts](https://github.com/valor-software/ng2-charts) — gráficos
- [TypeScript 5.5](https://www.typescriptlang.org) — tipagem estrita
- [Inter](https://fonts.google.com/specimen/Inter) — tipografia

---

## TODO

- Dintinção de envio (correio/flex) - caso seja flex, ter o reembolso do frete
- Sistema de login => Firebase
- Adicionar logo
- Import de compras e vendas em massa
- Versão mobile
- Refazer layout e cores

---

## BUGS

- Ao adicionar uma nova compra, quando digita o valor, não esta sendo calculado o valor automatico no fim da pagina
- Listagem das compras não esta vindo em ordem crescente do lote e pelo status (priorizar lote crescente e 'em estoque')
- No formulário de venda, o valor que é colocado no frete do vendedor, desconto/cupom e outros custos, não estão sendo contabilizados no resultado calculado
