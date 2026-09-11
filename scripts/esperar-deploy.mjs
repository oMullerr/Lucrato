/**
 * Espera a Vercel publicar um commit, para o smoke rodar contra a versão certa.
 *
 * Uso:
 *   node scripts/esperar-deploy.mjs <sha>
 *
 * Precisa de GH_TOKEN (ou GITHUB_TOKEN) e GITHUB_REPOSITORY no ambiente — o
 * workflow já fornece os dois.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ASSIM
 *
 * A Vercel avisa o GitHub por *commit status*, não por deployment. Isso foi
 * conferido na mão: `GET /deployments?ref=<branch>` volta vazio, enquanto
 * `GET /commits/<sha>/status` traz o contexto "Vercel". Por isso o gatilho
 * `on: deployment_status` não serve aqui.
 *
 * Sem esta espera, o smoke correria contra a versão ANTERIOR e passaria feliz
 * justamente no deploy que quebrou — pior que não ter smoke, porque mente.
 *
 * LIMITE CONHECIDO: o contexto do status é "Vercel" tanto para produção quanto
 * para preview. Quando o mesmo commit está numa branch e na main — um
 * fast-forward, por exemplo — a preview pode ficar pronta antes, e a espera
 * libera cedo. O sintoma seria um smoke verde medindo a produção anterior.
 * Distinguir os dois exige token da Vercel; enquanto o custo não se justificar,
 * fica registrado aqui em vez de escondido.
 */
const [, , sha] = process.argv;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const INTERVALO_MS = 15_000;
const LIMITE_MS = 15 * 60_000;
/** Se a Vercel não der sinal nenhum nesse tempo, o problema é o encanamento. */
const LIMITE_SEM_SINAL_MS = 4 * 60_000;

if (!sha || !repo || !token) {
  console.error('faltou sha, GITHUB_REPOSITORY ou GH_TOKEN');
  process.exit(1);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function statusesDaVercel() {
  const resposta = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lucrato-smoke',
    },
  });

  if (!resposta.ok) {
    throw new Error(`GitHub respondeu ${resposta.status} ao listar status do commit`);
  }

  const { statuses = [] } = await resposta.json();
  return statuses.filter((s) => (s.context || '').toLowerCase().includes('vercel'));
}

const inicio = Date.now();
let viSinal = false;

while (Date.now() - inicio < LIMITE_MS) {
  const vercel = await statusesDaVercel();

  if (vercel.length > 0) viSinal = true;

  const quebrou = vercel.find((s) => s.state === 'failure' || s.state === 'error');
  if (quebrou) {
    console.error(`deploy da Vercel falhou (${quebrou.context}): ${quebrou.target_url}`);
    process.exit(1);
  }

  const pendente = vercel.some((s) => s.state === 'pending');
  const publicou = vercel.some((s) => s.state === 'success');

  if (publicou && !pendente) {
    /* O status vem antes do alias apontar. Uns segundos evitam medir o deploy
       anterior e acusar falha que não existe. */
    await espera(10_000);
    console.log(`deploy publicado em ${Math.round((Date.now() - inicio) / 1000)}s`);
    process.exit(0);
  }

  if (!viSinal && Date.now() - inicio > LIMITE_SEM_SINAL_MS) {
    console.error(
      'a Vercel não reportou nenhum status para este commit. Se ela passou a avisar ' +
        'de outro jeito, este script precisa mudar — o plano B é buildar aqui e esperar ' +
        'a produção servir o mesmo main-*.js.',
    );
    process.exit(1);
  }

  await espera(INTERVALO_MS);
}

console.error('a Vercel não terminou de publicar dentro do limite');
process.exit(1);
