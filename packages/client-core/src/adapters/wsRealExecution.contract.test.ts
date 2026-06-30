import type { PreferencesPort } from "@rtc/domain";
import { describeExecutionPortContract } from "@rtc/domain/ports/__contracts__/ExecutionPortContract";
import { executionResponseAck } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

interface ExecuteTradePayload {
  currencyPair: string;
  notional: number;
  direction: string;
  dealtCurrency: string;
  spotRate: number;
}

describeExecutionPortContract("wsRealExecution", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws, { preferences: {} as PreferencesPort });
  return {
    port: ports.execution,
    driver: {
      ackExecute: async () => {
        await awaitPendingRpc(ws, "rpc.executeTrade");
        const sent = ws.sentMessages().find((m) => {
          return m.type === "rpc.executeTrade";
        });
        const req = sent?.payload as ExecuteTradePayload;
        ws.nextRpcResponse(
          "rpc.executeTrade",
          executionResponseAck({
            currencyPair: req.currencyPair,
            notional: req.notional,
            direction: req.direction as never,
            dealtCurrency: req.dealtCurrency,
            spotRate: req.spotRate,
          }),
        );
      },
    },
    teardown: () => {
      return ws.dispose();
    },
  };
});
