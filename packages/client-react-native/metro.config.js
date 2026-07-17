// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so Metro sees workspace-package changes.
config.watchFolders = [workspaceRoot];

// 2. Resolve from app-local AND workspace-root node_modules (pnpm strict layout).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. pnpm symlinks + package "exports" (so @rtc/* resolve to their built dist).
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// 4. Keep test files out of the native bundle. Expo Router's route context is a
// `require.context(app/, /* recursive */ true, /.*\.[tj]sx?$/)` that matches ANY
// source file in `app/` except `+api`/`+html` — so a co-located `app/*.test.tsx`
// (e.g. `_layout.test.tsx`) is treated as a route and pulls
// `@testing-library/react-native` (which requires Node's `console`/`util`) into
// the bundle, breaking `expo export`/`run:ios`. jest does NOT use Metro, so this
// only affects bundling. Preserve any default blockList Expo set.
const testFilePattern = /.*\.(test|spec)\.[jt]sx?$/;
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, testFilePattern)
  : testFilePattern;

module.exports = config;
