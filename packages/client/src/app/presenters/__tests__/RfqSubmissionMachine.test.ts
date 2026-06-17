import { describe, it, expect } from "vitest";
import { TestScheduler } from "rxjs/testing";
import { of, type Observable } from "rxjs";
import {
  Direction,
  type CreateRfqInput,
  type RfqEvent,
  type WorkflowPort,
} from "@rtc/domain";
import {
  RfqsPresenter,
  type RfqSubmissionState,
} from "../RfqsPresenter";

// REDIRECT_DELAY_MS is presenter-local (1500). The marble test pins the timing.
const REDIRECT_DELAY_MS = 1500;

const input: CreateRfqInput = {
  instrumentId: 2,
  dealerIds: [1, 2],
  quantity: 5,
  direction: Direction.Sell,
};

/** A WorkflowPort whose createRfq returns the supplied Observable; everything
 * else is an inert stub (the submission machine only touches createRfq). */
function port(createRfq$: Observable<number>): WorkflowPort {
  return {
    events: () => of<RfqEvent>(),
    createRfq: () => createRfq$,
    cancelRfq: () => of(undefined),
    quote: () => of(undefined),
    pass: () => of(undefined),
    accept: () => of(undefined),
  };
}

function scheduler() {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

describe("RfqsPresenter.createSubmission", () => {
  it("goes editing → submitting → confirmed and fires onRedirect at exactly REDIRECT_DELAY_MS", () => {
    const ts = scheduler();
    ts.run(({ cold, flush }) => {
      // create-RFQ resolves 10ms after submit with rfqId 555.
      const presenter = new RfqsPresenter(port(cold("10ms (a|)", { a: 555 })));
      const machine = presenter.createSubmission();

      const states: RfqSubmissionState[] = [];
      const redirects: number[] = [];
      const sub = machine.state$.subscribe((s) => states.push(s));

      machine.intents.submit(input, (rfqId) => redirects.push(rfqId));

      // 1ms before the redirect-timer deadline (confirmation at t=10): not yet.
      ts.schedule(() => {
        expect(redirects).toEqual([]);
      }, 10 + REDIRECT_DELAY_MS - 1);
      // Just past the deadline: fired exactly once. (Same-virtual-time actions
      // have undefined ordering vs. the timer, so we check at deadline + 1.)
      ts.schedule(() => {
        expect(redirects).toEqual([555]);
      }, 10 + REDIRECT_DELAY_MS + 1);

      flush();
      sub.unsubscribe();
      machine.dispose();

      expect(states).toEqual([
        { status: "editing" },
        { status: "submitting" },
        { status: "confirmed", rfqId: 555 },
      ]);
    });
  });

  it("cancels the pending redirect when disposed before the delay fires", () => {
    const ts = scheduler();
    ts.run(({ cold, flush }) => {
      const presenter = new RfqsPresenter(port(cold("10ms (a|)", { a: 777 })));
      const machine = presenter.createSubmission();

      const redirects: number[] = [];
      const sub = machine.state$.subscribe();
      machine.intents.submit(input, (rfqId) => redirects.push(rfqId));

      // Dispose midway through the redirect window (well before t=10+1500).
      ts.schedule(() => {
        sub.unsubscribe();
        machine.dispose();
      }, 10 + 500);

      flush();
      expect(redirects).toEqual([]);
    });
  });

  it("returns to editing when create-RFQ errors (no confirmation, no redirect)", () => {
    const ts = scheduler();
    ts.run(({ cold, flush }) => {
      const presenter = new RfqsPresenter(port(cold("10ms #")));
      const machine = presenter.createSubmission();

      const states: RfqSubmissionState[] = [];
      const redirects: number[] = [];
      const sub = machine.state$.subscribe((s) => states.push(s));
      machine.intents.submit(input, (rfqId) => redirects.push(rfqId));

      flush();
      sub.unsubscribe();
      machine.dispose();

      expect(states).toEqual([
        { status: "editing" },
        { status: "submitting" },
        { status: "editing" },
      ]);
      expect(redirects).toEqual([]);
    });
  });
});
