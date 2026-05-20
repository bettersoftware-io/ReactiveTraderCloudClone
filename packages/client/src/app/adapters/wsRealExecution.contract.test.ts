import { describeExecutionPortContract } from "@rtc/domain/ports/__contracts__/ExecutionPortContract";
import { executionResponseAck } from "@rtc/shared/__fixtures__/wireFrames";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";
import { awaitPendingRpc } from "./__test__/awaitPendingRpc";

describeExecutionPortContract("wsRealExecution", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
  return {
    port: ports.execution,
    driver: {
      ackExecute: async () => {
        await awaitPendingRpc(ws, "rpc.executeTrade");
        const sent = ws.sentMessages().find((m) => m.type === "rpc.executeTrade");
        const req = sent?.payload as {
          currencyPair: string;
          notional: number;
          direction: string;
          dealtCurrency: string;
          spotRate: number;
        };
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
    teardown: () => ws.dispose(),
  };
});
