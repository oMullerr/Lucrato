import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

/**
 * `fetch` no ambiente de teste.
 *
 * O jsdom desta versão não expõe `fetch`, e o SDK de functions do Firebase o
 * referencia já no import — então qualquer spec que, mesmo indiretamente,
 * alcance `ml-integration.service` quebrava antes de rodar o primeiro teste.
 *
 * A alternativa era repetir `jest.mock('@angular/fire/functions', …)` em cada
 * arquivo que tocasse a cadeia, o que resolve o sintoma e volta a doer no
 * próximo import.
 *
 * O stub RECUSA de propósito, em vez de fazer a chamada de verdade: teste
 * unitário que sai na rede é teste que falha por motivo errado, num dia
 * qualquer, por causa de alguém que nem estava no código.
 */
if (!('fetch' in globalThis)) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: (entrada: unknown) =>
      Promise.reject(
        new Error(
          `fetch bloqueado no teste (${String(entrada)}). ` +
            'Dublê o serviço que faz a chamada em vez de sair na rede.',
        ),
      ),
  });
}
