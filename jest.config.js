module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {},
  setupFiles: ['./jest.setup.js'],
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  collectCoverageFrom: [
    '**/*.{js,ts}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**',
    '!**/jest.config.js',
    '!**/.github/**'
  ],
  // Setting threshold to 0% initially as we build up test coverage
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  }
};