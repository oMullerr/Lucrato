/**
 * O reporte de erro tem uma obrigação acima de todas: não virar o problema.
 * Uma chamada que lança dentro do ErrorHandler, ou um erro em laço de render
 * que vira mil chamadas, é pior do que continuar cego. Os testes abaixo são
 * quase todos sobre isso.
 */
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { ErrorReporterService } from './error-reporter.service';
import { environment } from '../../../environments/environment';

const chamarMock = jest.fn();

function setup(): ErrorReporterService {
  (httpsCallable as unknown as jest.Mock).mockReturnValue(chamarMock);
  TestBed.configureTestingModule({
    providers: [ErrorReporterService, { provide: Functions, useValue: {} }],
  });
  return TestBed.inject(ErrorReporterService);
}

describe('ErrorReporterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chamarMock.mockResolvedValue({ data: { ok: true } });
    // O serviço só reporta em produção; os testes simulam esse ambiente.
    (environment as { production: boolean }).production = true;
  });

  afterEach(() => {
    (environment as { production: boolean }).production = false;
    TestBed.resetTestingModule();
  });

  it('manda a mensagem, o nome e a URL', () => {
    setup().report(new TypeError('quebrou aqui'));

    expect(chamarMock).toHaveBeenCalledTimes(1);
    const enviado = chamarMock.mock.calls[0][0];
    expect(enviado.message).toBe('quebrou aqui');
    expect(enviado.name).toBe('TypeError');
    expect(typeof enviado.url).toBe('string');
  });

  it('não manda a mesma mensagem duas vezes', () => {
    const reporter = setup();

    reporter.report(new Error('mesma coisa'));
    reporter.report(new Error('mesma coisa'));

    expect(chamarMock).toHaveBeenCalledTimes(1);
  });

  it('para no teto da sessão, mesmo com erros diferentes', () => {
    const reporter = setup();

    for (let i = 0; i < 30; i++) reporter.report(new Error(`erro ${i}`));

    expect(chamarMock).toHaveBeenCalledTimes(5);
  });

  it('não lança quando a chamada falha', () => {
    const reporter = setup();
    chamarMock.mockRejectedValue(new Error('sem rede'));

    expect(() => reporter.report(new Error('qualquer'))).not.toThrow();
  });

  it('não lança nem quando o httpsCallable explode', () => {
    const reporter = setup();
    (httpsCallable as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('Functions não inicializou');
    });

    expect(() => reporter.report(new Error('qualquer'))).not.toThrow();
  });

  it('fica quieto fora de produção — lá o console já mostra', () => {
    (environment as { production: boolean }).production = false;

    setup().report(new Error('em desenvolvimento'));

    expect(chamarMock).not.toHaveBeenCalled();
  });

  it('ignora erro sem mensagem, para não gravar linha vazia', () => {
    setup().report({});

    expect(chamarMock).not.toHaveBeenCalled();
  });

  it('aceita `throw` de texto solto, que também acontece', () => {
    setup().report('deu ruim sem Error');

    expect(chamarMock.mock.calls[0][0].message).toBe('deu ruim sem Error');
  });
});
