import { describe, expect, it } from "vitest";

import type { UpgradeRejection } from "#/http/loginHandler";
import { settleUpgrade } from "#/http/settleUpgrade";
import type { UpgradeVerdict } from "#/http/upgradeGate";

describe("settleUpgrade", () => {
  it("admits once on an admitting verdict", async () => {
    const probe = createProbe();

    await settleUpgrade(
      Promise.resolve<UpgradeVerdict>({ ok: true, status: 200 }),
      probe.done,
      probe.sinks,
    );

    expect(probe.calls).toEqual([[true, 200, undefined]]);
    expect(probe.rejections).toEqual([]);
  });

  it("refuses once, with the verdict's status and reason, and logs the reason", async () => {
    const probe = createProbe();

    await settleUpgrade(
      Promise.resolve<UpgradeVerdict>({
        ok: false,
        status: 503,
        reason: "accounts-unavailable",
      }),
      probe.done,
      probe.sinks,
    );

    expect(probe.calls).toEqual([[false, 503, "accounts-unavailable"]]);
    expect(probe.rejections).toEqual(["accounts-unavailable"]);
  });

  it("fails closed once with 503 when the gate itself rejects", async () => {
    const probe = createProbe();

    await settleUpgrade(
      Promise.reject(new Error("boom")),
      probe.done,
      probe.sinks,
    );

    expect(probe.calls).toEqual([[false, 503, "accounts-unavailable"]]);
    expect(probe.rejections).toEqual(["accounts-unavailable"]);
  });

  it("never calls `done` twice when admitting throws (the connection handler runs inside it)", async () => {
    const probe = createProbe(() => {
      throw new TypeError("secret@example.com hunter2");
    });

    await settleUpgrade(
      Promise.resolve<UpgradeVerdict>({ ok: true, status: 200 }),
      probe.done,
      probe.sinks,
    );

    expect(probe.calls).toEqual([[true, 200, undefined]]);
    expect(probe.rejections).toEqual([]);
    expect(probe.lines).toEqual(["[ws] upgrade-internal err=TypeError"]);
  });

  it("never rejects, even when the fail-closed `done` throws", async () => {
    const probe = createProbe(() => {
      throw new Error("socket gone");
    });

    await expect(
      settleUpgrade(Promise.reject(new Error("boom")), probe.done, probe.sinks),
    ).resolves.toBeUndefined();
    expect(probe.calls).toHaveLength(1);
  });
});

interface Probe {
  readonly calls: unknown[][];
  readonly rejections: UpgradeRejection[];
  readonly lines: string[];
  readonly done: (ok: boolean, status?: number, message?: string) => void;
  readonly sinks: Parameters<typeof settleUpgrade>[2];
}

function createProbe(after?: () => void): Probe {
  const calls: unknown[][] = [];
  const rejections: UpgradeRejection[] = [];
  const lines: string[] = [];

  return {
    calls,
    rejections,
    lines,
    done: (ok: boolean, status?: number, message?: string): void => {
      calls.push([ok, status, message]);
      after?.();
    },
    sinks: {
      recordRejectedUpgrade: (reason: UpgradeRejection): void => {
        rejections.push(reason);
      },
      log: (line: string): void => {
        lines.push(line);
      },
    },
  };
}
