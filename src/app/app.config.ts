import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import {
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  provideNativeDateAdapter,
} from '@angular/material/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { provideAppCheck, initializeAppCheck, ReCaptchaEnterpriseProvider } from '@angular/fire/app-check';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getApp } from 'firebase/app';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

registerLocaleData(localePt);

const BR_DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: 'dd/MM/yyyy',
  },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearLabel: { month: 'short', year: 'numeric' },
    dateA11yLabel: { day: '2-digit', month: 'long', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};

const appCheckProvider = environment.recaptchaSiteKey
  ? [
      provideAppCheck(() => initializeAppCheck(getApp(), {
        provider: new ReCaptchaEnterpriseProvider(environment.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      })),
    ]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimations(),
    provideCharts(withDefaultRegisterables()),
    provideNativeDateAdapter(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => initializeFirestore(getApp(), {
      localCache: persistentLocalCache()
    })),
    ...appCheckProvider,
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: MAT_DATE_LOCALE, useValue: 'pt-BR' },
    { provide: MAT_DATE_FORMATS, useValue: BR_DATE_FORMATS },
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: { autoFocus: 'first-tabbable', restoreFocus: true },
    },
  ],
};
