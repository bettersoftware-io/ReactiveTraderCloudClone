import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { describeOpsPortContract } from "@rtc/domain/ports/__contracts__/OpsPortContract";
import { rpcAck } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

describeOpsPortContract("createOpsPort (WsReal)", () => {
  const ws = new FakeWsAdapter();
  const port = createWsRealPorts(ws, {
    preferences: {} as PreferencesPort,
    auth: new AuthSimulator({}),
    sessionStore: new InMemorySessionStore(),
  }).ops;
  let primed = 0;
  return {
    port,
    driver: {
      primeGet: (value: number) => {
        primed = value;
      },
      flushGet: async () => {
        await awaitPendingRpc(ws, "ops.getThroughput");
        ws.nextRpcResponse("ops.getThroughput", rpcAck(primed));
      },
      ackSet: async () => {
        await awaitPendingRpc(ws, "ops.setThroughput");
        ws.nextRpcResponse("ops.setThroughput", rpcAck(undefined));
      },
    },
    teardown: () => {
      return ws.dispose();
    },
  };
});
