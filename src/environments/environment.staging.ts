/**
 * Ambiente de TESTES — projeto Firebase separado (`lucrato-dev`).
 *
 * Nada aqui aponta para a base real. Este arquivo alimenta o build `staging`
 * (ver `angular.json`), publicado no projeto de testes da Vercel.
 *
 * PREENCHER: copie as chaves em
 * console.firebase.google.com → lucrato-dev → Configurações do projeto → Seus apps → Web.
 */
export const environment = {
  production: true,
  firebase: {
    apiKey: "PREENCHER_lucrato_dev",
    authDomain: "lucrato-dev.firebaseapp.com",
    projectId: "lucrato-dev",
    storageBucket: "lucrato-dev.firebasestorage.app",
    messagingSenderId: "PREENCHER_lucrato_dev",
    appId: "PREENCHER_lucrato_dev",
  },
  // App Check desligado no ambiente de testes: chave vazia usa o debug token.
  recaptchaSiteKey: "",
};
