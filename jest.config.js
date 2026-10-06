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
        // The B612 font packages ship .ttf files required straight from their ESM index (as jest-expo's
        // own preset does for the 'expo' project); this project has no Metro, so the font file itself
        // just needs a value, never to be parsed as JS.
        '\\.(ttf|otf)$': require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
        '^.+\\.[jt]sx?$': 'babel-jest',
      },
      transformIgnorePatterns,
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
