// Learn more: https://docs.expo.dev/guides/monorepo/
import path from "node:path";

import { getDefaultConfig, type MetroConfig } from "expo/metro-config.js";

const projectRoot: string = import.meta.dirname;
const workspaceRoot: string = path.resolve(projectRoot, "../..");

const defaults: MetroConfig = getDefaultConfig(projectRoot);

// Keep test files out of the native bundle — belt-and-braces. Expo Router's
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
const testFilePattern: RegExp = /.*\.(test|spec)\.[jt]sx?$/;
const defaultBlockList: RegExp | RegExp[] | undefined =
  defaults.resolver?.blockList;

const config: MetroConfig = {
  ...defaults,
  // Watch the whole monorepo so Metro sees workspace-package changes.
  watchFolders: [workspaceRoot],
  resolver: {
    ...defaults.resolver,
    // Resolve from app-local AND workspace-root node_modules (pnpm strict
    // layout).
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
      path.resolve(workspaceRoot, "node_modules"),
    ],
    // Package "exports", so @rtc/* resolve to their built dist. (pnpm's
    // symlinks need no flag: Metro follows them by default.)
    unstable_enablePackageExports: true,
    blockList: defaultBlockList
      ? [defaultBlockList, testFilePattern].flat()
      : testFilePattern,
  },
};

export default config;
