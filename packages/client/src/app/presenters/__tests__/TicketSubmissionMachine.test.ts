import { describe, it, expect } from "vitest";
import { TestScheduler } from "rxjs/testing";
import { of, type Observable } from "rxjs";
import type {
  RfqEvent,
  WorkflowPort,
  QuoteRequest,
} from "@rtc/domain";
import {
  RfqsPresenter,
  type TicketSubmissionState,
} from "../RfqsPresenter";

interface Recorder {
  quote: QuoteRequest[];
  pass: number[];
}

/** A WorkflowPort that records quote/pass calls and returns the supplied
 * Observables (defaults: immediate success). */
function port(
  rec: Recorder,
  quote$: Observable<void> = of(undefined),
  pass$: Observable<void> = of(undefined),
): WorkflowPort {
  return {
    events: () => of<RfqEvent>(),
    createRfq: () => of(0),
    cancelRfq: () => of(undefined),
    quote: (req) => {
      rec.quote.push(req);
      return quote$;
    },
    pass: (quoteId) => {
      rec.pass.push(quoteId);
      return pass$;
    },
    accept: () => of(undefined),
  };
}

function scheduler() {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

describe("RfqsPresenter.createTicketSubmission", () => {
  it("starts not-submitted (synchronous default)", () => {
    const rec: Recorder = { quote: [], pass: [] };
    const machine = new RfqsPresenter(port(rec)).createTicketSubmission();
    let current: TicketSubmissionState | undefined;
    const sub = machine.state$.subscribe((s) => (current = s));
    expect(current).toEqual({ submitted: false });
    sub.unsubscribe();
    machine.dispose();
  });

  it("submitPrice records the request and flips submitted:true", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const rec: Recorder = { quote: [], pass: [] };
      const machine = new RfqsPresenter(port(rec)).createTicketSubmission();
      const states: TicketSubmissionState[] = [];
      const sub = machine.state$.subscribe((s) => states.push(s));

      machine.intents.submitPrice(100, 101.5);
      flush();
      sub.unsubscribe();
      machine.dispose();

      expect(rec.quote).toEqual([{ quoteId: 100, price: 101.5 }]);
      expect(states).toEqual([{ submitted: false }, { submitted: true }]);
    });
  });

  it("pass records the quote id and flips submitted:true", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const rec: Recorder = { quote: [], pass: [] };
      const machine = new RfqsPresenter(port(rec)).createTicketSubmission();
      const states: TicketSubmissionState[] = [];
      const sub = machine.state$.subscribe((s) => states.push(s));

      machine.intents.pass(100);
      flush();
      sub.unsubscribe();
      machine.dispose();

      expect(rec.pass).toEqual([100]);
      expect(states).toEqual([{ submitted: false }, { submitted: true }]);
    });
  });

  it("dispose tears down without emitting after teardown", () => {
    const rec: Recorder = { quote: [], pass: [] };
    const machine = new RfqsPresenter(port(rec)).createTicketSubmission();
    const states: TicketSubmissionState[] = [];
    const sub = machine.state$.subscribe((s) => states.push(s));
    machine.dispose();
    // After dispose the source Subject is completed: pushing an action no longer
    // drives the stream, so no further state is emitted.
    machine.intents.submitPrice(1, 2);
    expect(states).toEqual([{ submitted: false }]);
    sub.unsubscribe();
  });
});
