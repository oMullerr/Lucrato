export const environment = {
  production: false,
  // Base URL da API .NET (Cloud Run em prod). Em dev aponta para o backend local.
  apiBaseUrl: "http://localhost:8080",
  firebase: {
    apiKey: "AIzaSyAhax_nL7xFNPmAFDOWLNAg3fwTfwMPA48",
    authDomain: "lucrato-web.firebaseapp.com",
    projectId: "lucrato-web",
    storageBucket: "lucrato-web.firebasestorage.app",
    messagingSenderId: "268847059786",
    appId: "1:268847059786:web:818d3a260ea78dd83827b3",
    measurementId: "G-D5ES5KS2PR"
  },
  // Chave pública do reCAPTCHA Enterprise (App Check).
  // Crie em https://console.cloud.google.com/security/recaptcha e cole aqui.
  // Em dev, deixe vazia para usar o debug token (ver main.ts).
  recaptchaSiteKey: "6Ldr8vUsAAAAALuC3ZYw7MkPR_Z8_kxrryNMpozE",
};
