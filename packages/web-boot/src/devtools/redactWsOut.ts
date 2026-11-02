/** `CLIENT_MSG.JARVIS_KEY`. Spelled out because web-boot does not depend on
 * `@rtc/shared`; the `buildBrowserPorts` own-key test drives the real
 * `WsJarvisAdapter` through this redaction, so a drift in the name fails it. */
const JARVIS_KEY_FRAME = "jarvis.key";

interface ActionPayload {
  readonly action?: unknown;
}

/** What the devtools hub may see of an outbound frame. A `jarvis.key` frame
 * carries a person's model key, so the hub gets only its `action` and a
 * `redacted` flag, whatever else the payload holds. Every other frame is
 * reported as sent. `devtools-core` imports no `@rtc` package, so this lives
 * here and is handed to `instrumentWsAdapter` as its `redactOut`. */
export function redactWsOut(type: string, payload: unknown): unknown {
  if (type !== JARVIS_KEY_FRAME) {
    return payload;
  }

  const action =
    typeof payload === "object" && payload !== null
      ? (payload as ActionPayload).action
      : undefined;

  return typeof action === "string"
    ? { action, redacted: true }
    : { redacted: true };
}
