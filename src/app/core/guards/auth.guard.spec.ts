import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subject, firstValueFrom, isObservable } from 'rxjs';
import { authGuard, guestGuard, verifyEmailGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { NotifyService } from '../services/notify.service';

type EstadoDeAuth = { emailVerified: boolean } | null | undefined;

/**
 * Os guards decidem para onde o usuário vai antes de qualquer tela existir. Se
 * eles pendurarem, o router não completa navegação nenhuma — casca em pé, menu
 * morto. Daí o `timeout()` em todos os três, que estes testes travam.
 */
function montar() {
  const estado$ = new Subject<EstadoDeAuth>();
  const fakeAuth = { currentUser$: estado$.asObservable() } as unknown as AuthService;
  const fakeNotify = { warning: jest.fn(), error: jest.fn(), success: jest.fn(), info: jest.fn() };
  const fakeTranslate = { instant: (k: string) => k } as unknown as TranslateService;

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: fakeAuth },
      { provide: NotifyService, useValue: fakeNotify },
      { provide: TranslateService, useValue: fakeTranslate },
    ],
  });

  return { estado$, fakeNotify, router: TestBed.inject(Router) };
}

/** Roda o guard dentro do contexto de injeção e normaliza para Promise. */
function rodar(guard: typeof authGuard, url = '/inventory'): Promise<boolean | UrlTree> {
  const saida = TestBed.runInInjectionContext(() =>
    guard({} as never, { url } as never),
  );
  return firstValueFrom(saida as Observable<boolean | UrlTree>);
}

const caminho = (r: Router, alvo: boolean | UrlTree) =>
  alvo instanceof UrlTree ? r.serializeUrl(alvo) : alvo;

describe('authGuard', () => {
  afterEach(() => { TestBed.resetTestingModule(); jest.useRealTimers(); });

  it('ignora o `undefined` inicial e decide quando o auth assenta', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(authGuard);

    estado$.next(undefined); // Firebase ainda resolvendo — não pode decidir aqui
    estado$.next({ emailVerified: true });

    expect(caminho(router, await veredito)).toBe(true);
  });

  it('manda para /login quem não está logado', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(authGuard);
    estado$.next(null);

    expect(caminho(router, await veredito)).toBe('/login');
  });

  it('manda para /verify-email quem está logado sem verificar o e-mail', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(authGuard);
    estado$.next({ emailVerified: false });

    expect(caminho(router, await veredito)).toBe('/verify-email');
  });

  it('não fica em loop quando o próprio destino é /verify-email', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(authGuard, '/verify-email');
    estado$.next({ emailVerified: false });

    expect(caminho(router, await veredito)).toBe(true);
  });

  /* Sem isto, auth que não responde congela o router para sempre. */
  it('cai para /login e avisa quando o auth não responde a tempo', async () => {
    jest.useFakeTimers();
    const { router, fakeNotify } = montar();
    const veredito = rodar(authGuard);

    await jest.advanceTimersByTimeAsync(9000);

    expect(caminho(router, await veredito)).toBe('/login');
    expect(fakeNotify.warning).toHaveBeenCalledWith('auth.authTimeout');
  });
});

describe('verifyEmailGuard', () => {
  afterEach(() => { TestBed.resetTestingModule(); jest.useRealTimers(); });

  it('deixa passar quem ainda não verificou', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(verifyEmailGuard, '/verify-email');
    estado$.next({ emailVerified: false });

    expect(caminho(router, await veredito)).toBe(true);
  });

  it('tira da página quem já verificou', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(verifyEmailGuard, '/verify-email');
    estado$.next({ emailVerified: true });

    expect(caminho(router, await veredito)).toBe('/inventory');
  });
});

describe('guestGuard', () => {
  afterEach(() => { TestBed.resetTestingModule(); jest.useRealTimers(); });

  it('deixa o deslogado ver o login', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(guestGuard, '/login');
    estado$.next(null);

    expect(caminho(router, await veredito)).toBe(true);
  });

  it('tira do login quem já está logado', async () => {
    const { estado$, router } = montar();
    const veredito = rodar(guestGuard, '/login');
    estado$.next({ emailVerified: true });

    expect(caminho(router, await veredito)).toBe('/inventory');
  });

  /* Aqui o fallback é o oposto do authGuard: se o auth não responde, mostrar o
     login é o destino seguro — mandar para /inventory renderiza uma tela que o
     authGuard vai derrubar em seguida. */
  it('mostra o login quando o auth não responde a tempo', async () => {
    jest.useFakeTimers();
    const { router } = montar();
    const veredito = rodar(guestGuard, '/login');

    await jest.advanceTimersByTimeAsync(9000);

    expect(caminho(router, await veredito)).toBe(true);
  });
});

describe('contrato dos guards', () => {
  afterEach(() => TestBed.resetTestingModule());

  /* O `toObservable()` morava dentro dos guards e criava um effect NOVO no
     injector raiz a cada navegação, nunca destruído. Agora os guards consomem
     um Observable único, criado uma vez no AuthService. Este teste é o que
     impede alguém de trazer o `toObservable(auth.currentUser)` de volta para cá
     sem perceber o vazamento. */
  it('consomem o Observable compartilhado do AuthService, sem criar o seu', () => {
    const { estado$ } = montar();
    const visto: unknown[] = [];
    estado$.subscribe(v => visto.push(v));

    for (const guard of [authGuard, verifyEmailGuard, guestGuard]) {
      expect(isObservable(TestBed.runInInjectionContext(() =>
        guard({} as never, { url: '/inventory' } as never),
      ))).toBe(true);
    }

    estado$.next(null);
    expect(visto).toEqual([null]);
  });
});
