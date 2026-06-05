# CLAUDE.md

Orientação para trabalhar neste repositório. Verificado contra o código.

## O que é

**Lucrato** (`ml-gestao`, v1.0.0) — app de **gestão de lucro para revendedores** que
vendem no Mercado Livre e em outros canais (Shopee, Amazon, Instagram, WhatsApp). O
usuário registra **lotes de compra** e **vendas individuais**; o app calcula estoque,
custos reais, margens e KPIs consolidados. Toda a interface e as mensagens são em
**português do Brasil**.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` | `ng serve -o` — dev server e abre o navegador |
| `npm run build` | Build de produção |
| `npm run watch` | Build incremental (`--configuration development`) |
| `npm run lint` | `ng lint` |
| `npm test` | Roda os testes (Jest) |
| `npm run test:watch` | Jest em watch mode |
| `npm run test:coverage` | Jest com cobertura |

Não há `ng test` (Karma) — os testes usam **Jest** (`jest-preset-angular`).

## Stack

- **Angular 18.2** + **Angular Material 18**, componentes **standalone**.
- `ChangeDetectionStrategy.OnPush` + **Angular signals** em toda a app.
- **Firebase** via `@angular/fire` 18: Firestore, Auth, App Check.
- **Chart.js** via `ng2-charts`; **XLSX** (`xlsx` / `xlsx-js-style`) para import/export.
- Locale fixo `pt-BR` (BRL, datas `dd/MM/yyyy`) — configurado em `src/app/app.config.ts`.

## Arquitetura

```
src/app/
  core/         services, guards, models, constants, pipes-de-domínio
    services/   data.service, auth.service, calculations, theme, notify,
                connection, import.service, xlsx-export.service, logger,
                global-error-handler, firestore-errors, quick-actions
    guards/     auth.guard (authGuard/guestGuard/verifyEmailGuard),
                unsaved-changes.guard
    models/     models.ts (Purchase, Sale, Settings, Computed*, KpiSummary, Database)
    constants/  app.constants.ts (APP, CHART_COLORS)
  shared/       components reutilizáveis, pipes (brl, br-date),
                directives (currency-input), i18n (paginator-intl-pt-br)
  features/     uma pasta por rota; cada componente em .ts + .html + .scss separados
                (inventory, purchases, sales, dashboard, analytics, settings,
                 profile, instructions, auth/login, auth/verify-email)
```

Rotas em `src/app/app.routes.ts` (lazy `loadComponent`): default → `/inventory`;
demais: `/purchases`, `/sales`, `/dashboard`, `/analytics`, `/settings`, `/profile`,
`/instructions`, `/login`, `/verify-email`. Quase todas exigem `authGuard`.

Atalhos de teclado (em `app.component.ts`): **`N`** = nova venda, **`Shift+N`** = nova
compra.

## Modelo de dados & sincronização

- **Um único documento Firestore por usuário** em `users/{uid}/db/main`, com o shape de
  `Database` (`purchases`, `sales`, `settings`, `metadata`).
- **`DataService`** (`src/app/core/services/data.service.ts`) é a fonte da verdade:
  - mantém `db` como signal e expõe `computed` (`computedPurchases`, `computedSales`,
    `kpis`);
  - **escrita otimista com rollback** (`update()` aplica local e reverte se o
    `setDoc` falhar);
  - **retry com backoff exponencial** em erro de `onSnapshot`;
  - **cache offline persistente** (`persistentLocalCache`) configurado em `app.config.ts`;
  - sincroniza automaticamente conforme o usuário autenticado (effect sobre
    `auth.currentUser`).
- **Lógica de negócio é pura** e vive em `src/app/core/services/calculations.ts`:
  `calculatePurchase`, `calculateSale`, `calculateKpis`, `nextId`. Não duplicar esses
  cálculos nos componentes — derive a partir dos `computed` do `DataService`.
- IDs sequenciais por prefixo: lotes `C001…`, vendas `V001…` (`nextId`).

## Auth & segurança

- **Firebase Email/Password** (`auth.service.ts`), com nome da loja em `displayName`.
- **Gate de verificação de e-mail**: `verifyEmailGuard` + rota `/verify-email`; as regras
  do Firestore exigem `email_verified == true`.
- Guards: `authGuard`, `guestGuard`, `verifyEmailGuard`, `unsavedChangesGuard`.
- **App Check** (reCAPTCHA Enterprise) ligado em `app.config.ts` quando
  `environment.recaptchaSiteKey` está presente; em dev, `main.ts` ativa o
  `FIREBASE_APPCHECK_DEBUG_TOKEN`.
- **`firestore.rules`** (na raiz): acesso só ao próprio doc, dono verificado, e validação
  de formato/tamanho do documento (`hasOnly([...])`, limites de lista). Deploy via
  `firebase.json` (+ `firestore.indexes.json`).

> Projeto Firebase: `lucrato-web`. A API key web em `src/environments/` é **pública por
> design** — a segurança é feita pelas regras + App Check, não por esconder a chave.
> Passos que dependem do console Firebase (ativar *enforcement* do App Check, backups do
> Firestore, restrição de referrer da API key) não estão no código.

## Convenções

- **Português** em UI, mensagens de erro/sucesso (`NotifyService`) e textos de domínio.
- Formatação: pipe `brl` (moeda) e `br-date` (datas); diretiva `currency-input` para
  campos monetários. Tokens de cor em `CHART_COLORS` (`app.constants.ts`).
- Componentes novos: standalone + `OnPush`, template/estilo em arquivos `.html`/`.scss`
  separados (padrão adotado no refactor recente).
- Erros tratados centralmente por `GlobalErrorHandler`; logging por `logger.ts`;
  mensagens de Firestore traduzidas em `firestore-errors.ts`.

## Testes

- **Jest** + `jest-preset-angular`. Specs ao lado do código (`*.spec.ts`).
- Mocks de Firebase em `src/testing/firebase-mocks.ts`.
- Boa cobertura existente em `calculations`, `data.service`, `auth.service`,
  `import.service`, `xlsx-export.service`, pipes e `password-validator`. Ao mexer em
  lógica de negócio, atualize/escreva specs correspondentes.
