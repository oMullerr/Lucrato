import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { GlobalErrorHandler } from './global-error-handler';
import { NotifyService } from './notify.service';
import { ErrorReporterService } from './error-reporter.service';

function montar() {
  const notify = { error: jest.fn(), warning: jest.fn(), success: jest.fn(), info: jest.fn(), withAction: jest.fn() };
  const reporter = { report: jest.fn() };
  const translate = { instant: (k: string) => k } as unknown as TranslateService;

  TestBed.configureTestingModule({
    providers: [
      GlobalErrorHandler,
      { provide: NotifyService, useValue: notify },
      { provide: ErrorReporterService, useValue: reporter },
      { provide: TranslateService, useValue: translate },
    ],
  });

  return { handler: TestBed.inject(GlobalErrorHandler), notify, reporter };
}

/** Como o zone.js entrega uma Promise rejeitada ao ErrorHandler. */
const comoRejeicao = (rejection: unknown) => ({ rejection, promise: {} });

describe('GlobalErrorHandler', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('View Transition abortada', () => {
    /* `withViewTransitions()` rejeita quando o browser pula a transição —
       navegação em cima de navegação, aba em segundo plano, prefers-reduced-
       motion. É cosmético e não afeta o usuário em nada.
       Deixar isso chegar no handler custava caro nos dois lados: o usuário via
       um toast de "erro inesperado" por uma animação que não rodou, e o reporte
       queimava uma das SÓ CINCO vagas por sessão — calando o erro de verdade,
       que é exatamente o que o reporte foi criado para não deixar acontecer. */
    const abortos = [
      Object.assign(new Error('Transition was aborted because of invalid state'), { name: 'InvalidStateError', code: 11 }),
      Object.assign(new Error('Transition was skipped'), { name: 'AbortError' }),
      Object.assign(new Error('Transition was aborted because document visibility state is hidden'), { name: 'AbortError' }),
    ];

    it.each(abortos)('não avisa o usuário nem gasta reporte: $name', erro => {
      const { handler, notify, reporter } = montar();

      handler.handleError(comoRejeicao(erro));

      expect(notify.error).not.toHaveBeenCalled();
      expect(reporter.report).not.toHaveBeenCalled();
    });
  });

  describe('erros que importam continuam passando', () => {
    it('erro comum vira toast e reporte', () => {
      const { handler, notify, reporter } = montar();

      handler.handleError(new Error('quebrou de verdade'));

      expect(notify.error).toHaveBeenCalledWith('errors.unexpected');
      expect(reporter.report).toHaveBeenCalled();
    });

    it('erro do Firestore usa a mensagem específica', () => {
      const { handler, notify, reporter } = montar();

      handler.handleError(comoRejeicao({ name: 'FirebaseError', code: 'permission-denied' }));

      expect(notify.error).toHaveBeenCalledWith('errors.permissionDenied');
      expect(reporter.report).toHaveBeenCalled();
    });

    it('chunk velho oferece recarregar, uma vez só', () => {
      const { handler, notify } = montar();
      const chunk = Object.assign(new Error('Loading chunk 42 failed'), { name: 'ChunkLoadError' });

      handler.handleError(chunk);
      handler.handleError(chunk);

      expect(notify.withAction).toHaveBeenCalledTimes(1);
      expect(notify.error).not.toHaveBeenCalled();
    });

    /* InvalidStateError que NÃO é de transição não pode ser engolido junto. */
    it('não engole InvalidStateError de outra origem', () => {
      const { handler, notify, reporter } = montar();

      handler.handleError(comoRejeicao(
        Object.assign(new Error('IndexedDB: database connection is closing'), { name: 'InvalidStateError' }),
      ));

      expect(notify.error).toHaveBeenCalled();
      expect(reporter.report).toHaveBeenCalled();
    });
  });
});
