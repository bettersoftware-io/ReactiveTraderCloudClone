import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { rpcAck } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

/**
 * Success (ack) outcomes for the void-returning workflow/admin RPC ports: an
 * acked command emits `undefined` and completes. The nack and transport-reject
 * arms live in the *.errors.test.ts files; this pins the happy path so all
 * three outcomes of each command are observed.
 */
describe("wsReal void RPC ports :: ack emits undefined and completes", () => {
  async function expectAckCompletes(
    subscribe: (
      ports: ReturnType<typeof createWsRealPorts>,
    ) => Promise<unknown>,
    rpcType: string,
  ): Promise<void> {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws, {
      preferences: {} as PreferencesPort,
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    });
    const promise = subscribe(ports);
    await awaitPendingRpc(ws, rpcType);
    ws.nextRpcResponse(rpcType, rpcAck(undefined));
    await expect(promise).resolves.toBeUndefined();
    ws.dispose();
  }

  it("workflow.cancelRfq completes on ack", () => {
    return expectAckCompletes((p) => {
      return firstValueFrom(p.workflow.cancelRfq(1));
    }, "rpc.cancelRfq");
  });

  it("workflow.quote completes on ack", () => {
    return expectAckCompletes((p) => {
      return firstValueFrom(p.workflow.quote({ quoteId: 1, price: 100 }));
    }, "rpc.quote");
  });

  it("workflow.pass completes on ack", () => {
    return expectAckCompletes((p) => {
      return firstValueFrom(p.workflow.pass(1));
    }, "rpc.pass");
  });

  it("workflow.accept completes on ack", () => {
    return expectAckCompletes((p) => {
      return firstValueFrom(p.workflow.accept(1));
    }, "rpc.accept");
  });

  it("admin.setThroughput completes on ack", () => {
    return expectAckCompletes((p) => {
      return firstValueFrom(p.admin.setThroughput(500));
    }, "admin.setThroughput");
  });
});
