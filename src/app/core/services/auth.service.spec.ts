import { TestBed } from '@angular/core/testing';
import { of, BehaviorSubject } from 'rxjs';

// Mock do módulo @angular/fire/auth — todas as funções viram jest.fn()
jest.mock('@angular/fire/auth', () => ({
  Auth: class Auth {},
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  updateProfile: jest.fn(),
  signOut: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  updatePassword: jest.fn(),
  deleteUser: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: {
    credential: jest.fn((email: string, pwd: string) => ({ email, pwd })),
  },
  user: jest.fn(),
}));

import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  user,
} from '@angular/fire/auth';
import { AuthService } from './auth.service';
import { makeFakeUser } from '../../../testing/firebase-mocks';

describe('AuthService', () => {
  let fakeAuth: { currentUser: ReturnType<typeof makeFakeUser> | null };
  let service: AuthService;
  let userSubject: BehaviorSubject<ReturnType<typeof makeFakeUser> | null>;

  function setup(initialUser: ReturnType<typeof makeFakeUser> | null = null) {
    fakeAuth = { currentUser: initialUser };
    userSubject = new BehaviorSubject<ReturnType<typeof makeFakeUser> | null>(initialUser);
    (user as jest.Mock).mockReturnValue(userSubject.asObservable());

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Auth, useValue: fakeAuth },
      ],
    });
    service = TestBed.inject(AuthService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('login', () => {
    it('chama signInWithEmailAndPassword com _auth, email, password', async () => {
      setup();
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: makeFakeUser() });
      await service.login('a@b.com', 'pwd123');
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(fakeAuth, 'a@b.com', 'pwd123');
    });
  });

  describe('register', () => {
    it('chama createUserWithEmailAndPassword e updateProfile com displayName', async () => {
      setup();
      const newUser = makeFakeUser();
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: newUser });
      (updateProfile as jest.Mock).mockResolvedValue(undefined);
      await service.register('a@b.com', 'pwd123', 'Minha Loja');
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(fakeAuth, 'a@b.com', 'pwd123');
      expect(updateProfile).toHaveBeenCalledWith(newUser, { displayName: 'Minha Loja' });
    });
  });

  describe('logout', () => {
    it('chama signOut com _auth', async () => {
      setup();
      (signOut as jest.Mock).mockResolvedValue(undefined);
      await service.logout();
      expect(signOut).toHaveBeenCalledWith(fakeAuth);
    });
  });

  describe('updateStoreName', () => {
    it('lança "not-logged-in" quando currentUser é null', async () => {
      setup(null);
      await expect(service.updateStoreName('Nova Loja')).rejects.toThrow('not-logged-in');
    });

    it('atualiza profile e recarrega quando logado', async () => {
      const fakeUser = makeFakeUser();
      setup(fakeUser);
      (updateProfile as jest.Mock).mockResolvedValue(undefined);
      await service.updateStoreName('Nova Loja');
      expect(updateProfile).toHaveBeenCalledWith(fakeUser, { displayName: 'Nova Loja' });
      expect(fakeUser.reload).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('lança "not-logged-in" quando currentUser é null', async () => {
      setup(null);
      await expect(service.changePassword('old', 'new')).rejects.toThrow('not-logged-in');
    });

    it('lança "not-logged-in" quando user não tem email', async () => {
      setup(makeFakeUser({ email: null }));
      await expect(service.changePassword('old', 'new')).rejects.toThrow('not-logged-in');
    });

    it('reautentica e atualiza senha quando logado', async () => {
      const fakeUser = makeFakeUser();
      setup(fakeUser);
      (reauthenticateWithCredential as jest.Mock).mockResolvedValue(undefined);
      (updatePassword as jest.Mock).mockResolvedValue(undefined);
      await service.changePassword('old', 'new');
      expect(EmailAuthProvider.credential).toHaveBeenCalledWith('test@example.com', 'old');
      expect(reauthenticateWithCredential).toHaveBeenCalled();
      expect(updatePassword).toHaveBeenCalledWith(fakeUser, 'new');
    });
  });

  describe('sendVerificationEmail', () => {
    it('lança "not-logged-in" quando deslogado', async () => {
      setup(null);
      await expect(service.sendVerificationEmail()).rejects.toThrow('not-logged-in');
    });

    it('chama sendEmailVerification quando logado', async () => {
      const fakeUser = makeFakeUser();
      setup(fakeUser);
      (sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
      await service.sendVerificationEmail();
      expect(sendEmailVerification).toHaveBeenCalledWith(fakeUser);
    });
  });

  describe('sendPasswordReset', () => {
    it('chama sendPasswordResetEmail com _auth e email', async () => {
      setup();
      (sendPasswordResetEmail as jest.Mock).mockResolvedValue(undefined);
      await service.sendPasswordReset('user@example.com');
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(fakeAuth, 'user@example.com');
    });
  });

  describe('reloadCurrentUser', () => {
    it('early-return quando deslogado (sem erro)', async () => {
      setup(null);
      await expect(service.reloadCurrentUser()).resolves.toBeUndefined();
    });

    it('chama reload e getIdToken(true) quando logado', async () => {
      const fakeUser = makeFakeUser();
      setup(fakeUser);
      await service.reloadCurrentUser();
      expect(fakeUser.reload).toHaveBeenCalled();
      expect(fakeUser.getIdToken).toHaveBeenCalledWith(true);
    });
  });

  describe('refreshIdToken', () => {
    it('early-return quando deslogado', async () => {
      setup(null);
      await expect(service.refreshIdToken()).resolves.toBeUndefined();
    });

    it('chama getIdToken(true) quando logado', async () => {
      const fakeUser = makeFakeUser();
      setup(fakeUser);
      await service.refreshIdToken();
      expect(fakeUser.getIdToken).toHaveBeenCalledWith(true);
    });
  });

  describe('reauthenticate', () => {
    it('lança "not-logged-in" quando deslogado', async () => {
      setup(null);
      await expect(service.reauthenticate('pwd')).rejects.toThrow('not-logged-in');
    });

    it('lança "not-logged-in" quando user sem email', async () => {
      setup(makeFakeUser({ email: null }));
      await expect(service.reauthenticate('pwd')).rejects.toThrow('not-logged-in');
    });

    it('chama reauthenticateWithCredential quando logado', async () => {
      const fakeUser = makeFakeUser();
      setup(fakeUser);
      (reauthenticateWithCredential as jest.Mock).mockResolvedValue(undefined);
      await service.reauthenticate('pwd');
      expect(EmailAuthProvider.credential).toHaveBeenCalledWith('test@example.com', 'pwd');
      expect(reauthenticateWithCredential).toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('lança "not-logged-in" quando deslogado', async () => {
      setup(null);
      await expect(service.deleteAccount()).rejects.toThrow('not-logged-in');
    });

    it('chama deleteUser quando logado', async () => {
      const fakeUser = makeFakeUser();
      setup(fakeUser);
      (deleteUser as jest.Mock).mockResolvedValue(undefined);
      await service.deleteAccount();
      expect(deleteUser).toHaveBeenCalledWith(fakeUser);
    });
  });

  describe('signals', () => {
    it('currentUser reflete o usuário corrente', () => {
      const fakeUser = makeFakeUser({ displayName: 'Loja X' });
      setup(fakeUser);
      expect(service.currentUser()).toBe(fakeUser);
    });

    it('isLoggedIn é true quando há user e false quando null', () => {
      setup(makeFakeUser());
      expect(service.isLoggedIn()).toBe(true);

      TestBed.resetTestingModule();
      setup(null);
      expect(service.isLoggedIn()).toBe(false);
    });

    it('storeName extrai displayName ou string vazia', () => {
      setup(makeFakeUser({ displayName: 'Loja Z' }));
      expect(service.storeName()).toBe('Loja Z');

      TestBed.resetTestingModule();
      setup(makeFakeUser({ displayName: null }));
      expect(service.storeName()).toBe('');

      TestBed.resetTestingModule();
      setup(null);
      expect(service.storeName()).toBe('');
    });
  });
});
