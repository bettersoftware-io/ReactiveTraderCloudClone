import type { Observable } from "rxjs";
import { scan } from "rxjs/operators";

import type { Quote } from "../credit/quote.js";
import type { Rfq } from "../credit/rfq.js";
import type { RfqEvent, WorkflowPort } from "../ports/workflowPort.js";

export interface RfqStreamState {
  readonly rfqs: ReadonlyMap<number, Rfq>;
  readonly quotes: ReadonlyMap<number, Quote>;
}

function emptyState(): RfqStreamState {
  return { rfqs: new Map(), quotes: new Map() };
}

export function reduceRfqEvent(
  state: RfqStreamState,
  event: RfqEvent,
): RfqStreamState {
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
    case "quoteRejected":

    case "quoteAccepted": {
      const next = new Map(state.quotes);
      next.set(event.payload.id, event.payload);
      return { ...state, quotes: next };
    }
  }
}

export class WorkflowEventStreamUseCase {
  constructor(private readonly workflow: WorkflowPort) {}

  execute(): Observable<RfqStreamState> {
    return this.workflow.events().pipe(scan(reduceRfqEvent, emptyState()));
  }
}
