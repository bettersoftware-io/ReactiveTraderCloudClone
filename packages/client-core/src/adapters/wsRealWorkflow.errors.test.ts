import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  AuthSimulator,
  type CreateRfqRequest,
  Direction,
  type PreferencesPort,
} from "@rtc/domain";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

describe("wsRealWorkflow :: error paths", () => {
  function makeReq(): CreateRfqRequest {
    return {
      instrumentId: 1,
      dealerIds: [0],
      quantity: 1000,
      direction: Direction.Buy,
      expirySecs: 60,
    };
  }

  it("rejects createRfq on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, {
      preferences: {} as PreferencesPort,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    });
    const promise = firstValueFrom(ports.workflow.createRfq(makeReq()));
    await awaitPendingRpc(ws, "rpc.createRfq");
    ws.nextRpcResponse("rpc.createRfq", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to create RFQ/);
    ws.dispose();
  });

  it("rejects cancelRfq on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, {
      preferences: {} as PreferencesPort,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    });
    const promise = firstValueFrom(ports.workflow.cancelRfq(1));
    await awaitPendingRpc(ws, "rpc.cancelRfq");
    ws.nextRpcResponse("rpc.cancelRfq", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to cancel RFQ/);
    ws.dispose();
  });

  it("rejects accept on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, {
      preferences: {} as PreferencesPort,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    });
    const promise = firstValueFrom(ports.workflow.accept(1));
    await awaitPendingRpc(ws, "rpc.accept");
    ws.nextRpcResponse("rpc.accept", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to accept quote/);
    ws.dispose();
  });
});
