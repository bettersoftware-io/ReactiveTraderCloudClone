import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "RTC Mobile",
  slug: "rtc-mobile",
  scheme: "rtcmobile",
  version: "0.0.0",
  orientation: "portrait",
  // SDK 57 removed `newArchEnabled` from ExpoConfig — the New Architecture is
  // now the only architecture, so the field no longer exists in the type.
  runtimeVersion: { policy: "appVersion" },
  // EAS Update fields are populated by `eas init` (deferred to Phase 2 start).
  // updates: { url: "https://u.expo.dev/<projectId>" },
  // extra: { eas: { projectId: "<filled by eas init>" } },
  plugins: ["expo-router"],
};

export default config;
