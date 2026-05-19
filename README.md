# 📦 Lucrato

Sistema de gestão de compras, vendas e estoque para vendedores do **Mercado Livre** (e outros marketplaces). Construído em **Angular 18 + Material**, com tema **light/dark**, gráficos interativos e sincronização em tempo real via **Firebase**.

![Angular](https://img.shields.io/badge/Angular-18-DD0031?style=flat-square&logo=angular)
![Material](https://img.shields.io/badge/Material-18-757575?style=flat-square&logo=material-design)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript)
![Firebase](https://img.shields.io/badge/Firebase-10-FFCA28?style=flat-square&logo=firebase)

---

## 🎯 Funcionalidades

- **📦 Estoque** — visão executiva com KPIs, status de cada lote, alertas visuais (amarelo ≥25 dias, vermelho ≥30 dias).
- **🛒 Compras** — cadastro de lotes com cálculo automático de custo total real (custo + frete + outros).
- **💰 Vendas** — registro de cada venda individual, com **taxa ML customizável por venda**, suporte a envio Correios e Flex, vínculo ao lote via ID e cálculo de lucro/margem em tempo real.
- **📈 Dashboard** — gráficos de evolução mensal, ranking de produtos, composição da receita e capital parado.
- **📊 Análises** — resumos por produto, categoria e mês com tabelas detalhadas.
- **⚙️ Configurações** — taxa padrão, margem mínima, dias de alerta, listas editáveis.
- **🌗 Light/Dark mode** com persistência e detecção da preferência do sistema.
- **💾 Backup** — exportação e importação de dados em JSON.
- **🔐 Login por usuário** — cada loja tem seus próprios dados isolados via Firebase Auth.
- **☁️ Sincronização automática** — dados salvos no Firestore, acessíveis em qualquer dispositivo.
- **📱 Responsivo** — funciona em desktop, tablet e mobile.

---

## 🚀 Como rodar

### Pré-requisitos

- Node.js 18.19+ ou 20.11+
- npm 9+
- Projeto Firebase configurado (veja a seção abaixo)

### Instalação e execução

```bash
# 1. Instale as dependências
npm install

# 2. Configure o Firebase (preencha src/environments/environment.ts)

# 3. Rode em modo desenvolvimento
npm start
# Abre em http://localhost:4200

# 4. Build de produção
npm run build
# Gera os arquivos em dist/ml-gestao/browser
```

---

## 🛠️ Stack

- [Angular 18](https://angular.dev) — framework
- [Angular Material 18](https://material.angular.io) — componentes UI
- [Firebase 10](https://firebase.google.com) + [@angular/fire](https://github.com/angular/angularfire) — autenticação e banco de dados em tempo real
- [Chart.js](https://www.chartjs.org) + [ng2-charts](https://github.com/valor-software/ng2-charts) — gráficos
- [TypeScript 5.5](https://www.typescriptlang.org) — tipagem estrita
- [Inter](https://fonts.google.com/specimen/Inter) — tipografia

---

## 🔥 Configuração do Firebase

Este guia explica como conectar o Lucrato ao seu projeto Firebase para habilitar sincronização em tempo real e login de usuários.

### O que você vai precisar

- Conta Google (gmail.com ou similar)
- Node.js 18+ instalado
- Projeto clonado e dependências instaladas (`npm install`)

---

### Passo 1 — Criar o projeto no Firebase

1. Acesse **console.firebase.google.com**
2. Clique em **"Adicionar projeto"**
3. Escolha um nome (ex: `lucrato-minha-loja`)
4. Desative o Google Analytics (opcional) e clique em **Criar projeto**
5. Aguarde a criação e clique em **Continuar**

---

### Passo 2 — Registrar o app Web

1. Na tela inicial do projeto, clique no ícone **`</>`** (Web)
2. Dê um apelido ao app (ex: `lucrato-web`) — **não** marque "Firebase Hosting"
3. Clique em **Registrar app**
4. O Firebase vai exibir um bloco de código com `firebaseConfig`. **Copie esses valores** — você vai precisar deles no Passo 5:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "meu-projeto.firebaseapp.com",
  projectId: "meu-projeto",
  storageBucket: "meu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

5. Clique em **Continuar no console**

---

### Passo 3 — Ativar autenticação por E-mail/Senha

1. No menu lateral do Firebase, clique em **Authentication**
2. Clique na aba **"Sign-in method"**
3. Clique em **"E-mail/senha"**
4. Ative o primeiro interruptor (**E-mail/senha**) e clique em **Salvar**

---

### Passo 4 — Criar o banco de dados Firestore

1. No menu lateral, clique em **Firestore Database**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Começar no modo de produção"** e clique em **Avançar**
4. Selecione a região mais próxima (ex: `southamerica-east1` para São Paulo) e clique em **Ativar**
5. Aguarde a criação do banco

### Configurar as regras de segurança

Após criar o banco:

1. Clique na aba **"Regras"**
2. Substitua o conteúdo pelo seguinte e clique em **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

> Esta regra garante que cada usuário só acessa os seus próprios dados.

---

### Passo 5 — Configurar o app com suas credenciais

1. Abra o arquivo `src/environments/environment.ts` no projeto
2. Substitua os valores placeholder pelos que você copiou no Passo 2:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSy...',
    authDomain: 'meu-projeto.firebaseapp.com',
    projectId: 'meu-projeto',
    storageBucket: 'meu-projeto.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:abc123',
  },
};
```

3. Faça o mesmo no arquivo `src/environments/environment.prod.ts`

---

### Passo 6 — Executar o app

```bash
npm start
```

Abra **http://localhost:4200** no navegador.

- Na primeira vez, você verá a tela de **Login**
- Clique em **"Criar conta"** para registrar seu e-mail, senha e nome da loja
- Após o cadastro, você será redirecionado para o Estoque
- Os dados são salvos automaticamente no Firestore e sincronizados em todos os dispositivos

---

### Estrutura dos dados no Firestore

Cada usuário tem um documento exclusivo no caminho:

```
users/{uid}/db/main
```

---

### Migrar dados existentes do localStorage

Se você tinha dados antes da migração para o Firebase:

1. **Antes** de atualizar o app, exporte os dados em **Configurações → Exportar dados** e salve o JSON
2. Após atualizar e criar sua conta, vá em **Configurações → Importar dados** e carregue o JSON exportado

---

### Build de produção

```bash
npm run build
```

Os arquivos gerados ficam em `dist/`. Podem ser hospedados em qualquer servidor estático (Firebase Hosting, Netlify, Vercel, etc.).

### Deploy com Firebase Hosting (opcional)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

---

## TODO

- Refazer layout e cores
- Versão mobile


## BUGS

- Parâmetros e listas da aba de configuração
