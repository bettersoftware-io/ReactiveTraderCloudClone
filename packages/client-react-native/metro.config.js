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

// 4. Keep test files out of the native bundle — belt-and-braces. Expo Router's
// route context is a `require.context(app/, /* recursive */ true, ...)` whose
// regex (expo-router/_ctx.js) matches ANY source file in `app/` except
// `+api`/`+html`, and its route parser strips EVERY extension, so a co-located
// `app/_layout.test.tsx` normalises to the route name `_layout` and collides
// with the real layout: getRoutesCore throws "The layouts ... conflict on the
// route" at boot (not merely bloat — verified 2026-09-08 by running the real
// parser over the tree). No such file lives in `app/` any more (the layout
// specs sit in `src/app/`, importing the routes via `#app/*`), and grep gate 41
// fails CI if one reappears; this blockList stays so an accidental re-entry
// can never brick `expo export`/`run:ios` again. jest does NOT use Metro, so it
// only affects bundling. Preserve any default blockList Expo set.
const testFilePattern = /.*\.(test|spec)\.[jt]sx?$/;
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, testFilePattern)
  : testFilePattern;

module.exports = config;
