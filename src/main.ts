import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

// Em desenvolvimento, habilita debug token do App Check para
// permitir chamadas Firestore sem registrar o domínio no Firebase Console.
// O token aparece no console do navegador e deve ser registrado em
// Firebase Console → App Check → Apps → Manage debug tokens.
if (!environment.production) {
  (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));
