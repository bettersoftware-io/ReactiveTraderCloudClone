import { type Observable, of } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";

import type { QuoteRequest, RfqEvent, WorkflowPort } from "@rtc/domain";

import { RfqsPresenter, type TicketSubmissionState } from "../RfqsPresenter";

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

  it("stays not-submitted (retryable) when the command errors, vs submitted on success", () => {
    const ts = scheduler();
    ts.run(({ cold, flush }) => {
      const rec: Recorder = { quote: [], pass: [] };
      // First submitPrice fails; the user must be able to retry, so submission
      // must remain not-submitted rather than latching submitted:true.
      const machine = new RfqsPresenter(
        port(rec, cold("10ms #")),
      ).createTicketSubmission();
      const states: TicketSubmissionState[] = [];
      const sub = machine.state$.subscribe((s) => states.push(s));

      machine.intents.submitPrice(100, 101.5);
      flush();

      expect(states).toEqual([{ submitted: false }, { submitted: false }]);

      sub.unsubscribe();
      machine.dispose();
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
