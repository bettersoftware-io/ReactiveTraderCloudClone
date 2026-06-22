import { describeWorkflowPortContract } from "@rtc/domain/ports/__contracts__/WorkflowPortContract";
import {
  rpcAck,
  workflowEventAccepted,
  workflowEventCreated,
} from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

describeWorkflowPortContract("wsRealWorkflow", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
  return {
    port: ports.workflow,
    driver: {
      ackCreateRfq: async (rfqId) => {
        await awaitPendingRpc(ws, "rpc.createRfq");
        ws.nextRpcResponse("rpc.createRfq", rpcAck(rfqId));
      },
      emitCreatedEvent: async (rfqId) => {
        await Promise.resolve();
        ws.emit("stream.workflowEvent", workflowEventCreated(rfqId));
      },
      emitAcceptedEvent: async (rfqId, quoteId) => {
        await Promise.resolve();
        ws.emit("stream.workflowEvent", workflowEventAccepted(rfqId, quoteId));
      },
      ackAccept: async () => {
        await awaitPendingRpc(ws, "rpc.accept");
        ws.nextRpcResponse("rpc.accept", rpcAck(undefined));
      },
    },
    teardown: () => ws.dispose(),
  };
});
