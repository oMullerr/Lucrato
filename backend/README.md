# Lucrato API (.NET 10)

Backend dedicado do Lucrato. Move a regra de negócio, a autenticação e o acesso ao
Firestore para fora do navegador, e (na Fase 3) integra com o Mercado Livre.

> Frontend Angular continua na Vercel; esta API roda no **Google Cloud Run**.

## Estrutura

| Projeto | Papel |
| --- | --- |
| `Lucrato.Domain` | Modelos puros (`Purchase`, `Sale`, `Settings`, `Computed*`, `KpiSummary`, `Database`). |
| `Lucrato.Application` | Regra de negócio (`Calculations`, `DataComposition`), abstrações (`IDatabaseRepository`, `IFirebaseTokenVerifier`). |
| `Lucrato.Infrastructure` | Firestore (Admin SDK) + verificação de token Firebase. |
| `Lucrato.Api` | Web API, autenticação Bearer, controllers, CORS. |
| `Lucrato.Tests` | xUnit — paridade da regra de negócio com `calculations.ts`. |

## Rodar local

Credenciais via **Application Default Credentials**. Em dev, aponte para uma chave de
service account do projeto `lucrato-web`:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\caminho\para\service-account.json"
dotnet run --project src/Lucrato.Api
```

- `GET /health` — público, sem auth.
- `GET /api/db` — exige `Authorization: Bearer <Firebase ID token>` com e-mail verificado.

Sem credenciais, `/health` ainda responde 200 (a verificação de token é preguiçosa).

## Testes

```powershell
dotnet test
```

## Deploy no Cloud Run

Pré-requisitos: `gcloud` autenticado no projeto `lucrato-web`.

```powershell
# Build + push + deploy a partir do código-fonte (usa o Dockerfile):
gcloud run deploy lucrato-api `
  --source backend `
  --region southamerica-east1 `
  --allow-unauthenticated `
  --set-env-vars "Firebase__ProjectId=lucrato-web,Cors__Origins__0=https://<seu-dominio-vercel>"
```

- A conta de serviço do Cloud Run precisa do papel **Cloud Datastore User** (acesso ao Firestore).
- `--allow-unauthenticated` é necessário: a autenticação é feita pela própria API (token Firebase),
  não pelo IAM do Cloud Run. O webhook do Mercado Livre (Fase 3) também precisa do endpoint público.
- Segredos do Mercado Livre (Fase 3) entram via **Secret Manager** (`--set-secrets`).
