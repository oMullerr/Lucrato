import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Database } from '../models/models';

/** Payload gravado na API. Espelha o shape do documento Firestore (sem campos derivados). */
export interface DbWritePayload {
  purchases: Database['purchases'];
  sales: Database['sales'];
  settings: Database['settings'];
  metadata: Database['metadata'];
}

/**
 * Cliente HTTP da API .NET. Por enquanto expõe a escrita do documento completo (PUT /api/db);
 * a leitura continua via listener Firestore só-leitura no DataService.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  /** Sobrescreve o documento do usuário. O backend é o único gravador no Firestore. */
  putDb(payload: DbWritePayload): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.baseUrl}/api/db`, payload));
  }
}
