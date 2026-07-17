module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/*.test.tsx"],
  // jest-expo's first non-trivial component mount is very slow on the shared
  // x86 CI runner — whole test files there take 35–40s (vs ~1.5s on arm64
  // local) because every file re-bootstraps the react-native runtime under
  // full monorepo parallelism. That routinely pushes a file's first
  // data-bearing render past jest's 5s default per-test timeout (seen on
  // AnalyticsScreen's first SVG render), even though the render is correct and
  // later renders in the same file pass once the runtime is warm. Raise the
  // per-test budget so this hardware/timing gap can't red the suite.
  testTimeout: 30_000,
  moduleNameMapper: {
    "^#/(.*)$": "<rootDir>/src/$1",
    "^@rtc/domain$": "<rootDir>/../domain/dist/index.js",
    "^@rtc/shared$": "<rootDir>/../shared/dist/index.js",
    "^@rtc/client-core$": "<rootDir>/../client-core/dist/index.js",
    "^@rtc/react-bindings$": "<rootDir>/../react-bindings/dist/index.js",
    "^@rtc/devtools-core$": "<rootDir>/../devtools-core/dist/index.js",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@testing-library/react-native|@react-rxjs/.*|@rx-state/.*|react-native-svg|@expo-google-fonts/.*))",
  ],
};
