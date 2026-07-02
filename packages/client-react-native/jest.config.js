module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/*.test.tsx"],
  moduleNameMapper: {
    "^#/(.*)$": "<rootDir>/src/$1",
    "^@rtc/domain$": "<rootDir>/../domain/dist/index.js",
    "^@rtc/shared$": "<rootDir>/../shared/dist/index.js",
    "^@rtc/client-core$": "<rootDir>/../client-core/dist/index.js",
    "^@rtc/react-bindings$": "<rootDir>/../react-bindings/dist/index.js",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@testing-library/react-native|@react-rxjs/.*|@rx-state/.*|react-native-svg))",
  ],
};
