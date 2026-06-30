import type { PreferencesPort } from "@rtc/domain";
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
  const ports = createWsRealPorts(ws, { preferences: {} as PreferencesPort });
  return {
    port: ports.workflow,
    driver: {
      ackCreateRfq: async (rfqId: number) => {
        await awaitPendingRpc(ws, "rpc.createRfq");
        ws.nextRpcResponse("rpc.createRfq", rpcAck(rfqId));
      },
      emitCreatedEvent: async (rfqId: number) => {
        await Promise.resolve();
        ws.emit("stream.workflowEvent", workflowEventCreated(rfqId));
      },
      emitAcceptedEvent: async (rfqId: number, quoteId: number) => {
        await Promise.resolve();
        ws.emit("stream.workflowEvent", workflowEventAccepted(rfqId, quoteId));
      },
      ackAccept: async () => {
        await awaitPendingRpc(ws, "rpc.accept");
        ws.nextRpcResponse("rpc.accept", rpcAck(undefined));
      },
    },
    teardown: () => {
      return ws.dispose();
    },
  };
});
