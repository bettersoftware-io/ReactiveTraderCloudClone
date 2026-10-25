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
  // EAS Update: the app's JavaScript is published to Expo's servers, so Expo
  // Go on a phone can open it with no Mac serving it (adopted 2026-10-04 —
  // the earlier free-path policy had this switched off). Publishing costs
  // nothing on the free plan. `sdkVersion` because the runtime is Expo Go's:
  // an update is compatible with whichever Expo Go carries the same SDK.
  runtimeVersion: { policy: "sdkVersion" },
  // `eas.projectId` lives in the EXISTING `extra` object below; the URL here
  // must name the same project. Do NOT add a second `extra` key — that would
  // clobber `serverUrl`/`devAuth`.
  updates: { url: "https://u.expo.dev/ec0ee21b-52af-4375-bb5d-70c6c52b8c1a" },
  // `router.root` (in the existing `extra`) pins Expo Router to the real
  // top-level `app/` directory.
  // Without it, Expo Router auto-detects `src/app` (it prefers that layout
  // when present) — which we also have, for the unrelated `src/app/adapters/`
  // port adapters — and mis-treats every file under `src/app/` as a route.
  extra: {
    router: { root: "./app" },
    // `serverUrl` selects the transport `buildNativePorts` composes:
    //   - a real `wss://`/`ws://` URL  → the WS-real branch (live server)
    //   - empty string                 → the in-process simulator branch
    // Defaults to the deployed endpoint so a distributed build streams live
    // with no env set. The explicit dev scripts drive `EXPO_PUBLIC_SERVER_URL`
    // per mode — `dev:ios:sim` sets it empty (offline), `dev:ios:ws:local`
    // points at `ws://localhost:4000`, `dev:ios:ws:remote` at the deployed
    // endpoint; the `dev:android:*` scripts set the same three values. `??` only catches null/undefined, so an empty string is a
    // deliberate "force simulator" and survives to `buildNativePorts`.
    // The old shared `wsToken` query-param gate is gone — the WS connection
    // now authenticates with a genuine session token (`buildNativePorts`),
    // obtained by signing in through the login screen (`AuthGate` +
    // `LoginScreen`) against the real server's `AUTH_USERS` secret — no
    // credentials are baked for the real-WS branch.
    serverUrl:
      process.env.EXPO_PUBLIC_SERVER_URL ?? "wss://rtc-clone-server.fly.dev",
    // `devAuth` is simulator-mode only: a JSON `username -> password` map
    // (mirroring client-react's `VITE_DEV_AUTH`) so the offline `Sim` toggle
    // can log in as any roster user; see `nativeAuthConfig.ts`, which falls
    // back to all four roster usernames at a shared dev password when unset.
    devAuth: process.env.EXPO_PUBLIC_DEV_AUTH,
    eas: { projectId: "ec0ee21b-52af-4375-bb5d-70c6c52b8c1a" },
  },
  // React Compiler (ADR-003). `babel-preset-expo@57` injects
  // `babel-plugin-react-compiler` from this flag, so `babel.config.mts` needs no
  // entry — and the worklets plugin stays last, as that file requires.
  // Without this flag RN runs NO auto-memoization, which is why manual
  // `useMemo`/`useCallback` were load-bearing here until this change.
  experiments: { reactCompiler: true },
  plugins: ["expo-router"],
};

export default config;
