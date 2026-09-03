/**
 * Ambiente de TESTES — projeto Firebase separado (`lucrato-dev`).
 *
 * Nada aqui aponta para a base real. Este arquivo alimenta o build `staging`
 * (ver `angular.json`), publicado no projeto de testes da Vercel.
 */
export const environment = {
  production: true,
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
