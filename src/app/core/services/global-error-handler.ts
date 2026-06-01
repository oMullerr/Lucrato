import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { NotifyService } from './notify.service';
import { firestoreErrorMessage, isChunkLoadError } from './firestore-errors';
import { logError } from './logger';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notify = inject(NotifyService);
  private readonly zone = inject(NgZone);
  private chunkPromptShown = false;

  handleError(error: unknown): void {
    logError('[GlobalErrorHandler]', error);
    const cause = this.unwrap(error);

    if (isChunkLoadError(cause)) {
      if (this.chunkPromptShown) return;
      this.chunkPromptShown = true;
      this.zone.run(() => {
        this.notify.withAction(
          'Nova versão disponível. Recarregue a página.',
          'Recarregar',
          () => globalThis.location?.reload(),
          'warning',
        );
      });
      return;
    }

    if (this.isFirestoreError(cause)) {
      this.zone.run(() => this.notify.error(firestoreErrorMessage(cause)));
      return;
    }

    this.zone.run(() => this.notify.error('Ocorreu um erro inesperado.'));
  }

  private unwrap(error: unknown): unknown {
    const anyErr = error as { rejection?: unknown; cause?: unknown } | null | undefined;
    if (anyErr && typeof anyErr === 'object') {
      if (anyErr.rejection) return anyErr.rejection;
      if (anyErr.cause) return anyErr.cause;
    }
    return error;
  }

  private isFirestoreError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const anyErr = error as { name?: string; code?: string };
    return anyErr.name === 'FirebaseError' || typeof anyErr.code === 'string';
  }
}
