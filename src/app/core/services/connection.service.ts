import { Injectable, computed, signal } from '@angular/core';
import type { SnapshotMetadata } from '@angular/fire/firestore';

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'error';

@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly _isOnline = signal(this.detectInitialOnline());
  private readonly _hasPendingWrites = signal(false);
  private readonly _isFromCache = signal(false);
  private readonly _syncError = signal<unknown | null>(null);
  private readonly _persistenceUnavailable = signal(this.detectPersistenceUnavailable());

  readonly isOnline = this._isOnline.asReadonly();
  readonly hasPendingWrites = this._hasPendingWrites.asReadonly();
  readonly isFromCache = this._isFromCache.asReadonly();
  readonly syncError = this._syncError.asReadonly();
  readonly persistenceUnavailable = this._persistenceUnavailable.asReadonly();

  readonly status = computed<ConnectionStatus>(() => {
    if (this._syncError()) return 'error';
    if (!this._isOnline()) return 'offline';
    if (this._hasPendingWrites()) return 'syncing';
    return 'online';
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._isOnline.set(true));
      window.addEventListener('offline', () => this._isOnline.set(false));
    }
  }

  reportSnapshot(metadata: SnapshotMetadata): void {
    this._hasPendingWrites.set(metadata.hasPendingWrites);
    this._isFromCache.set(metadata.fromCache);
  }

  reportSnapshotError(err: unknown): void {
    this._syncError.set(err);
  }

  clearSyncError(): void {
    this._syncError.set(null);
  }

  markPersistenceUnavailable(): void {
    this._persistenceUnavailable.set(true);
  }

  private detectInitialOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  private detectPersistenceUnavailable(): boolean {
    return typeof indexedDB === 'undefined';
  }
}
