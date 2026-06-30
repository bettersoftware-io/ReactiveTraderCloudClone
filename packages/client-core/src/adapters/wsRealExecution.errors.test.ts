import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { Direction, type PreferencesPort } from "@rtc/domain";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

describe("wsRealExecution :: error paths", () => {
  it("rejects the Observable when executeTrade RPC returns nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, { preferences: {} as PreferencesPort });
    const promise = firstValueFrom(
      ports.execution.executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.1,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      }),
    );
    await awaitPendingRpc(ws, "rpc.executeTrade");
    ws.nextRpcResponse("rpc.executeTrade", rpcNack());
    await expect(promise).rejects.toThrow(/Trade execution failed/);
    ws.dispose();
  });
});
