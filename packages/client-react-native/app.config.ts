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
  //   extra: { eas: { projectId: "<uuid from eas init>" }, router: { root: "./app" } },
  // `router.root` pins Expo Router to the real top-level `app/` directory.
  // Without it, Expo Router auto-detects `src/app` (it prefers that layout
  // when present) — which we also have, for the unrelated `src/app/adapters/`
  // port adapters — and mis-treats every file under `src/app/` as a route.
  extra: { router: { root: "./app" } },
  plugins: ["expo-router"],
};

export default config;
