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
  testEnvironment: 'jsdom',
};
