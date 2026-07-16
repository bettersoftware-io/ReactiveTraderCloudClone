import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "RTC Mobile",
  slug: "rtc-mobile",
  scheme: "rtcmobile",
  version: "0.0.0",
  orientation: "portrait",
  // Native app identity. Required by any native build — `expo run:ios`,
  // `expo prebuild`, and every `eas build` profile (incl. the free-path Android
  // APK) — which cannot auto-write these into a dynamic (`app.config.ts`) config.
  // Org-scoped reverse-DNS matching the `bettersoftware-io` GitHub org. NOT used
  // by Expo Go, which ignores native identity. Same id on both platforms.
  ios: { bundleIdentifier: "io.bettersoftware.rtcmobile" },
  android: { package: "io.bettersoftware.rtcmobile" },
  // SDK 55 removed `newArchEnabled` from ExpoConfig — the New Architecture is
  // now the only architecture, so the field no longer exists in the type.
  runtimeVersion: { policy: "appVersion" },
  // Free-path distribution (this task): no EAS Update channel, so no
  // `expo-updates` dependency. Explicit `enabled: false` (rather than
  // omitting `updates`) is required for knip's Expo plugin, which otherwise
  // unconditionally expects `expo-updates` to be installed
  // (`config.updates?.enabled !== false` in its dependency inference).
  updates: { enabled: false },
  // `eas.projectId` is already set in the EXISTING `extra` object below (done —
  // no future step needed there; do NOT add a second `extra` key, that would
  // clobber `serverUrl`/`demoUser`/`demoPass`).
  // EAS Update / OTA (top-level `updates.url` + the `expo-updates` package) is
  // intentionally OUT OF SCOPE under this workstream's free-path distribution
  // policy; the `updates: { enabled: false }` above encodes that. If OTA is ever
  // adopted, it must REPLACE `enabled: false` (e.g. `updates: { url: "..." }`) —
  // never be merged alongside it.
  // `router.root` (in the existing `extra`) pins Expo Router to the real
  // top-level `app/` directory.
  // Without it, Expo Router auto-detects `src/app` (it prefers that layout
  // when present) — which we also have, for the unrelated `src/app/adapters/`
  // port adapters — and mis-treats every file under `src/app/` as a route.
  extra: {
    router: { root: "./app" },
    // `serverUrl` defaults to the deployed Fly endpoint so the demo streams
    // with no env set. The old shared `wsToken` query-param gate is gone —
    // the WS connection now authenticates with a genuine session token
    // (`buildNativePorts`), obtained by auto-login (Task 18) against
    // `demoUser`/`demoPass` below. Both default to the public "demo" roster
    // account so the app boots authenticated with no env set; a real
    // deployed server still requires that pair to exist in its `AUTH_USERS`
    // secret (see the package README) for the real-WS branch to succeed.
    demoUser: process.env.EXPO_PUBLIC_DEMO_USER,
    demoPass: process.env.EXPO_PUBLIC_DEMO_PASS,
    eas: { projectId: "ec0ee21b-52af-4375-bb5d-70c6c52b8c1a" },
  },
  plugins: ["expo-router"],
};

export default config;
