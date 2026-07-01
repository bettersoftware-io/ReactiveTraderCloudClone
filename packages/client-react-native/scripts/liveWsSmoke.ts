import { firstValueFrom, timeout } from "rxjs";

import { buildWsUrl, createWsRealPorts, WsAdapter } from "@rtc/client-core";
import { KNOWN_CURRENCY_PAIRS, PreferencesSimulator } from "@rtc/domain";

/**
 * Manual smoke test for the real WS transport against the deployed Fly
 * server. NOT wired into `test`/CI: the server scales to zero, so a cold
 * start (or an unreachable network) would flake a gate. Run by hand:
 *
 *   pnpm build && pnpm --filter @rtc/client-react-native smoke:ws
 *
 * Node 26 ships a global `WebSocket`, so `WsAdapter` runs unchanged here.
 */
async function main(): Promise<void> {
  const url =
    process.env.EXPO_PUBLIC_SERVER_URL ?? "wss://rtc-clone-server.fly.dev";
  const token = process.env.EXPO_PUBLIC_WS_TOKEN;
  const ws = new WsAdapter(buildWsUrl(url, token));
  const ports = createWsRealPorts(ws, {
    preferences: new PreferencesSimulator(),
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
