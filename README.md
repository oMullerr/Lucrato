# 📦 ML Gestão

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

## 🏗️ Arquitetura

```
src/
├── app/
│   ├── core/                      # Lógica central (singletons)
│   │   ├── constants/             # Constantes globais
│   │   ├── models/                # Interfaces de domínio
│   │   └── services/              # Services injetáveis
│   │       ├── theme.service.ts   # Gerencia light/dark mode
│   │       ├── data.service.ts    # Store reativo (signals)
│   │       ├── notify.service.ts  # Wrapper do MatSnackBar
│   │       └── calculations.ts    # Funções puras de cálculo
│   │
│   ├── features/                  # Features (lazy-loaded)
│   │   ├── estoque/               # Página principal
│   │   ├── compras/               # CRUD de lotes
│   │   ├── vendas/                # CRUD de vendas
│   │   ├── dashboard/             # Gráficos
│   │   ├── analises/              # Tabelas de análise
│   │   ├── configuracoes/         # Parâmetros
│   │   └── instrucoes/            # Guia de uso
│   │
│   ├── shared/                    # Reutilizáveis
│   │   ├── components/            # KPI card, header, badge, dialog
│   │   └── pipes/                 # BRL, data BR
│   │
│   ├── app.component.ts           # Shell (sidebar + topbar)
│   ├── app.config.ts              # Provedores
│   └── app.routes.ts              # Rotas com lazy loading
│
├── styles.scss                    # Tema Material + tokens CSS
├── main.ts
└── index.html

public/
├── db.json                        # Dados iniciais (carregados na primeira visita)
└── favicon.svg
```

### Decisões técnicas

- **Standalone components** em todo o projeto (sem NgModules).
- **Signals** para estado reativo (sem RxJS desnecessário).
- **OnPush change detection** em todos os componentes.
- **`inject()` function** em vez de constructor injection.
- **Lazy loading** em todas as rotas via `loadComponent`.
- **Funções puras** para os cálculos (testáveis isoladamente).
- **localStorage** como "banco" — todo o estado vive em `db.json` (carregado na primeira visita) e é persistido localmente.
- **Tema via CSS custom properties** — troca instantânea sem reload.

---

## 💾 "Banco" de dados

O sistema usa um **JSON único** (`public/db.json`) como dado inicial. Após a primeira carga, todo o estado fica no **localStorage** do navegador.

Para resetar: **Configurações → Zona de Perigo → Resetar Sistema**.
Para fazer backup: **Compras → Backup → Exportar dados**.

---

## ☁️ Deploy gratuito (Vercel)

### Opção 1: Via interface

1. Faça push do projeto para o GitHub.
2. Acesse [vercel.com](https://vercel.com), faça login com GitHub.
3. Clique em **Add New → Project**, selecione o repositório.
4. A Vercel detecta o `vercel.json` automaticamente. Clique em **Deploy**.
5. Pronto. Você terá uma URL do tipo `seu-projeto.vercel.app`.

### Opção 2: Via CLI

```bash
npm install -g vercel
vercel login
vercel       # primeira vez (cria o projeto)
vercel --prod # deploy de produção
```

### Configuração

O arquivo `vercel.json` na raiz já está configurado:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist/ml-gestao/browser",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

A regra `rewrites` é essencial para o roteamento SPA do Angular funcionar.

---

## 📝 Scripts úteis

```bash
npm start          # dev server (localhost:4200)
npm run build      # build de produção
npm run watch      # build em modo watch (dev)
```

---

## 🛠️ Stack

- [Angular 18](https://angular.dev) — framework
- [Angular Material 18](https://material.angular.io) — componentes UI
- [Chart.js](https://www.chartjs.org) + [ng2-charts](https://github.com/valor-software/ng2-charts) — gráficos
- [TypeScript 5.5](https://www.typescriptlang.org) — tipagem estrita
- [Inter](https://fonts.google.com/specimen/Inter) — tipografia

---

## 📄 Licença

Uso pessoal/livre.
