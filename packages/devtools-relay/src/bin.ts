import { createRelayServer } from "#/relayServer";

const DEFAULT_PORT = 8790;

function resolvePort(): number {
  const raw = process.argv[2] ?? process.env.RTC_DEVTOOLS_RELAY_PORT;

  if (raw === undefined) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isNaN(parsed) ? DEFAULT_PORT : parsed;
}

const relay = createRelayServer({ port: resolvePort() });

relay.whenReady.catch((error: unknown): void => {
  console.error("[devtools-relay] failed to start:", error);
  process.exitCode = 1;
});
