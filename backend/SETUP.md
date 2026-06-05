# Guia completo — do zero até retomar a Fase 3

Passo a passo de tudo que **você** precisa fazer para colocar as Fases 1-2 no ar
(API .NET no Cloud Run + frontend na Vercel falando com ela) e preparar a Fase 3
(integração Mercado Livre). Siga na ordem. Comandos em **PowerShell** (Windows).

> Legenda: 🖥️ = rodar no terminal · 🌐 = fazer no navegador · ✏️ = editar arquivo.

---

## Parte 0 — Instalar as ferramentas

Já instalado neste projeto: **.NET 10 SDK** e **Node.js/npm**. Faltam duas CLIs.

1. **🖥️ Google Cloud SDK (`gcloud`)** — para deploy no Cloud Run:
   ```powershell
   winget install --id Google.CloudSDK -e
   ```
   ⚠️ **Importante:** depois de instalar, **feche o VS Code inteiro** (não só a aba do
   terminal) e reabra — reabrir só a aba não recarrega o PATH. Confirme:
   ```powershell
   gcloud --version
   ```
   Se ainda assim `gcloud` não for reconhecido (mas a instalação concluiu), recarregue o
   PATH na sessão atual:
   ```powershell
   $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
   gcloud --version
   ```
   O `gcloud` costuma ficar em `C:\Users\<voce>\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin`.

2. **🖥️ Firebase CLI** — para publicar as regras do Firestore:
   ```powershell
   npm install -g firebase-tools
   firebase --version
   ```

3. *(Opcional)* **Docker Desktop** — só se quiser testar a imagem localmente. Não é
   necessário: o Cloud Run constrói a imagem na nuvem a partir do código.

---

## Parte 1 — Preparar o projeto no Google Cloud

1. **🖥️ Fazer login** (abre o navegador):
   ```powershell
   gcloud auth login
   gcloud config set project lucrato-web
   ```

2. **🌐 Conta de faturamento (billing).** O Cloud Run tem free tier, mas o projeto
   precisa de um *billing account* ativo. Em
   <https://console.cloud.google.com/billing> vincule um cartão ao projeto
   `lucrato-web` (não cobra dentro do free tier).

3. **🖥️ Habilitar as APIs necessárias:**
   ```powershell
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com `
     artifactregistry.googleapis.com firestore.googleapis.com `
     secretmanager.googleapis.com
   ```

4. **🖥️ Dar ao Cloud Run acesso ao Firestore.** A conta de serviço padrão do Cloud Run
   precisa do papel de acesso ao Firestore:
   ```powershell
   $proj = "lucrato-web"
   $num  = gcloud projects describe $proj --format="value(projectNumber)"
   gcloud projects add-iam-policy-binding $proj `
     --member "serviceAccount:$num-compute@developer.gserviceaccount.com" `
     --role "roles/datastore.user"
   ```

---

## Parte 2 — Publicar a API no Cloud Run

1. **🖥️ Deploy a partir do código-fonte** (a partir da raiz do projeto; usa o `Dockerfile`):
   ```powershell
   gcloud run deploy lucrato-api `
     --source backend `
     --region southamerica-east1 `
     --allow-unauthenticated `
     --set-env-vars "Firebase__ProjectId=lucrato-web"
   ```
   - A primeira vez pode perguntar para criar um repositório no Artifact Registry → aceite (Y).
   - Ao final, anote a **Service URL** (ex.: `https://lucrato-api-xxxxxxxx.run.app`).

2. **🖥️ Testar que está no ar:**
   ```powershell
   curl https://<SUA-SERVICE-URL>/health
   ```
   Deve responder `{"status":"ok","service":"lucrato-api"}`.

> `--allow-unauthenticated` é necessário de propósito: quem autentica é a própria API
> (token Firebase), não o IAM do Cloud Run. O webhook do Mercado Livre (Fase 3) também
> exige esse endpoint público.

---

## Parte 3 — Configurar o CORS (liberar o frontend)

Troque `<SEU-DOMINIO>` pelo domínio do seu app na Vercel:

```powershell
gcloud run services update lucrato-api --region southamerica-east1 `
  --set-env-vars "Firebase__ProjectId=lucrato-web,Cors__Origins__0=https://<SEU-DOMINIO>.vercel.app,Cors__Origins__1=http://localhost:4200"
```

---

## Parte 4 — Apontar o frontend para a API

1. **✏️ Produção:** em [../src/environments/environment.prod.ts](../src/environments/environment.prod.ts),
   troque o valor de `apiBaseUrl` pela **Service URL** do Cloud Run (sem barra no final).

2. **✏️ Desenvolvimento:** em [../src/environments/environment.ts](../src/environments/environment.ts),
   deixe `http://localhost:8080` (testar contra o backend local) **ou** aponte para o Cloud Run.

3. **🖥️ Build e deploy do frontend na Vercel** (como você já faz hoje):
   ```powershell
   npm run build
   ```
   E faça o deploy normal na Vercel (push para o repositório / `vercel`).

---

## Parte 5 — Publicar as novas regras do Firestore

As regras agora **negam escrita do cliente** (só o backend grava via Admin SDK).

```powershell
firebase login
firebase deploy --only firestore:rules --project lucrato-web
```

---

## Parte 6 — Validar as Fases 1-2 (ponta a ponta)

1. **🖥️ Rodar o backend localmente** (opcional, para testar antes do deploy). Precisa de
   uma credencial do projeto:
   ```powershell
   gcloud auth application-default login
   $env:GOOGLE_APPLICATION_CREDENTIALS = "$env:APPDATA\gcloud\application_default_credentials.json"
   dotnet run --project backend/src/Lucrato.Api
   ```
2. **🌐 No app** (local com `npm start`, ou no domínio da Vercel):
   - Faça login com um usuário de **e-mail verificado**.
   - Crie, edite e exclua uma **compra** e uma **venda**.
3. **🌐 Conferir no Firebase Console** (<https://console.firebase.google.com> → Firestore):
   - O documento `users/{seu-uid}/db/main` deve refletir as mudanças.
   - As gravações chegaram **pela API** (o cliente não escreve mais direto).

Se isso funcionar, **as Fases 1-2 estão validadas**. ✅

---

## Parte 7 — Registrar a aplicação no Mercado Livre (para a Fase 3)

1. **🌐** Acesse <https://developers.mercadolivre.com.br/> → faça login com sua conta ML
   → **Suas aplicações** → **Criar aplicação**.
2. **✏️ Preencha:**
   - **Redirect URI:** `https://<SUA-SERVICE-URL>/api/integrations/ml/callback`
   - **Notificações (webhook / callbacks):** `https://<SUA-SERVICE-URL>/api/integrations/ml/webhook`
   - **Tópicos:** assine **`orders_v2`** e **`shipments`**.
   - **Scopes:** leitura de pedidos/vendas (read/offline_access).
3. **✏️ Anote** o **App ID (client_id)** e o **Client Secret**.
4. **🖥️ Guardar o secret no Secret Manager** (nunca commitar):
   ```powershell
   "SEU_CLIENT_SECRET" | gcloud secrets create ml-client-secret --data-file=-
   ```
   *(Na Fase 3 eu conecto esse secret à API via `--set-secrets`.)*

---

## Parte 8 — Me avise para retomar a Fase 3

Quando tiver concluído, me passe estas informações:

- ✅ **Service URL** do Cloud Run.
- ✅ Confirmação de que `/health` responde e que criar/editar dados no app funciona.
- ✅ **App ID (client_id)** do Mercado Livre (o secret fica só no Secret Manager).
- ✅ Domínio da Vercel (para confirmar o CORS).

Com isso eu retomo a **Fase 3**: fluxo OAuth com o ML, recebimento do webhook de vendas,
e a ingestão automática de cada venda (produto, preço, tarifa, Correios/Flex com reembolso)
com vínculo de lote **FIFO** ou fila **“a confirmar”** — validando os campos reais com
pedidos de teste. Depois seguimos para a **Fase 4** (tela de integração no app).

---

### Resumo rápido dos comandos (depois de tudo instalado)

```powershell
gcloud auth login
gcloud config set project lucrato-web
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com
# IAM Firestore (ver Parte 1.4)
gcloud run deploy lucrato-api --source backend --region southamerica-east1 --allow-unauthenticated --set-env-vars "Firebase__ProjectId=lucrato-web"
# CORS (ver Parte 3) · editar environment.prod.ts · npm run build · deploy Vercel
firebase deploy --only firestore:rules --project lucrato-web
```
