import Constants from "expo-constants";

/**
 * The baked demo credential this app auto-logs-in with — the RN analogue of
 * the removed `EXPO_PUBLIC_WS_TOKEN` WS gate. RN has no login UI (deferred),
 * so `AppRoot` authenticates with this credential on every launch instead of
 * prompting; `LockScreen`'s AUTHENTICATE control re-auths with the same
 * credential to clear the lock. Low-privilege demo account only (roster
 * "demo" / read-only), read from Expo config `extra` (baked at build time via
 * `EXPO_PUBLIC_DEMO_USER`/`EXPO_PUBLIC_DEMO_PASS`, see `app.config.ts`) with
 * safe fallbacks so the app still boots authenticated with no env set.
 */
const extra: Record<string, unknown> = Constants.expoConfig?.extra ?? {};

export const DEMO_USERNAME: string =
  (extra.demoUser as string | undefined) ?? "demo";

export const DEMO_PASSWORD: string =
  (extra.demoPass as string | undefined) ?? "demo";
