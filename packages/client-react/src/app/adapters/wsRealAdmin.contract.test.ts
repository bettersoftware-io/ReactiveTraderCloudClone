import { describeAdminPortContract } from "@rtc/domain/ports/__contracts__/AdminPortContract";
import { rpcAck } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

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
