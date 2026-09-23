---
name: lucrato-design
description: Use when touching any visual or textual surface of the Lucrato app — SCSS, tokens, colors, typography, motion, component styling, i18n strings, or empty/error states. Carries the design system's vocabulary, the contrast floor, the motion rules, the copy voice, and the CI constraints that reject common mistakes.
---

# Design do Lucrato

O Lucrato é um instrumento financeiro de uso diário para **um** revendedor de
Mercado Livre. Ele não é um dashboard de apresentação: é onde a pessoa descobre
se ganhou ou perdeu dinheiro. Denso é qualidade; decoração é ruído.

Este arquivo existe porque o conhecimento estava espalhado entre um comentário
de cabeçalho, dois scripts de auditoria e a memória de quem fez. Uma sessão
futura ia redescobrir tudo do zero — ou contrariar sem saber.

## Antes de escrever CSS

```bash
node scripts/audit-mobile.mjs      # celular + acessibilidade
node scripts/audit-contraste.mjs   # contraste calculado, nos dois temas
```

As duas rodam no CI e **falham o build**. Rodar antes de commitar economiza
uma volta.

## Cor

### A regra que organiza tudo

**Superfície é neutra. Cor é significado.** Até setembro/2026 o verde-petróleo
pintava superfície, marca E lucro; três papéis numa cor só não deixam sobrar
contraste para hierarquia nenhuma. A paleta atual ("cédula") vem da família de
notas do real: azul da de 100 para ação, violeta da de 5 para informação,
amarelo da de 20 para atenção, vermelho da de 10 para perigo. Jade para lucro é
a convenção do dinheiro, não cor de nota.

### Nunca escreva cor fora de `_tokens.scss`

Todo componente consome `var(--token)`. Um hex dentro de um `.scss` de
componente é a coisa que mais silenciosamente diverge — o redesenho de
setembro/2026 achou quatro lugares assim, e um deles (`DEFAULT_CATEGORY_COLOR`)
já não batia com token nenhum havia meses.

Se falta um token, **crie o token**, não um hex local.

### Armadilhas que já custaram bug

- **`#ffffff` sobre cor semântica.** No tema escuro a marca e o perigo são
  cores CLARAS. Use `var(--on-brand)` e `var(--on-danger)`.
- **Superfície escura nos dois temas.** A barra lateral e o painel do login não
  invertem. O acento da marca no tema claro é um dourado escuro que ali some —
  use `var(--accent-on-dark)`.
- **Nomes proibidos.** `--accent`, `--success`, `--danger`, `--warning`,
  `--info`, `--text-tertiary` são barrados pelo `audit-mobile.mjs`: não existem
  e viram `inherit` em silêncio. Os reais são `--color-*` e `--brand-*`.
- **Cores de gráfico** saem de `paletaDeGrafico()`, que lê os tokens em tempo de
  execução. A tabela de reserva em `app.constants.ts` é só para jsdom, e um
  teste compara ela com o SCSS valor a valor.

### Temas

Claro em `:root`. Escuro num `@mixin escuro`, aplicado por **dois** caminhos:
`html.dark` (escolha explícita) e `prefers-color-scheme: dark` em
`html:not(.light)` (primeiro paint, antes do Angular subir).

O segundo caminho é o que impede a tela de piscar branco para quem segue o
sistema. Para quem ESCOLHEU um tema diferente do sistema, quem resolve é
`public/tema.js`: o primeiro script do `<head>`, síncrono, que lê
`APP.themeKey` e põe `dark`/`light` no `<html>` antes do primeiro paint.

**Nunca como script inline** no `index.html`: o CSP é `script-src 'self'` sem
`'unsafe-inline'` e o inline seria bloqueado em produção — o app já caiu por
CSP uma vez. Arquivo da mesma origem passa. `src/tema.spec.ts` barra inline e
amarra a chave.

Trocou uma fonte? `src/ngsw-config.spec.ts` confere que ela entrou no cache do
service worker — o gerador descarta em silêncio caminho que não existe, e foi
assim que o Instrument Sans ficou fora do cache na troca de setembro/2026.

Por isso o `ThemeService` marca `html.light` também — sem essa marca, quem tem
sistema escuro e escolheu claro fica preso no escuro.

## Contraste

Piso: **4.5:1** texto corrido, **3:1** texto grande e interface.

Escolher a cor não é o mesmo que conferi-la. `#A06C00` sobre branco passa com
4.6 e `#B8860B` reprova com 4.1 — a diferença não se enxerga. Na primeira
rodada da auditoria, 7 pares escolhidos a dedo reprovaram.

O que a auditoria **não** cobre, e continua exigindo olhar a tela: texto sobre
`--tint-*` (translúcido, depende do que está atrás), texto sobre imagem, e o
que o componente monta com `color-mix()`.

## Tipografia

Três famílias, variáveis, **auto-hospedadas** em `public/fonts/`. Nada de
Google Fonts — o CSP não permite e não há por que abrir.

- `--font-display` — Instrument Sans: títulos e números-herói. Tem eixo de
  largura de **75% a 100%**, então a identidade é CONDENSAR (`94%` títulos,
  `97%` seções, `92%` wordmark). Valor acima de 100% clampa em silêncio — foi
  o que quase apagou a identidade na troca do Archivo (62–125%), sem erro
  nenhum no console.
- `--font-body` — Inter. Afinada para densidade; trocar arrisca regressão em
  cada tabela.
- `--font-mono` — Geist Mono. Ids e dinheiro.

Todo número que o usuário compara em coluna leva `font-variant-numeric:
tabular-nums` — as classes `.num`, `.kpi-value`, `.mono` já fazem isso.

## Movimento

**Animação que explica fica. Animação que decora sai.**

- `prefers-reduced-motion` é respeitado globalmente no `_reset.scss`. Não
  escreva animação que, desligada, deixe algo ilegível.
- Durações e curvas vêm de token (`--dur-fast|base|slow`, `--ease-out`). Número
  solto em `transition` é dívida.
- **Nunca anime linha de tabela.** Com 99 vendas vira enjoo.
- O número-herói conta ao entrar; a régua champanhe sob ele cresce junto. É
  **um** gesto, na tela inicial. O resto da interface fica quieto — é assim que
  ele significa alguma coisa.

## Responsividade

- Breakpoints só por `@include bp.below|above|between`. `@media (max-width:` é
  rejeitado pela auditoria (`_tokens.scss` é a exceção declarada).
- `100dvh`, nunca `100vh`.
- Nada de `min-width` acima de 320px numa caixa: o útil dentro de um card a
  375px é ~307px.
- Alvo de toque de 44px abaixo de `md`. **Meça na tela**, não no papel: três
  componentes prometiam 44 num comentário e sobrescreviam para 32 no bloco de
  celular logo abaixo. E seletor com `app-field ...` dentro de um componente
  nunca casa — o `app-field` pertence a outro escopo de encapsulamento; use
  `:host-context(.field-box)`.
- **Tabela larga precisa de alternativa em celular** (`bp.isMobile()`). Toda
  tela com tabela já tem uma. `RecordCardComponent` é a substituta da linha: por
  padrão um `<button>` que abre o mesmo detalhe; em tela de leitura (Análises,
  Faturamento) vai com `[interactive]="false"`, que desenha um bloco sem botão.
  Se a linha tem um controle — o select de vínculo de Anúncios — o cartão
  padrão não serve: faça um próprio.
- Cabeçalho de tabela ordenável some no celular: a lista precisa de um
  "Ordenar por" (`.mobile-sort`) com as mesmas chaves de tradução.

## Acessibilidade

O `audit-mobile.mjs` barra: controle só com ícone sem `aria-label`, `<img>` sem
`alt`, `(click)` em elemento que o teclado não alcança (precisa de `tabindex`
**e** tecla), e `tabindex` positivo.

Linha de tabela clicável leva `tabindex="0"`, Enter, Espaço (com
`preventDefault`, senão a página rola) e `aria-expanded` — **sem**
`role="button"`: trocar o papel tira a linha da tabela para quem usa leitor de
tela, e perder a estrutura inteira é caro demais para resolver o teclado.

## Texto

Três arquivos em `public/i18n/`, **contagem de chaves idêntica** entre eles.
Verifique antes de commitar.

### A voz

Substantivo concreto do ofício (razão, lote, fatura, teto), uma consequência
real depois do travessão, e o **porquê** em vez da funcionalidade.

> "O resultado de um mês, parado no tempo — com o mês anterior ao lado."
> "O Mercado Livre sabe o que você vendeu, mas não quanto pagou ao fornecedor."
> "Deste total, R$ X vêm de N pedidos que ainda não têm venda no razão. O
> dinheiro entra do mesmo jeito — só falta dar nome a ele."

### O que não escrever

| Não | Sim |
|---|---|
| "Senha atualizada com sucesso." | "Senha alterada." |
| "Ocorreu um erro inesperado." | "Algo deu errado. Tente de novo." |
| "Erro ao salvar. Verifique sua conexão." | "Não deu para salvar. Verifique a conexão e tente de novo." |
| "Seu dashboard ganha vida com dados" | "Sem venda, não há gráfico" |
| "Controla quando o sistema avisa…" | "Quando avisar que um lote encalhou…" |
| "Considere reduzir o preço em ~8%" | "Baixar o preço em ~8% costuma destravar" |
| "Nova Venda" | "Nova venda" |
| "Isso vai apagar PERMANENTEMENTE…" | "Apaga tudo: … Não dá para desfazer." |

Regras: sentence case sempre (nome próprio é exceção); voz ativa, verbo
primeiro; sem "o sistema" como ator; sem "com sucesso"; sem exclamação em texto
de sistema; `…` e não `...`. Estado vazio é convite, não desculpa. Erro diz o
que aconteceu e o que fazer.

Eyebrow já é maiúsculo por CSS (`text-transform: uppercase`) — escreva em
sentence case no JSON.

## Onde as coisas estão

| | |
|---|---|
| Tokens | `src/styles/_tokens.scss` |
| Breakpoints | `src/styles/_breakpoints.scss` |
| Layout e overlays globais | `src/styles/_components.scss` |
| Tipografia e `@font-face` | `src/styles/_typography.scss` |
| Primitivos (18) | `src/app/shared/ui/` |
| Compostos (kpi-card, page-header, empty-state…) | `src/app/shared/components/` |
| Tema | `src/app/core/services/theme.service.ts` |
