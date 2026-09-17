import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  user,
} from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _auth = inject(Auth);

  /** Emits `undefined` while Firebase resolves the initial auth state, then `null` (logged out) or `User`. */
  readonly currentUser = toSignal(user(this._auth), { initialValue: undefined });

  /**
   * Mesma coisa que `currentUser`, em Observable — para quem precisa esperar o
   * estado de auth assentar (os guards).
   *
   * Vive aqui, e não dentro do guard, de propósito: `toObservable()` cria um
   * `effect` no injector onde é chamado. Chamado dentro de um guard, isso era
   * um effect NOVO a cada navegação, registrado no injector raiz e nunca
   * destruído — um vazamento que crescia com o uso do app. Criado uma vez no
   * serviço, é um effect só, pela vida inteira do app.
   */
  readonly currentUser$ = toObservable(this.currentUser);

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

  async updateStoreName(name: string): Promise<void> {
    const u = this._auth.currentUser;
    if (!u) throw new Error('not-logged-in');
    await updateProfile(u, { displayName: name });
    await u.reload();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const u = this._auth.currentUser;
    if (!u || !u.email) throw new Error('not-logged-in');
    const credential = EmailAuthProvider.credential(u.email, currentPassword);
    await reauthenticateWithCredential(u, credential);
    await updatePassword(u, newPassword);
  }

  async sendVerificationEmail(): Promise<void> {
    const u = this._auth.currentUser;
    if (!u) throw new Error('not-logged-in');
    await sendEmailVerification(u);
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this._auth, email);
  }

  async reloadCurrentUser(): Promise<void> {
    const u = this._auth.currentUser;
    if (!u) return;
    await u.reload();
    await u.getIdToken(true);
  }

  async refreshIdToken(): Promise<void> {
    const u = this._auth.currentUser;
    if (!u) return;
    await u.getIdToken(true);
  }

  async reauthenticate(currentPassword: string): Promise<void> {
    const u = this._auth.currentUser;
    if (!u || !u.email) throw new Error('not-logged-in');
    const credential = EmailAuthProvider.credential(u.email, currentPassword);
    await reauthenticateWithCredential(u, credential);
  }

  async deleteAccount(): Promise<void> {
    const u = this._auth.currentUser;
    if (!u) throw new Error('not-logged-in');
    await deleteUser(u);
  }
}
