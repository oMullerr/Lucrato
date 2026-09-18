# Lucrato

Painel financeiro do revendedor do Mercado Livre. Responde uma pergunta que o painel do próprio
marketplace não responde: **quanto sobrou de verdade**, depois da comissão real, do frete, do
desconto, da devolução e do custo do lote de onde a unidade saiu.

Angular 18 · design system próprio · Firebase (Auth + Firestore + Cloud Functions) · PWA.

---

## O modelo

Tudo gira em torno de uma premissa: **cada lote de compra tem seu próprio custo, e cada venda
puxa o custo do lote de onde saiu.** Comprar o mesmo produto duas vezes por preços diferentes
gera dois lotes, e o lucro de cada venda depende de qual deles a unidade veio.

```
Compra (lote)  →  custo unitário real = (qtd × custo + frete + outros) / qtd
     ↓
Venda          →  lucro = receita − comissão − frete − desconto − custo do lote
     ↓
Devolução      →  reverte receita proporcionalmente; comissão e frete original ficam como prejuízo
```

Nenhuma métrica é armazenada. Tudo é derivado em tempo real por funções puras em
[`core/services/calculations.ts`](src/app/core/services/calculations.ts), cobertas por testes.

---

## A integração com o Mercado Livre

Somente leitura — o Lucrato **nunca** escreve no Mercado Livre. O cliente HTTP
([`functions/src/ml/client.ts`](functions/src/ml/client.ts)) expõe apenas `GET`, de propósito.

```
Mercado Livre ──webhook + poller (15min)──> Cloud Functions ──> users/{uid}/mlInbox
                                                                        │
                                                              app aberto no navegador
                                                                        ↓
                                                        users/{uid}/db/main  (o razão)
```

A function não escreve no razão: o app grava arrays inteiros e o Firestore não faz transação
offline, então uma escrita do servidor poderia ser sobrescrita em silêncio pela próxima gravação
do navegador. A caixa de entrada é durável, e o app aplica de lá — automaticamente quando o
anúncio já está vinculado e há estoque, e sob sua decisão no resto dos casos.

O que a integração traz: vendas, comissão real por venda, frete do vendedor, devoluções,
anúncios, visitas, reputação, fatura do ML e previsão de liberação do dinheiro.

**O que ela nunca vai trazer:** quanto você pagou ao fornecedor. Por isso a tela de Compras
continua sendo entrada manual — sem lote não há custo, e sem custo não há lucro.

---

## Rodando

Node 20+ e npm 9+.

```bash
npm install
npm start          # http://localhost:4200, aponta para o projeto lucrato-dev
```

| Comando | O que faz |
|---|---|
| `npm test` | Testes do app (Jest, fuso fixado em `America/Sao_Paulo`) |
| `npm run test:functions` | Testes das Cloud Functions |
| `npm run test:rules` | Testes das security rules (precisa do emulador do Firestore) |
| `npm run build` | Build de produção em `dist/ml-gestao/browser` |
| `npm run smoke` | Smoke do Playwright **contra produção** |
| `npm run build:ext` | Extensão de navegador em `extension/dist` |
| `node scripts/audit-mobile.mjs` | Auditoria estática de responsividade |

---

## Estrutura dos dados

```
users/{uid}/db/main        o razão: purchases[], sales[], returns[], settings   (app escreve)
users/{uid}/db/analyses    histórico da calculadora                             (app escreve)
users/{uid}/db/ml          estado da integração                                 (só servidor)
users/{uid}/secret/ml      tokens do Mercado Livre            (negado ao navegador)
users/{uid}/mlInbox        vendas esperando entrar no razão                     (só servidor)
users/{uid}/mlItems        anúncios sincronizados                               (só servidor)
users/{uid}/mlLinks        vínculo anúncio → produto                            (só servidor)
users/{uid}/mlReturns      devoluções vindas do ML                              (só servidor)
users/{uid}/mlBilling      fatura do ML por período                             (só servidor)
users/{uid}/mlPayouts      liberação do dinheiro por pedido                     (só servidor)
users/{uid}/mlOrders       payload cru dos pedidos (auditoria)   (negado ao navegador)
mlIndex/{mlUserId}         mapeia user_id do ML → uid            (negado ao navegador)
```

Quem pode ler o quê está em [`firestore.rules`](firestore.rules), que termina em deny-all
explícito.

---

## Configurando um projeto Firebase do zero

1. **Criar o projeto** em console.firebase.google.com.
2. **Registrar o app Web** (`</>`), sem marcar Firebase Hosting. Copie o `firebaseConfig`.
3. **Authentication** → Sign-in method → ativar **E-mail/senha**.
4. **Firestore Database** → criar em modo de produção, região `southamerica-east1`
   (a mesma das functions — ver [`functions/src/config.ts`](functions/src/config.ts)).
5. **Colar o config** em [`src/environments/environment.ts`](src/environments/environment.ts)
   (dev) e `environment.prod.ts` (produção).
6. **Publicar as rules** pelo CLI, nunca colando no console:

```bash
npx firebase-tools deploy --only firestore:rules --project lucrato-web
```

Para a integração com o Mercado Livre, os segredos do app do DevCenter vão para o Secret
Manager (`ML_CLIENT_ID`, `ML_CLIENT_SECRET`) — nunca para o repositório. As duas URLs não
secretas (`ML_REDIRECT_URI`, `APP_ORIGINS`) ficam em `functions/.env.<projeto>`.

---

## Segurança

| Camada | Onde |
|---|---|
| Isolamento por UID + `email_verified` + validação de formato/tamanho + deny-all | [firestore.rules](firestore.rules) |
| Headers HTTP (CSP, HSTS, X-Frame, nosniff, Referrer, Permissions) | [vercel.json](vercel.json) |
| CSP verificado diretriz por diretriz | [src/csp.spec.ts](src/csp.spec.ts) + [e2e/smoke.spec.ts](e2e/smoke.spec.ts) |
| E-mail verificado obrigatório (guard + rules) | [auth.guard.ts](src/app/core/guards/auth.guard.ts) |
| Senha forte (8+ caracteres, letra + número) | [password-validator.ts](src/app/core/services/password-validator.ts) |
| Recuperação de senha sem enumeração de contas | [forgot-password.dialog.ts](src/app/features/auth/forgot-password.dialog.ts) |
| Re-autenticação antes de trocar senha ou excluir conta | [profile.component.ts](src/app/features/profile/profile.component.ts) |
| OAuth com PKCE, `state` de uso único em transação, TTL de 10 min | [functions/src/ml/oauth.ts](functions/src/ml/oauth.ts) |
| Refresh token de uso único protegido por lock em transação | [functions/src/ml/tokens.ts](functions/src/ml/tokens.ts) |
| Cliente da API do ML só expõe `GET` | [functions/src/ml/client.ts](functions/src/ml/client.ts) |
| Reporte de erro do navegador com alta rigorosa de campos e teto por minuto | [functions/src/client-errors.ts](functions/src/client-errors.ts) |
| Limites de upload XLSX (5 MB, extensão conferida) | [settings.component.ts](src/app/features/settings/settings.component.ts) |

### Checklist do console

Proteções que não moram no código. Fazer no setup e revisar de tempos em tempos:

- [ ] **Proteção contra enumeração de e-mail** — Authentication → Settings.
- [ ] **Restringir a API key Web** — Google Cloud → Credentials → Browser key → HTTP referrers
      (`localhost` + domínio de produção) e só as APIs usadas. A `apiKey` é pública por design;
      a restrição impede reuso de cota a partir de outros domínios.
- [ ] **Point-in-time recovery** no Firestore, e/ou exports agendados para um bucket GCS.
- [ ] **Orçamento com alerta** no Google Cloud Billing — o webhook do ML é um endpoint público.
- [ ] **Republicar as rules** depois de qualquer alteração, testando antes no emulador.

### Notas técnicas

- **`unsafe-inline` em `style-src`**: necessário para os estilos inline do Angular. Os
  **scripts** não permitem `unsafe-inline` nem `unsafe-eval` (só `wasm-unsafe-eval`), que é o
  que importa contra XSS.
- **Service worker e CSP**: o CSP que vale para o worker é o do dia em que ele foi instalado, e
  o arquivo nunca muda byte a byte — então o navegador nunca o reinstala. Por isso a URL do
  worker carrega `?csp=<hash>`, gerado no build por `scripts/gerar-versao-csp.mjs`. Mexeu no
  CSP, a URL muda sozinha e o worker é trocado. Já derrubou a produção duas vezes.
- **Parser de planilha**: a leitura usa a build corrigida do SheetJS (`xlsx` 0.20.x, instalada
  do CDN deles — o registro npm está congelado numa versão com CVE-2023-30533 e CVE-2024-22363).
  O `xlsx-js-style` fica só para **gerar** planilhas estilizadas, caminho que não processa
  entrada não-confiável. Após um clone limpo:
  `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.

---

## Auditoria de setembro/2026

Um mapa de melhorias — segurança, arquitetura, telas redundantes, métricas e layout — foi
levantado e está sendo executado na branch `auditoria/2026-09`.
