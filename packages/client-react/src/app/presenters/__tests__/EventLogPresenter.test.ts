// TDD — RED: written before EventLogPresenter existed.
//   pnpm --filter @rtc/client-react test -- EventLogPresenter  → FAIL (module missing)
// GREEN: EventLogPresenter created → all cases pass.

import { firstValueFrom, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EventLogPort, LogEvent } from "@rtc/domain";

import { EventLogPresenter, MAX_LOG_ROWS } from "../EventLogPresenter";

function makeEvent(t: number): LogEvent {
  return { t, severity: "info", service: "pricing", message: `msg-${t}` };
}

describe("EventLogPresenter", () => {
  it("emits an empty list immediately before any events arrive", async () => {
    const port: EventLogPort = { events$: () => new Subject<LogEvent>() };
    const presenter = new EventLogPresenter(port);

    const first = await firstValueFrom(presenter.events$);
    expect(first).toEqual([]);
  });

  it("accumulates events newest-first", () => {
    const subject = new Subject<LogEvent>();
    const port: EventLogPort = { events$: () => subject };
    const presenter = new EventLogPresenter(port);

    const emitted: (readonly LogEvent[])[] = [];
    const sub = presenter.events$.subscribe((events) => {
      emitted.push(events);
    });

    subject.next(makeEvent(1));
    subject.next(makeEvent(2));
    subject.next(makeEvent(3));
    sub.unsubscribe();

    // emitted[0] = startWith([]) initial value
    expect(emitted[0]).toEqual([]);
    // After first event: [event1]
    expect(emitted[1]).toEqual([makeEvent(1)]);
    // After second event: newest first → [event2, event1]
    expect(emitted[2]).toEqual([makeEvent(2), makeEvent(1)]);
    // After third event: newest first → [event3, event2, event1]
    expect(emitted[3]).toEqual([makeEvent(3), makeEvent(2), makeEvent(1)]);
  });

  it(`caps at MAX_LOG_ROWS (${MAX_LOG_ROWS}) and keeps the newest events`, () => {
    const subject = new Subject<LogEvent>();
    const port: EventLogPort = { events$: () => subject };
    const presenter = new EventLogPresenter(port);

    let last: readonly LogEvent[] = [];
    const sub = presenter.events$.subscribe((events) => {
      last = events;
    });

    for (let i = 0; i < MAX_LOG_ROWS + 10; i++) {
      subject.next(makeEvent(i));
    }
    sub.unsubscribe();

    expect(last.length).toBe(MAX_LOG_ROWS);
    // The NEWEST event (highest t) must be first in the list
    expect(last[0].t).toBe(MAX_LOG_ROWS + 9);
    // The OLDEST retained event is at the tail
    expect(last[MAX_LOG_ROWS - 1].t).toBe(10);
  });

  it("multicasts to multiple subscribers (shareReplay)", () => {
    const subject = new Subject<LogEvent>();
    let subscribed = 0;
    const port: EventLogPort = {
      events$: () => {
        subscribed++;
        return subject;
      },
    };
    const presenter = new EventLogPresenter(port);

    const a: (readonly LogEvent[])[] = [];
    const b: (readonly LogEvent[])[] = [];
    const subA = presenter.events$.subscribe((e) => {
      a.push(e);
    });
    const subB = presenter.events$.subscribe((e) => {
      b.push(e);
    });

    subject.next(makeEvent(42));
    subA.unsubscribe();
    subB.unsubscribe();

    // Only one subscription to the port (refCount)
    expect(subscribed).toBe(1);
    // Both observers see the same values
    expect(a).toEqual(b);
  });
});
