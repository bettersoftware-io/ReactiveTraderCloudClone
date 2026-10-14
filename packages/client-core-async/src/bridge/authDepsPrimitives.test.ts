import { BehaviorSubject, firstValueFrom, NEVER, of, throwError } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AccountFlowOutcome,
  type AuthOutcome,
  type AuthPort,
  createUnavailableAccountFlows,
} from "@rtc/domain";

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

  it("readNow falls back when the stream's current value is undefined", () => {
    expect(authDepsPrimitives.readNow(of(undefined), "fallback")).toBe(
      "fallback",
    );
  });

  it("readNow falls back, without throwing, when the stream errors on subscribe", () => {
    vi.useFakeTimers();
    const failing = throwError(() => {
      return new Error("storage unavailable");
    });
    expect(authDepsPrimitives.readNow(failing, "fallback")).toBe("fallback");
  });

  it("delayAuth holds the outcome back by the delay read per attempt", async () => {
    vi.useFakeTimers();
    const outcome = createRejectedOutcome();
    let delayMs = 800;
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

    // The supplier is read on each attempt, not once when the port is wrapped.
    delayMs = 200;
    const second = vi.fn();
    void firstValueFrom(delayed.login("u", "p")).then(second);
    await vi.advanceTimersByTimeAsync(199);
    expect(second).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(second).toHaveBeenCalledWith(outcome);
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

  it("delayAuth passes the five account flows through undelayed, with the same arguments", () => {
    vi.useFakeTimers();
    const seen: Array<readonly unknown[]> = [];
    const flowOutcome: AccountFlowOutcome = { ok: true, status: "code_sent" };
    const inner: AuthPort = {
      ...createFakeAuth(createRejectedOutcome()),
      register: (email: string, displayName: string) => {
        seen.push([email, displayName]);
        return of(flowOutcome);
      },
    };

    const delayed = authDepsPrimitives.delayAuth(inner, () => {
      return 5_000;
    });
    const outcomes: AccountFlowOutcome[] = [];

    delayed.register("a@b.co", "Ann").subscribe((value) => {
      outcomes.push(value);
    });
    delayed.resendCode("a@b.co").subscribe((value) => {
      outcomes.push(value);
    });
    delayed.confirmEmail("a@b.co", "12345678", "pw").subscribe((value) => {
      outcomes.push(value);
    });
    delayed.requestPasswordReset("a@b.co").subscribe((value) => {
      outcomes.push(value);
    });
    delayed.resetPassword("a@b.co", "12345678", "pw").subscribe((value) => {
      outcomes.push(value);
    });

    expect(seen).toEqual([["a@b.co", "Ann"]]);
    expect(outcomes).toEqual([
      flowOutcome,
      { ok: false, reason: "unavailable" },
      { ok: false, reason: "unavailable" },
      { ok: false, reason: "unavailable" },
      { ok: false, reason: "unavailable" },
    ]);
  });
});

function createRejectedOutcome(): AuthOutcome {
  return { ok: false, reason: "invalid" };
}

function createFakeAuth(outcome: AuthOutcome): AuthPort {
  return {
    ...createUnavailableAccountFlows(),
    login: () => {
      return of(outcome);
    },
  };
}
