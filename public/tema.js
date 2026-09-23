/*
 * Guarda de tema — roda no <head>, antes do primeiro paint.
 *
 * O CSS já acerta sozinho quem nunca escolheu tema: segue o sistema por
 * `prefers-color-scheme`. O que ele não tem como saber é a ESCOLHA guardada.
 * Sem esta guarda, quem pôs o app no escuro com o sistema no claro via a tela
 * clara piscar até o Angular subir e aplicar `html.dark` (e o inverso também).
 *
 * É um arquivo, e não um <script> inline, por causa do CSP: `script-src 'self'`
 * sem `'unsafe-inline'` bloquearia o inline em produção. Um arquivo da mesma
 * origem passa.
 *
 * A chave precisa bater com APP.themeKey (core/constants/app.constants.ts) —
 * há um teste que confere.
 */
(function () {
  try {
    var t = localStorage.getItem('ml-gestao-theme');
    if (t === 'dark' || t === 'light') document.documentElement.classList.add(t);
  } catch (e) {
    /* Armazenamento bloqueado (aba privada, política do navegador): o CSS
       segue o sistema, que é exatamente o que o app faria sem a escolha. */
  }
})();
