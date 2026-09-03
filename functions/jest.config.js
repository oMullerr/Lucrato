/** Specs das functions e das security rules. O front tem o seu próprio jest.config.js na raiz. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  testTimeout: 20000,
};
