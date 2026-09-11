import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke de produção: roda contra o que está no ar, depois de cada deploy.
 *
 * Cada asserção aqui corresponde a uma quebra que já aconteceu ou que o mesmo
 * mecanismo torna possível. Em setembro/2026 o app quebrou duas vezes em
 * produção pelo CSP estrangulando o service worker — o reCAPTCHA morreu, as
 * fotos do Mercado Livre sumiram — e nas duas vezes quem descobriu foi o olho
 * do dono. Este arquivo existe para descobrir antes dele.
 *
 * Só a tela de login, de propósito: cobre CSP, service worker, App Check e o
 * bundle sem precisar de credencial em CI.
 */

/** Host permitido pelo `img-src https:` e FORA do `connect-src` do documento.
 *  É o canário da classe: se o worker voltar a ser estrangulado, morre aqui
 *  primeiro, porque o fetch interno dele responde ao connect-src. O avatar de
 *  id 1 do GitHub existe desde 2008 e não depende do nosso lado nenhum. */
const IMAGEM_DE_HOST_NAO_LISTADO = 'https://avatars.githubusercontent.com/u/1?s=48';

/** Mesma conta de scripts/gerar-versao-csp.mjs e de src/csp.spec.ts. */
function versaoDoCsp(csp: string): string {
  return createHash('sha256').update(csp).digest('hex').slice(0, 8);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__violacoesCsp'] = [];
    document.addEventListener('securitypolicyviolation', (evento) => {
      (
        (window as unknown as Record<string, unknown>)['__violacoesCsp'] as string[]
      ).push(`${evento.violatedDirective} bloqueou ${evento.blockedURI}`);
    });
  });
});

async function violacoes(page: Page): Promise<string[]> {
  return page.evaluate(
    () => ((window as unknown as Record<string, unknown>)['__violacoesCsp'] as string[]) ?? [],
  );
}

/** Deixa a página sob o comando do worker, que é o estado real do usuário.
 *  O primeiro acesso registra; é na segunda navegação que o worker assume e
 *  passa a intermediar toda requisição — inclusive as que já quebraram. */
async function comWorkerNoComando(page: Page): Promise<string> {
  await page.goto('/login');
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistrations().then((regs) => regs.length > 0),
    null,
    { timeout: 40_000 },
  );
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 40_000 });
  return page.evaluate(() => navigator.serviceWorker.controller!.scriptURL);
}

test('a tela de login sobe, sem violação de CSP', async ({ page }) => {
  const resposta = await page.goto('/login');

  expect(resposta?.status()).toBe(200);
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  expect(await violacoes(page)).toEqual([]);
});

test('cada recurso recebe um CSP só, e o do worker é outro', async ({ request }) => {
  const cspsDe = async (caminho: string) => {
    const resposta = await request.get(caminho);
    expect(resposta.status()).toBe(200);
    return resposta
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'content-security-policy')
      .map((header) => header.value);
  };

  const documento = await cspsDe('/index.html');
  const worker = await cspsDe('/ngsw-worker.js');

  // Dois CSPs no mesmo recurso valem pela interseção: o app quebraria calado.
  expect(documento).toHaveLength(1);
  expect(worker).toHaveLength(1);
  // O worker precisa do CSP frouxo dele. Se os dois forem iguais, a regra que
  // separa as fontes no vercel.json parou de casar e o bug voltou.
  expect(worker[0]).not.toBe(documento[0]);
  expect(worker[0]).toContain('connect-src https:');
});

test('a versão do worker acompanha o CSP que está no ar', async ({ page, request }) => {
  test.setTimeout(120_000);

  const resposta = await request.get('/index.html');
  const csp = resposta.headers()['content-security-policy'];
  expect(csp, 'documento sem CSP').toBeTruthy();

  const scriptURL = await comWorkerNoComando(page);

  // O CSP do worker congela no dia da instalação; só mudar a URL troca o
  // worker. Se estes dois divergirem, um conserto de CSP não chegou a ninguém.
  expect(scriptURL).toContain(`?csp=${versaoDoCsp(csp)}`);
});

test('o reCAPTCHA Enterprise carrega — App Check tem com que trabalhar', async ({ page }) => {
  await page.goto('/login');

  await page.waitForFunction(
    () => !!(window as unknown as { grecaptcha?: { enterprise?: unknown } }).grecaptcha?.enterprise,
    null,
    { timeout: 40_000 },
  );
  expect(await violacoes(page)).toEqual([]);
});

test('imagem de host fora do connect-src carrega através do worker', async ({ page }) => {
  test.setTimeout(120_000);

  await comWorkerNoComando(page);

  const resultado = await page.evaluate(async (url) => {
    return new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(`ok:${img.naturalWidth}`);
      img.onerror = () => resolve('erro');
      img.src = `${url}&t=${Date.now()}`;
      setTimeout(() => resolve('timeout'), 15_000);
    });
  }, IMAGEM_DE_HOST_NAO_LISTADO);

  expect(resultado, 'o worker voltou a estrangular o que o documento permitiu').toMatch(/^ok:/);
});

test('o bundle principal responde', async ({ request }) => {
  const html = await (await request.get('/index.html')).text();
  const bundle = html.match(/main-[A-Z0-9]+\.js/i);

  expect(bundle, 'não achei o bundle no index.html').not.toBeNull();
  expect((await request.get(`/${bundle![0]}`)).status()).toBe(200);
});
