module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "#": "./src",
          },
        },
      ],
      // Reanimated worklets — MUST be the last plugin.
      "react-native-worklets/plugin",
    ],
  };
};
