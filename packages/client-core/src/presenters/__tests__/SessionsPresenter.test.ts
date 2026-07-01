// TDD — RED: written before SessionsPresenter existed.
//   pnpm --filter @rtc/client-react test -- SessionsPresenter  → FAIL (module missing)
// GREEN: SessionsPresenter created → all cases pass.

import { firstValueFrom, of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { SessionInfo, SessionsPort } from "@rtc/domain";

import { SessionsPresenter } from "../SessionsPresenter";

describe("SessionsPresenter", () => {
  it("passes through the sessions array from the port", async () => {
    const sessions = [session("a"), session("b")];
    const port: SessionsPort = {
      sessions$: () => {
        return of(sessions);
      },
    };
    const presenter = new SessionsPresenter(port);

    const first = await firstValueFrom(presenter.sessions$);
    expect(first).toBe(sessions); // same reference — no transformation
  });

  it("multicasts to multiple subscribers (shareReplay — single port subscription)", () => {
    const subject = new Subject<readonly SessionInfo[]>();
    let subscribed = 0;
    const port: SessionsPort = {
      sessions$: () => {
        subscribed++;
        return subject;
      },
    };
    const presenter = new SessionsPresenter(port);

    const a: (readonly SessionInfo[])[] = [];
    const b: (readonly SessionInfo[])[] = [];
    const subA = presenter.sessions$.subscribe((s) => {
      a.push(s);
    });
    const subB = presenter.sessions$.subscribe((s) => {
      b.push(s);
    });

    subject.next([session("x")]);
    subA.unsubscribe();
    subB.unsubscribe();

    // Port subscribed only once despite two UI consumers
    expect(subscribed).toBe(1);
    // Both observers see the same values
    expect(a).toEqual(b);
    expect(a[0]).toEqual([session("x")]);
  });

  it("concurrent late subscriber receives the latest replayed value (shareReplay buffer=1)", () => {
    const subject = new Subject<readonly SessionInfo[]>();
    const port: SessionsPort = {
      sessions$: () => {
        return subject;
      },
    };
    const presenter = new SessionsPresenter(port);

    // First subscriber keeps refCount > 0 while second subscribes.
    const firstSub = presenter.sessions$.subscribe();
    subject.next([session("early")]);

    // Second subscriber connects while first is still active — gets the replay.
    let received: readonly SessionInfo[] | undefined;
    const secondSub = presenter.sessions$.subscribe((s) => {
      received = s;
    });

    firstSub.unsubscribe();
    secondSub.unsubscribe();

    expect(received).toEqual([session("early")]);
  });
});

function session(id: string): SessionInfo {
  return { id, user: "demo-user", region: "EU", lat: 51.5, lon: -0.1 };
}
