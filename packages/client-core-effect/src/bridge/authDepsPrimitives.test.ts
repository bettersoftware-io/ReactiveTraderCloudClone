import { BehaviorSubject, firstValueFrom, NEVER, of } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthOutcome, AuthPort } from "@rtc/domain";

import { authDepsPrimitives } from "#/bridge/authDepsPrimitives";

describe("authDepsPrimitives", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("readNow returns a replay-current stream's value synchronously", () => {
    expect(
      authDepsPrimitives.readNow(new BehaviorSubject("pinned"), "fallback"),
    ).toBe("pinned");
  });

  it("readNow falls back when the stream has no current value", () => {
    expect(authDepsPrimitives.readNow(NEVER, "fallback")).toBe("fallback");
  });

  it("delayAuth holds the outcome back by the delay read per attempt", async () => {
    vi.useFakeTimers();
    const outcome = createRejectedOutcome();
    const delayMs = 800;
    const delayed = authDepsPrimitives.delayAuth(
      createFakeAuth(outcome),
      () => {
        return delayMs;
      },
    );
    const settled = vi.fn();
    void firstValueFrom(delayed.login("u", "p")).then(settled);

    await vi.advanceTimersByTimeAsync(799);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith(outcome);
  });

  it("delayAuth passes the outcome through synchronously at a zero delay", () => {
    const outcome = createRejectedOutcome();
    const delayed = authDepsPrimitives.delayAuth(
      createFakeAuth(outcome),
      () => {
        return 0;
      },
    );
    const seen: AuthOutcome[] = [];
    delayed.login("u", "p").subscribe((value) => {
      seen.push(value);
    });
    expect(seen).toEqual([outcome]);
  });
});

function createRejectedOutcome(): AuthOutcome {
  return { ok: false, reason: "invalid" };
}

function createFakeAuth(outcome: AuthOutcome): AuthPort {
  return {
    login: () => {
      return of(outcome);
    },
  };
}
