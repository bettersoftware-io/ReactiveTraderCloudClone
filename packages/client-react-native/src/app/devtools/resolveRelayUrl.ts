const DEFAULT_RELAY_PORT = 8790;

/** Build the devtools-relay URL from Metro's dev-server host. `hostUri`
 * (expo-constants, e.g. "192.168.1.5:8081" on a device or "localhost:8081" on
 * the simulator) gives the dev machine's reachable address; the relay listens
 * on DEFAULT_RELAY_PORT there. Falls back to localhost when hostUri is absent
 * (e.g. a production build, where the devtools path is never taken anyway). */
export function resolveRelayUrl(hostUri: string | undefined): string {
  const host = hostUri ? (hostUri.split(":")[0] ?? "localhost") : "localhost";

  return `ws://${host}:${DEFAULT_RELAY_PORT}`;
}
