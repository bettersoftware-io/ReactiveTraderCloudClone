import { firstValueFrom, timeout } from "rxjs";

import {
  createWsRealPorts,
  HttpAuthAdapter,
  InMemorySessionStore,
  WsAdapter,
  wsUrlToHttpBase,
} from "@rtc/client-core";
import { KNOWN_CURRENCY_PAIRS, PreferencesSimulator } from "@rtc/domain";

/**
 * Manual smoke test for the real WS transport against the deployed Fly
 * server. NOT wired into `test`/CI: the server scales to zero, so a cold
 * start (or an unreachable network) would flake a gate. Run by hand:
 *
 *   pnpm build && EXPO_PUBLIC_DEMO_USER=demo EXPO_PUBLIC_DEMO_PASS=<pw> \
 *     pnpm --filter @rtc/client-react-native smoke:ws
 *
 * Node 26 ships a global `WebSocket`, so `WsAdapter` runs unchanged here. The
 * old `EXPO_PUBLIC_WS_TOKEN` query-param gate is gone — the socket now
 * authenticates with a genuine session token obtained by logging in against
 * `HttpAuthAdapter` first (mirrors `buildNativePorts`'s real-WS branch).
 */
async function main(): Promise<void> {
  const url =
    process.env.EXPO_PUBLIC_SERVER_URL ?? "wss://rtc-clone-server.fly.dev";
  const username = process.env.EXPO_PUBLIC_DEMO_USER ?? "demo";
  const password = process.env.EXPO_PUBLIC_DEMO_PASS ?? "demo";
  const auth = new HttpAuthAdapter(wsUrlToHttpBase(url));
  const sessionStore = new InMemorySessionStore();
  const outcome = await firstValueFrom(auth.login(username, password));

  if (!outcome.ok) {
    throw new Error(`login failed: ${outcome.reason}`);
  }

  sessionStore.write({
    token: outcome.token,
    user: outcome.user,
    username,
    exp: Date.now() + 60_000,
  });
  const ws = new WsAdapter(url, () => {
    return sessionStore.read()?.token;
  });

  const ports = createWsRealPorts(ws, {
    preferences: new PreferencesSimulator(),
    auth,
    sessionStore,
  });
  const first = KNOWN_CURRENCY_PAIRS[0];
  const tick = await firstValueFrom(
    ports.pricing
      .getPriceUpdates(first.symbol)
      .pipe(timeout({ first: 15_000 })),
  );
  console.log("live tick:", tick.symbol, tick.bid, tick.ask);
  ws.dispose();
}

main()
  .then((): void => {
    process.exit(0);
  })
  .catch((e: unknown): void => {
    console.error("smoke failed:", e);
    process.exit(1);
  });
