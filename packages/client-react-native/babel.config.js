module.exports = (api) => {
  const isTest = api.env("test");
  // api.cache(true) alone would ignore this env-dependent branch; using()
  // keys the cache on isTest so jest and native builds get distinct configs.
  api.cache.using(() => isTest);
  return {
    presets: [
      [
        "babel-preset-expo",
        // babel-preset-expo auto-injects react-native-worklets/plugin (or
        // react-native-reanimated/plugin) itself whenever the package is
        // resolvable — independent of the explicit plugin entry below.
        // Disable both under jest: react-native-reanimated is
        // wholesale-mocked in jest.setup.ts (no real worklets ever run in
        // tests), and the plugin's internal nested Babel transform is
        // incompatible with this workspace's peer-resolved @babel/core 8.x
        // (its bundled @babel/preset-typescript asserts a Babel-7 API). It
        // throws as soon as it meets a real `'worklet'` directive — first hit
        // by react-native-gesture-handler's gestureStateManager.js once
        // GestureHandlerRootView is imported for real (Task 4).
        isTest ? { worklets: false, reanimated: false } : {},
      ],
    ],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "#": "./src",
          },
        },
      ],
      // Reanimated worklets — MUST be the last plugin. Skipped under jest
      // for the same reason as above.
      ...(isTest ? [] : ["react-native-worklets/plugin"]),
    ],
  };
};
