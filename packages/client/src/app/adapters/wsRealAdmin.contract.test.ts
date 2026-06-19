import { describeAdminPortContract } from "@rtc/domain/ports/__contracts__/AdminPortContract";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { rpcAck } from "@rtc/shared/__fixtures__/wireFrames";

describeAdminPortContract("createAdminPort (WsReal)", () => {
  const ws = new FakeWsAdapter();
  const port = createWsRealPorts(ws).admin;
  let primed = 0;
  return {
    port,
    driver: {
      primeGet: (value: number) => {
        primed = value;
      },
      flushGet: async () => {
        await awaitPendingRpc(ws, "admin.getThroughput");
        ws.nextRpcResponse("admin.getThroughput", rpcAck(primed));
      },
      ackSet: async () => {
        await awaitPendingRpc(ws, "admin.setThroughput");
        ws.nextRpcResponse("admin.setThroughput", rpcAck(undefined));
      },
    },
    teardown: () => ws.dispose(),
  };
});
