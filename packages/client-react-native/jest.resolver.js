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
// Chain worklets' extension filtering into the options the RN preset
// resolver receives, so both behaviors apply.
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

module.exports = (request, options) => {
  let resolveOptions = options;
  if (
    WORKLETS_PACKAGE_DIR.test(options.basedir) ||
    WORKLETS_REQUEST.test(request)
  ) {
    resolveOptions = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes("native")),
    };
  }
  return reactNativePresetResolver(request, resolveOptions);
};
