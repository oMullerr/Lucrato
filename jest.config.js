/* O app é todo BRT: dias parados, alertas e sparklines são contados por dia
   local, e vários testes cravam `getTimezoneOffset() === 180` como guarda. Sem
   fixar o fuso, eles passam na máquina de quem mora no Brasil e quebram no CI,
   que roda em UTC — foi o que deixou a suíte vermelha por dez dias, escondendo
   qualquer regressão nova. */
process.env.TZ = 'America/Sao_Paulo';

module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/extension/src/**/*.spec.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/app/$1',
  },
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.module.ts',
    '!src/app/**/*.spec.ts',
    '!src/app/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  /**
   * PISO, não meta.
   *
   * O projeto tinha `collectCoverageFrom` configurado e nenhum limiar: a
   * cobertura podia cair a cada PR sem ninguém ver. Os números abaixo são o
   * patamar medido em setembro/2026 (60,63 / 51,61 / 49,04 / 61,95),
   * arredondados para baixo — existem para travar REGRESSÃO, não para perseguir
   * percentual. Subir o piso quando a cobertura subir de verdade é o uso certo;
   * baixá-lo para fazer o CI passar é sinal de que algo entrou sem teste.
   */
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 51,
      functions: 48,
      lines: 61,
    },
  },
  testEnvironment: 'jsdom',
};
