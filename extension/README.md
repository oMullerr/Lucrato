# Extensão Lucrato

Painel de análise de compra dentro do anúncio do Mercado Livre: lucro, margem,
ROI, preço de equilíbrio e quanto dá para pagar ao fornecedor — com a comissão
real da sua categoria, não com um percentual chutado.

A matemática é a mesma de `/calculadora`: os dois lados importam
`src/app/core/pricing/pricing.ts`. Se a extensão tivesse a sua própria conta,
ela poderia prometer um lucro que o painel do Lucrato depois não confirmaria.

## O que a extensão guarda

| Onde | O quê | Vida |
|---|---|---|
| `storage.session` | token de identidade do Lucrato | some ao fechar o navegador |
| `storage.local` | os números que você digita (custo, extras, quantidade) | até você limpar |

**Não guarda** senha, refresh token, nem credencial do Mercado Livre. Quem fala
com a API do Mercado Livre continua sendo a Cloud Function, com os tokens que
nunca saem do servidor.

O frete digitado à mão é de propósito o único campo que **não** é lembrado: ele
é do anúncio, não seu, e levá-lo para o produto seguinte seria um erro difícil
de perceber.

## Como o token chega até ela

A extensão não tem login. Quando precisa da comissão real:

1. o service worker procura uma aba do Lucrato aberta;
2. a ponte injetada nessa aba pede um token ao app, pela própria origem;
3. o app responde **só** com sessão ativa e e-mail verificado — o mesmo portão
   das security rules;
4. o token vale uma hora e é descartado um minuto antes de vencer.

Sem aba do Lucrato aberta, a extensão calcula com a comissão padrão de 12% e
**diz na tela que está estimando**. Ela nunca apresenta um chute como se fosse
número exato.

O token nunca entra na página do Mercado Livre: quem chama a function é o
service worker, e o painel só recebe números de volta.

## Instalar

```bash
npm run build:ext
```

Depois, no Chrome: `chrome://extensions` → ative **Modo do desenvolvedor** →
**Carregar sem compactação** → escolha a pasta `extension/dist`.

## Configurar antes de usar fora do local

Tudo o que muda por ambiente está em [`src/config.ts`](src/config.ts), e o
`build.mjs` gera o manifesto a partir dele — não existem duas listas para
discordarem entre si.

- `ORIGENS_DO_LUCRATO` — onde a ponte de token é injetada. Vem só com
  `http://localhost:4200/*`. Ao usar o deploy, acrescente o endereço **exato**
  (`https://seu-app.vercel.app/*`). Evite `https://*.vercel.app/*`: isso
  injetaria a ponte em todo site hospedado lá.
- `FUNCTIONS_BASE` — aponta para `lucrato-dev`. Troque ao mirar produção.

## Limites conhecidos

- Só páginas de anúncio (`MLB…` na URL). Na busca e no carrinho o painel não
  aparece — de propósito.
- Só `mercadolivre.com.br`. Outros países do Mercado Livre precisariam do site
  correspondente em `ORIGENS_DO_ML`.
- O preço sai do HTML do Mercado Livre, que muda sem aviso. Quando a leitura
  falha, o painel avisa em vez de mostrar um número errado.
