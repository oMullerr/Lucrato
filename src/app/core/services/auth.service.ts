import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, user, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _auth = inject(Auth);

  /** Emits `undefined` while Firebase resolves the initial auth state, then `null` (logged out) or `User`. */
  readonly currentUser = toSignal(user(this._auth), { initialValue: undefined });

  readonly isLoggedIn = computed(() => !!this.currentUser());

  readonly storeName = computed(() => this.currentUser()?.displayName ?? '');

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this._auth, email, password);
  }

  async register(email: string, password: string, storeName: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this._auth, email, password);
    await updateProfile(cred.user, { displayName: storeName });
  }

  async logout(): Promise<void> {
    await signOut(this._auth);
  }
}
