import { defineConfig, devices } from '@playwright/test';

/**
 * Só o smoke de produção mora aqui. O Jest continua dono de `src/**` e de
 * `extension/src/**` (ver jest.config.js) — os dois não se cruzam.
 *
 * O alvo padrão é a produção de verdade: este teste existe para dizer que o que
 * está no ar está de pé, não para testar um build local. `SMOKE_URL` troca o
 * alvo (preview, staging, ou um servidor local com os headers reais).
 */
export default defineConfig({
  testDir: './e2e',
  /* A rede é a parte instável, não as asserções. Duas tentativas evitam abrir
     chamado por um timeout de CDN; três falhas seguidas são sinal de verdade. */
  retries: 2,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: process.env.SMOKE_URL ?? 'https://lucrato.vercel.app',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
