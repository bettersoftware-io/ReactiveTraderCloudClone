import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "RTC Mobile",
  slug: "rtc-mobile",
  scheme: "rtcmobile",
  version: "0.0.0",
  orientation: "portrait",
  // SDK 55 removed `newArchEnabled` from ExpoConfig — the New Architecture is
  // now the only architecture, so the field no longer exists in the type.
  runtimeVersion: { policy: "appVersion" },
  // Filled by `eas init` at the start of Phase 2 (account-bound, run by a human):
  //   updates: { url: "https://u.expo.dev/<projectId>" },
  //   extra: { eas: { projectId: "<uuid from eas init>" } },
  plugins: ["expo-router"],
};

export default config;
