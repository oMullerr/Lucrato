import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NotifyService } from './notify.service';
import { firestoreErrorMessage, isChunkLoadError } from './firestore-errors';
import { logError } from './logger';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notify = inject(NotifyService);
  private readonly zone = inject(NgZone);
  private readonly t = inject(TranslateService);
  private chunkPromptShown = false;

  handleError(error: unknown): void {
    logError('[GlobalErrorHandler]', error);
    const cause = this.unwrap(error);

    if (isChunkLoadError(cause)) {
      if (this.chunkPromptShown) return;
      this.chunkPromptShown = true;
      this.zone.run(() => {
        this.notify.withAction(
          this.t.instant('errors.newVersion'),
          this.t.instant('errors.reload'),
          () => globalThis.location?.reload(),
          'warning',
        );
      });
      return;
    }

    if (this.isFirestoreError(cause)) {
      this.zone.run(() => this.notify.error(this.t.instant(firestoreErrorMessage(cause))));
      return;
    }

    this.zone.run(() => this.notify.error(this.t.instant('errors.unexpected')));
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
