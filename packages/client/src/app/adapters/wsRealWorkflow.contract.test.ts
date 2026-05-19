import { describeWorkflowPortContract } from "@rtc/domain/ports/__contracts__/WorkflowPortContract";
import {
  workflowEventCreated,
  workflowEventQuoted,
  workflowEventAccepted,
  rpcAck,
} from "@rtc/shared/__fixtures__/wireFrames";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";

describeWorkflowPortContract("wsRealWorkflow", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
  return {
    port: ports.workflow,
    driver: {
      ackCreateRfq: async (rfqId) => {
        while (!ws.hasPendingRpc("rpc.createRfq")) {
          await Promise.resolve();
        }
        ws.nextRpcResponse("rpc.createRfq", rpcAck(rfqId));
      },
      emitCreatedEvent: async (rfqId) => {
        await Promise.resolve();
        ws.emit("stream.workflowEvent", workflowEventCreated(rfqId));
      },
      emitQuotedEvent: async (rfqId, quoteId) => {
        await Promise.resolve();
        ws.emit("stream.workflowEvent", workflowEventQuoted(rfqId, quoteId));
      },
      emitAcceptedEvent: async (rfqId, quoteId) => {
        await Promise.resolve();
        ws.emit("stream.workflowEvent", workflowEventAccepted(rfqId, quoteId));
      },
      ackAccept: async () => {
        while (!ws.hasPendingRpc("rpc.accept")) {
          await Promise.resolve();
        }
        ws.nextRpcResponse("rpc.accept", rpcAck(undefined));
      },
    },
    teardown: () => ws.dispose(),
  };
});
