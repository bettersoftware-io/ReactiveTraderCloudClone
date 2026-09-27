import { describe, expect, it } from "vitest";

import type { DriveOutcome } from "@rtc/core-api";
import { DRIVE_STAGGER_MS, MAX_DOCKED_PANELS } from "@rtc/domain";

import { type FakeClock, withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { AAPL, MSFT } from "#/harness/fixtures";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import type { DriveCommand } from "#/harness/jarvisTypes";
import { settle } from "#/harness/settle";
import { clockPause, readJarvis } from "#/suites/jarvisKit";
import {
  dockedIds,
  driveBatch,
  leafIds,
  readLatest,
  readLayout,
  spawnPanels,
} from "#/suites/workspaceKit";

/** `presenters.jarvisDriver` — the drive-command interpreter over Jarvis's
 * `command` events: the stagger, the per-kind outcomes, the batch queue,
 * and the transcript rows its outcomes become. Layout ops and
 * `reportDetachedPanels` are wave 1's (`layout`, `reportDetachedPanels`). */
export function describeJarvisDriverContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("a batch resets lastBatch, applies its first command at once and each later one DRIVE_STAGGER_MS apart; outcomes$ follows in order", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          const outcomes = collect(h.app.presenters.jarvisDriver.outcomes$);
          await driveBatch(
            h,
            [switchTo("credit"), switchTo("equities"), switchTo("admin")],
            pause,
          );
          expect(await batchTabs(h, pause)).toEqual(["credit"]);
          await clock.advance(DRIVE_STAGGER_MS - 1);
          await pause();
          expect(await batchTabs(h, pause)).toEqual(["credit"]);
          await clock.advance(1);
          await pause();
          expect(await batchTabs(h, pause)).toEqual(["credit", "equities"]);
          await clock.advance(DRIVE_STAGGER_MS);
          await pause();
          expect(tabsOf(outcomes.values)).toEqual([
            "credit",
            "equities",
            "admin",
          ]);
          expect(
            (await readLatest(h.app.presenters.workspaceNav.state$, pause))
              .activeTab,
          ).toBe("admin");
          outcomes.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("under power-saver freeze the whole batch applies at once", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          h.app.presenters.powerSaver.setLevel("freeze");
          await pause();
          await driveBatch(
            h,
            [switchTo("credit"), switchTo("equities"), switchTo("admin")],
            pause,
          );
          await applyZeroStagger(clock);
          expect(await batchTabs(h, pause)).toEqual([
            "credit",
            "equities",
            "admin",
          ]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a second batch arriving mid-stagger waits for the first: its reset comes after the first batch's last outcome", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          const outcomes = collect(h.app.presenters.jarvisDriver.outcomes$);
          await driveBatch(
            h,
            [switchTo("credit"), switchTo("equities")],
            pause,
          );
          await driveBatch(h, [switchTo("admin")], pause);
          expect(await batchTabs(h, pause)).toEqual(["credit"]);
          await clock.advance(DRIVE_STAGGER_MS);
          await applyZeroStagger(clock);
          expect(tabsOf(outcomes.values)).toEqual([
            "credit",
            "equities",
            "admin",
          ]);
          expect(await batchTabs(h, pause)).toEqual(["admin"]);
          outcomes.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("equities: a watchlist symbol is selected, an unknown one is skipped 'unknown symbol'; an indicator or pane not at the requested value toggles, one already there is skipped 'already set'", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ watchlist: [AAPL, MSFT] });
        const pause = clockPause(clock);

        try {
          await freeze(h, clock);
          const before = await readLatest(
            h.app.presenters.eqWorkspace.state$,
            pause,
          );
          const smaOn = before.indicators.includes("sma20");
          const rsiOn = before.panes.includes("rsi");
          await driveBatch(
            h,
            [
              { kind: "eqSelect", symbol: MSFT.symbol },
              { kind: "eqSelect", symbol: "NOT-A-SYMBOL" },
              { kind: "eqIndicator", id: "sma20", on: !smaOn },
              { kind: "eqIndicator", id: "sma20", on: !smaOn },
              { kind: "eqPane", id: "rsi", on: !rsiOn },
              { kind: "eqPane", id: "rsi", on: !rsiOn },
            ],
            pause,
          );
          await applyZeroStagger(clock);
          expect(await batchResults(h, pause)).toEqual([
            ["applied", undefined],
            ["skipped", 'unknown symbol "NOT-A-SYMBOL"'],
            ["applied", undefined],
            ["skipped", "already set"],
            ["applied", undefined],
            ["skipped", "already set"],
          ]);
          const after = await readLatest(
            h.app.presenters.eqWorkspace.state$,
            pause,
          );
          expect(after.sel).toBe(MSFT.symbol);
          expect(after.indicators.includes("sma20")).toBe(!smaOn);
          expect(after.panes.includes("rsi")).toBe(!rsiOn);
        } finally {
          await h.teardown();
        }
      });
    });

    it("eqSelect before the watchlist has loaded is skipped 'watchlist not loaded', never 'unknown symbol'", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          await driveBatch(
            h,
            [{ kind: "eqSelect", symbol: MSFT.symbol }],
            pause,
          );
          await applyZeroStagger(clock);
          expect(await batchResults(h, pause)).toEqual([
            ["skipped", "watchlist not loaded"],
          ]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("setTheme and setPowerSaver write their preference", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          await freeze(h, clock);
          await driveBatch(
            h,
            [
              { kind: "setTheme", skin: "terminal" },
              { kind: "setPowerSaver", level: "calm" },
            ],
            pause,
          );
          await applyZeroStagger(clock);
          expect(await batchStatuses(h, pause)).toEqual(["applied", "applied"]);
          expect(
            await readLatest(h.app.presenters.themeSkinPreference.skin$, pause),
          ).toBe("terminal");
          expect(
            await readLatest(h.app.presenters.powerSaver.level$, pause),
          ).toBe("calm");
        } finally {
          await h.teardown();
        }
      });
    });

    it("dockPanel of an unknown id, of a docked panel, and past MAX_DOCKED_PANELS is skipped with its reason; nothing more docks", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          await freeze(h, clock);
          const docked = Array.from({ length: MAX_DOCKED_PANELS }, (_, i) => {
            return `p${i}`;
          });
          await spawnPanels(h, docked, pause);
          await driveBatch(
            h,
            docked.map((panelId): DriveCommand => {
              return { kind: "dockPanel", panelId };
            }),
            pause,
          );
          await applyZeroStagger(clock);
          await spawnPanels(h, ["overflow"], pause);
          await driveBatch(
            h,
            [
              { kind: "dockPanel", panelId: "nope" },
              { kind: "dockPanel", panelId: "p0" },
              { kind: "dockPanel", panelId: "overflow" },
            ],
            pause,
          );
          await applyZeroStagger(clock);
          expect(await batchResults(h, pause)).toEqual([
            ["skipped", 'unknown panelId "nope"'],
            ["skipped", "already docked"],
            ["skipped", "dock full"],
          ]);
          expect(await dockedIds(h, pause)).toEqual(docked);
        } finally {
          await h.teardown();
        }
      });
    });

    it("dockPanel of a live panel docks it; undockPanel of a floating one is skipped", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          await freeze(h, clock);
          await spawnPanels(h, ["p1", "p2"], pause);
          await driveBatch(
            h,
            [
              { kind: "dockPanel", panelId: "p1" },
              { kind: "undockPanel", panelId: "p2" },
            ],
            pause,
          );
          await applyZeroStagger(clock);
          expect(await batchStatuses(h, pause)).toEqual(["applied", "skipped"]);
          expect(await dockedIds(h, pause)).toEqual(["p1"]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("dockPanel of a live panel whose id collides with a static workspace panel is REFUSED, and the transcript says why", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          await freeze(h, clock);
          const staticId = leafIds((await readLayout(h, "fx", pause)).root)[0];

          if (staticId === undefined) {
            throw new Error("expected fx's default layout to have a panel");
          }

          await spawnPanels(h, [staticId], pause);
          await driveBatch(
            h,
            [{ kind: "dockPanel", panelId: staticId }],
            pause,
          );
          await applyZeroStagger(clock);
          expect(await batchStatuses(h, pause)).toEqual(["refused"]);
          expect(await dockedIds(h, pause)).toEqual([]);
          expect((await readJarvis(h, pause)).entries.at(-1)?.text).toBe(
            `can't dockPanel: ${staticId} collides with a workspace panel id`,
          );
        } finally {
          await h.teardown();
        }
      });
    });

    it("a dock then an undock in two batches both apply, in order, as two transcript rows", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const pause = clockPause(clock);

        try {
          await freeze(h, clock);
          await spawnPanels(h, ["p1"], pause);
          await driveBatch(h, [{ kind: "dockPanel", panelId: "p1" }], pause);
          await applyZeroStagger(clock);
          await driveBatch(h, [{ kind: "undockPanel", panelId: "p1" }], pause);
          await applyZeroStagger(clock);
          const texts = (await readJarvis(h, pause)).entries.map((entry) => {
            return entry.text;
          });
          expect(
            texts.filter((text) => {
              return text.startsWith("drive: ");
            }),
          ).toEqual(["drive: dockPanel", "drive: undockPanel"]);
          expect(await dockedIds(h, pause)).toEqual([]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("skipped outcomes add no transcript row", async () => {
      const h = makeHarness();

      try {
        await driveBatch(h, [{ kind: "undockPanel", panelId: "nope" }]);
        await settle();
        expect(await batchStatuses(h)).toEqual(["skipped"]);
        expect(
          (await readJarvis(h)).entries.some((entry) => {
            return entry.text.startsWith("drive: ");
          }),
        ).toBe(false);
      } finally {
        await h.teardown();
      }
    });
  });
}

function switchTo(tab: "credit" | "equities" | "admin"): DriveCommand {
  return { kind: "switchTab", tab };
}

function tabsOf(outcomes: readonly DriveOutcome[]): string[] {
  return outcomes.map((outcome) => {
    return outcome.command.kind === "switchTab" ? outcome.command.tab : "?";
  });
}

async function batchTabs(
  h: CoreHarness,
  pause: () => Promise<void>,
): Promise<string[]> {
  return tabsOf(
    (await readLatest(h.app.presenters.jarvisDriver.state$, pause)).lastBatch,
  );
}

async function batchResults(
  h: CoreHarness,
  pause: () => Promise<void>,
): Promise<[string, string | undefined][]> {
  return (
    await readLatest(h.app.presenters.jarvisDriver.state$, pause)
  ).lastBatch.map((outcome): [string, string | undefined] => {
    return [outcome.status, outcome.reason];
  });
}

async function batchStatuses(
  h: CoreHarness,
  pause: () => Promise<void> = settle,
): Promise<string[]> {
  return (
    await readLatest(h.app.presenters.jarvisDriver.state$, pause)
  ).lastBatch.map((outcome) => {
    return outcome.status;
  });
}

/** Let every zero-delay command of a batch land. Each one is scheduled only
 * once the previous has applied, so this steps the clock a millisecond at a
 * time — a few milliseconds in all, far below `DRIVE_STAGGER_MS`, so a
 * batch still staggering would show only its first command. */
async function applyZeroStagger(clock: FakeClock): Promise<void> {
  for (let step = 0; step < ZERO_STAGGER_STEPS; step++) {
    await clock.advance(1);
    await clock.settle();
  }
}

/** More steps than any batch here has commands. */
const ZERO_STAGGER_STEPS = 8;

/** Power-saver freeze: every batch applies without a stagger. */
async function freeze(h: CoreHarness, clock: FakeClock): Promise<void> {
  h.app.presenters.powerSaver.setLevel("freeze");
  await clock.settle();
}
