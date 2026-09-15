const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
};

const transformIgnorePatterns = [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
];

/** @type {import('jest').Config} */
module.exports = {
  // The first React Native render in a run pays the transform cost; on a cold CI runner that
  // alone exceeded Jest's 5 s default (run 34934435119). testTimeout is global, not per project.
  testTimeout: 20000,
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/contract/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
      ],
      transform: {
        '^.+\\.[jt]sx?$': 'babel-jest',
      },
      moduleNameMapper,
    },
    {
      displayName: 'expo',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/tests/ui/**/*.test.tsx'],
      moduleNameMapper,
      transformIgnorePatterns,
    },
    {
      displayName: 'web',
      preset: 'jest-expo/web',
      testMatch: ['<rootDir>/tests/web/**/*.web.test.tsx'],
      moduleNameMapper,
      transformIgnorePatterns,
      setupFilesAfterEnv: ['<rootDir>/tests/web/setup.ts'],
    },
  ],
};
