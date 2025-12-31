/* eslint-disable */
export default {
  displayName: 'drawnix',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    resources: 'usable',
  },
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  moduleNameMapper: {
    '^canvas$': 'jest-canvas-mock',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/packages/drawnix',
  globals: {
    __APP_VERSION__: '0.0.0-test',
    'import.meta': {
      env: {
        VITE_APP_VERSION: '0.0.0-test',
      },
    },
  },
};
