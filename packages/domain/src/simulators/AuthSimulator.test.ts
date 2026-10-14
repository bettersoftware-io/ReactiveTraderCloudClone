import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AccountFlowOutcome } from "#/ports/authPort.js";
import { AuthSimulator } from "#/simulators/AuthSimulator.js";

describe("AuthSimulator", () => {
  it("returns ok + roster profile + a token on correct dev credentials", async () => {
    const r = await firstValueFrom(sim.login("demo", "localpass"));
    expect(r.ok).toBe(true);

    if (r.ok) {
      expect(r.user.name).toBe("Demo Operator");
      expect(typeof r.token).toBe("string");
      expect(r.token.length).toBeGreaterThan(0);
    }
  });
  it("rejects a wrong password", async () => {
    const r = await firstValueFrom(sim.login("demo", "nope"));
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects an unknown user", async () => {
    const r = await firstValueFrom(sim.login("ghost", "x"));
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });
  it("stamps exp = now() + ttlMs on a successful login", async () => {
    function now(): number {
      return 1_000;
    }

    const withClock = new AuthSimulator({ astark: "pw" }, 5_000, now);
    const r = await firstValueFrom(withClock.login("astark", "pw"));

    expect(r.ok).toBe(true);

    if (r.ok) {
      expect(r.exp).toBe(6_000);
    }
  });

  it("answers every account flow with unavailable, synchronously — a simulator offers no registration", () => {
    const simulator = new AuthSimulator({ demo: "pw" });
    const seen: AccountFlowOutcome[] = [];

    simulator.register("a@b.co", "Ann").subscribe((o) => {
      return seen.push(o);
    });
    simulator.resendCode("a@b.co").subscribe((o) => {
      return seen.push(o);
    });
    simulator
      .confirmEmail("a@b.co", "12345678", "Pass!word2026x")
      .subscribe((o) => {
        return seen.push(o);
      });
    simulator.requestPasswordReset("a@b.co").subscribe((o) => {
      return seen.push(o);
    });
    simulator
      .resetPassword("a@b.co", "12345678", "Pass!word2026x")
      .subscribe((o) => {
        return seen.push(o);
      });

    expect(seen).toEqual(Array(5).fill({ ok: false, reason: "unavailable" }));
  });
});

const sim = new AuthSimulator({ demo: "localpass", astark: "localpass" });
