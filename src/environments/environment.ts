/**
 * Ambiente de DESENVOLVIMENTO LOCAL (`npm start`).
 *
 * Aponta para o projeto Firebase de testes (`lucrato-dev`), nunca para a base
 * real: rodar o app na máquina não pode mexer em dado de produção. A produção
 * vem de `environment.prod.ts`, aplicado só no build de produção.
 */
export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSyCztKXhCyCcRvzp2PTIOE48p-pUrSN4UIE",
    authDomain: "lucrato-dev.firebaseapp.com",
    projectId: "lucrato-dev",
    storageBucket: "lucrato-dev.firebasestorage.app",
    messagingSenderId: "151745265552",
    appId: "1:151745265552:web:d61e09d0ffdbdfd21d3d15",
  },
  // App Check desligado no ambiente de testes: chave vazia usa o debug token.
  recaptchaSiteKey: "",
};
