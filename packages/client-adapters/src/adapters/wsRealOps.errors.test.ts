import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

describe("wsReal ops :: nack error paths", () => {
  it("rejects getThroughput on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, {
      preferences: {} as PreferencesPort,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    });
    const promise = firstValueFrom(ports.ops.getThroughput());
    await awaitPendingRpc(ws, "ops.getThroughput");
    ws.nextRpcResponse("ops.getThroughput", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to get throughput/);
    ws.dispose();
  });

  it("rejects setThroughput on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, {
      preferences: {} as PreferencesPort,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    });
    const promise = firstValueFrom(ports.ops.setThroughput(500));
    await awaitPendingRpc(ws, "ops.setThroughput");
    ws.nextRpcResponse("ops.setThroughput", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to set throughput/);
    ws.dispose();
  });
});
