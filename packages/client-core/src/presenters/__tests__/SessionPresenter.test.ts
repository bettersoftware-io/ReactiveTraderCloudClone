import { describe, expect, it } from "vitest";

import {
  DEMO_USER,
  SessionPresenter,
  type SessionState,
} from "../SessionPresenter";

describe("SessionPresenter", () => {
  it("starts unlocked, lock() locks, unlock() re-authenticates", () => {
    const p = new SessionPresenter(DEMO_USER);
    const seen: boolean[] = [];
    const sub = p.state$.subscribe((s) => {
      return seen.push(s.locked);
    });
    p.lock();
    p.unlock();
    sub.unsubscribe();
    expect(seen).toEqual([false, true, false]);
  });

  it("pairs the lock flag with the static demo user", () => {
    const user = DEMO_USER;
    const p = new SessionPresenter(user);
    let latest: SessionState | undefined;
    const sub = p.state$.subscribe((s) => {
      latest = s;
    });
    sub.unsubscribe();
    expect(latest).toEqual({ locked: false, user });
  });

  it("defaults to the prototype demo operator (Anthony Stark)", () => {
    const p = new SessionPresenter();
    let latest: SessionState | undefined;
    const sub = p.state$.subscribe((s) => {
      latest = s;
    });
    sub.unsubscribe();
    expect(latest?.user.name).toBe("Anthony Stark");
    expect(latest?.user.id).toBe("TRD-0042");
  });
});
