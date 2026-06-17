import { describe, it, expect } from "vitest";
import { firstValueFrom } from "rxjs";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";
import { awaitPendingRpc } from "./__test__/awaitPendingRpc";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

describe("wsReal admin :: nack error paths", () => {
  it("rejects getThroughput on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.admin.getThroughput());
    await awaitPendingRpc(ws, "admin.getThroughput");
    ws.nextRpcResponse("admin.getThroughput", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to get throughput/);
    ws.dispose();
  });

  it("rejects setThroughput on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.admin.setThroughput(500));
    await awaitPendingRpc(ws, "admin.setThroughput");
    ws.nextRpcResponse("admin.setThroughput", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to set throughput/);
    ws.dispose();
  });
});
