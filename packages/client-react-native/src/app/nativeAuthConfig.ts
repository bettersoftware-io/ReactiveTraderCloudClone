import Constants from "expo-constants";

/**
 * Simulator-only dev credentials: a `username -> password` map that seeds
 * `AuthSimulator` so offline **simulator** mode (the `Sim` toggle) can log in
 * as any of the four roster users. This never runs against the real deployed
 * server — the real-WS branch (`buildNativePorts`) uses `HttpAuthAdapter`
 * against the server's own `AUTH_USERS` secret, with no baked credentials of
 * any kind. Never log this value.
 *
 * Read from Expo config `extra.devAuth`, baked at build time from
 * `EXPO_PUBLIC_DEV_AUTH` (see `app.config.ts`) as a JSON `username -> password`
 * object — the RN analogue of client-react's `VITE_DEV_AUTH` / `parseDevAuth`
 * (`buildBrowserPorts.ts`). Parsing is tolerant of a missing, malformed, or
 * non-object (e.g. array) value, falling back to all four roster usernames at
 * a shared local dev password so the app still boots into a working simulator
 * login with no env set at all.
 */
const FALLBACK_DEV_CREDENTIALS: Record<string, string> = {
  astark: "mcdc2026",
  nromanoff: "mcdc2026",
  tchalla: "mcdc2026",
  demo: "mcdc2026",
};

function parseDevAuth(raw: string | undefined): Record<string, string> {
  if (raw === undefined || raw === "") {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      },
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

const extra: Record<string, unknown> = Constants.expoConfig?.extra ?? {};

const parsedDevAuth: Record<string, string> = parseDevAuth(
  extra.devAuth as string | undefined,
);

export const DEV_CREDENTIALS: Record<string, string> =
  Object.keys(parsedDevAuth).length > 0
    ? parsedDevAuth
    : FALLBACK_DEV_CREDENTIALS;
