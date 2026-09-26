import type { Observable } from "rxjs";
import { scan } from "rxjs/operators";

import type { Quote } from "../credit/quote.js";
import type { Rfq } from "../credit/rfq.js";
import type { RfqEvent, WorkflowPort } from "../ports/workflowPort.js";

export interface RfqStreamState {
  readonly rfqs: ReadonlyMap<number, Rfq>;
  readonly quotes: ReadonlyMap<number, Quote>;
}

/** The reducer's seed — what the RFQ stream holds before the first event
 * and after `startOfStateOfTheWorld`. Exported because every application
 * core runs `reduceRfqEvent` from this same seed under its own runtime. */
export function createEmptyRfqStreamState(): RfqStreamState {
  return { rfqs: new Map(), quotes: new Map() };
}

export function reduceRfqEvent(
  state: RfqStreamState,
  event: RfqEvent,
): RfqStreamState {
  switch (event.type) {
    case "startOfStateOfTheWorld":
      return createEmptyRfqStreamState();
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
  /** Reads only `events()` — narrowed so a caller can hand it an event
   * stream it already obtained, without calling the port twice. */
  constructor(private readonly workflow: Pick<WorkflowPort, "events">) {}

  execute(): Observable<RfqStreamState> {
    return this.workflow
      .events()
      .pipe(scan(reduceRfqEvent, createEmptyRfqStreamState()));
  }
}
