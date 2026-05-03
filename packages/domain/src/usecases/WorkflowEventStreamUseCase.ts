import type { WorkflowPort, RfqEvent } from "../ports/workflowPort.js";
import type { Rfq } from "../credit/rfq.js";
import type { Quote } from "../credit/quote.js";

export interface RfqStreamState {
  readonly rfqs: ReadonlyMap<number, Rfq>;
  readonly quotes: ReadonlyMap<number, Quote>;
}

function emptyState(): RfqStreamState {
  return { rfqs: new Map(), quotes: new Map() };
}

export function reduceRfqEvent(state: RfqStreamState, event: RfqEvent): RfqStreamState {
  switch (event.type) {
    case "startOfStateOfTheWorld":
      return emptyState();
    case "endOfStateOfTheWorld":
      return state;
    case "rfqCreated":
    case "rfqClosed": {
      const next = new Map(state.rfqs);
      next.set(event.payload.id, event.payload);
      return { ...state, rfqs: next };
    }
    case "quoteCreated":
    case "quoteQuoted":
    case "quotePassed":
    case "quoteAccepted": {
      const next = new Map(state.quotes);
      next.set(event.payload.id, event.payload);
      return { ...state, quotes: next };
    }
  }
}

export class WorkflowEventStreamUseCase {
  constructor(private readonly workflow: WorkflowPort) {}

  async *execute(): AsyncIterable<RfqStreamState> {
    let state = emptyState();
    for await (const event of this.workflow.subscribe()) {
      state = reduceRfqEvent(state, event);
      yield state;
    }
  }
}
