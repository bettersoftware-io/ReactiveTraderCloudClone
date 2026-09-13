// Composes two custom jest resolvers that would otherwise clobber each other
// if assigned directly to jest.config.js's `resolver` field (jest allows only
// one).
//
// - @react-native/jest-preset's resolver deletes the "exports" field from
//   react-native's package.json before delegating to jest's default resolver,
//   restoring legacy (pre-RFC0894) subpath resolution that Metro and much of
//   the RN ecosystem still relies on under jest.
// - react-native-worklets ships `.native.ts` JSI-binding sources. Metro
//   strips that suffix per-platform at bundle time; jest has no such concept,
//   so left alone it picks the native (JSI-backed) file over a jest-safe one
//   and crashes the first time anything imports react-native-reanimated (its
//   mock re-exports from worklets, which requires its own index, which
//   requires the native file). Worklets ships a resolver that filters
//   `.native.` out, but only when resolving inside its own package.
//
// - react-native-reanimated ≥ 4.6.0 has the same shape of problem, one
//   level up. 4.6 split the files that used to branch on
//   `SHOULD_BE_USE_WEB` / `IS_JEST` at runtime into `.native.` / `.web.`
//   variants, and under jest the `.native.` ones win: importing the package
//   (its own `mock` included — it re-exports from `./index`) throws
//   `[Reanimated] setCSSEventHandler is not available in JSReanimated`
//   before `setUpTests()` can run, then `mutables.native` reaches for
//   worklets' `createShareable` (a hard throw on the web build the filter
//   above selects), then `registerEventHandler` / `findHostInstance` once a
//   component mounts. Upstream fixed it by SHIPPING its in-repo jest resolver
//   (software-mansion/react-native-reanimated#10377, merged 2026-09-08): for
//   a fixed list of native-module-dependent files, resolve the web variant.
//   That resolver is not in any published 4.6.x, so its list is replicated
//   here verbatim. DROP CONDITION: once the installed reanimated ships
//   `jest/resolver.js`, delete `REANIMATED_WEB_ONLY_IN_JEST` and chain
//   `require("react-native-reanimated/jest/resolver")` in its place (it
//   chains the worklets resolver itself, so the worklets branch below goes
//   too).
//
// Chain the extension filtering of both into the options the RN preset
// resolver receives, so all three behaviors apply.
const reactNativePresetResolver = require("@react-native/jest-preset/jest/resolver.js");

// Matches only the physical node_modules/react-native-worklets/... resolution
// target, not any basedir/request substring. pnpm encodes peer deps into its
// `.pnpm` hash-suffixed folder names (e.g.
// `expo-modules-core@57.0.2_react-native-worklets@0.10.0_.../node_modules/expo-modules-core`),
// so the naive `.includes("react-native-worklets")` check worklets' own
// resolver uses false-positives on any package that merely peer-depends on
// worklets — that broke expo-router's expo-glass-effect resolution here.
const WORKLETS_PACKAGE_DIR = /[\\/]node_modules[\\/]react-native-worklets[\\/]/;
const WORKLETS_REQUEST = /^react-native-worklets(\/|$)/;

// Same physical-directory match for reanimated, for the same pnpm reason:
// upstream's `options.basedir.includes("react-native-reanimated")` would
// also fire inside e.g. `expo-blur@…_react-native-reanimated@4.6.0/…`.
const REANIMATED_PACKAGE_DIR =
  /[\\/]node_modules[\\/]react-native-reanimated[\\/]/;
// Verbatim from upstream's `jest/resolver.js` at the #10377 merge commit
// (12113efce251e1ca034c6b974845fb8dadf98646). Entries with a `/` match the
// end of the request; bare entries match its basename.
const REANIMATED_WEB_ONLY_IN_JEST = [
  "initializers",
  "mutables",
  "mappers",
  "ConfigHelper",
  "UpdateLayoutAnimations",
  "useAnimatedRef",
  "useAnimatedStyle",
  "WorkletEventHandler",
  "JSPropsUpdater",
  "updateProps",
  "util",
  "css/component/AnimatedComponent",
];

const isReanimatedWebOnlyRequest = (request, basedir) => {
  if (!request.startsWith(".") || !REANIMATED_PACKAGE_DIR.test(basedir)) {
    return false;
  }
  const basename = request.split("/").pop();
  return REANIMATED_WEB_ONLY_IN_JEST.some((entry) =>
    entry.includes("/") ? request.endsWith(entry) : basename === entry,
  );
};

module.exports = (request, options) => {
  let resolveOptions = options;
  if (
    WORKLETS_PACKAGE_DIR.test(options.basedir) ||
    WORKLETS_REQUEST.test(request) ||
    isReanimatedWebOnlyRequest(request, options.basedir)
  ) {
    resolveOptions = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes("native")),
    };
  }
  return reactNativePresetResolver(request, resolveOptions);
};
