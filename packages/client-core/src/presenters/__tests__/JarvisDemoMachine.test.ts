import { BehaviorSubject, Subject } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_SKIN,
  Direction,
  JARVIS_BRAINS,
  type PowerSaverLevel,
} from "@rtc/domain";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import {
  createJarvisDemoMachine,
  DEMO_STEP_BEAT_MS,
  DEMO_STEP_TIMEOUT_MS,
  guideCommand,
  JARVIS_DEMO_STEPS,
  type JarvisDemoDeps,
  type JarvisDemoState,
} from "../JarvisDemoMachine";
import type { JarvisEntry, JarvisState } from "../JarvisMachine";

describe("createJarvisDemoMachine", () => {
  it("starts idle with the static stepCount", () => {
    const ts = scheduler();
    ts.run(() => {
      const h = buildHarness();
      const demo = createJarvisDemoMachine(depsFrom(h, ts));
      let seen: JarvisDemoState | undefined;
      demo.state$.subscribe((s) => {
        seen = s;
      });
      expect(seen).toEqual({
        running: false,
        stepIndex: 0,
        stepCount: JARVIS_DEMO_STEPS.length,
        label: null,
      });
    });
  });

  it("JARVIS_DEMO_STEPS resolves to the exact spec'd 7 commands and labels — pins guideCommand's derivation against catalog drift", () => {
    expect(
      JARVIS_DEMO_STEPS.map((step) => {
        return { label: step.label, command: step.command };
      }),
    ).toEqual(EXPECTED_STEPS);
    expect(JARVIS_DEMO_STEPS[EXECUTION_STEP_INDEX]?.awaitsConfirmation).toBe(
      true,
    );
    expect(JARVIS_DEMO_STEPS[JARVIS_DEMO_STEPS.length - 1]?.closesOverlay).toBe(
      true,
    );
  });

  it("plays all 7 steps in order, one sendScripted per settle, with 1200ms beats", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const demo = createJarvisDemoMachine(depsFrom(h, ts));
      const callFrames: number[] = [];
      h.sendScripted.mockImplementation((text: string) => {
        callFrames.push(ts.now());
        buildAutoSettlingSendScripted(
          h.jarvisState$,
          h.jarvisEvents$,
          h.nextId,
        )(text);
      });

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      expect(commandOrder(h)).toEqual(
        EXPECTED_STEPS.map((step) => {
          return step.command;
        }),
      );
      expect(callFrames).toEqual([
        1,
        1 + DEMO_STEP_BEAT_MS,
        1 + 2 * DEMO_STEP_BEAT_MS,
        1 + 3 * DEMO_STEP_BEAT_MS,
        1 + 4 * DEMO_STEP_BEAT_MS,
        1 + 5 * DEMO_STEP_BEAT_MS,
        1 + 6 * DEMO_STEP_BEAT_MS,
      ]);
    });
  });

  it("beat is 0 under freeze", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness({ powerSaverLevel: "freeze" });
      const demo = createJarvisDemoMachine(depsFrom(h, ts));
      const callFrames: number[] = [];
      h.sendScripted.mockImplementation((text: string) => {
        callFrames.push(ts.now());
        buildAutoSettlingSendScripted(
          h.jarvisState$,
          h.jarvisEvents$,
          h.nextId,
        )(text);
      });

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      // All 7 calls land on the SAME frame — no beat under freeze.
      expect(callFrames).toEqual(new Array(7).fill(1));
    });
  });

  it("powerSaverLevel$ is re-read fresh per step: a mid-run flip to freeze collapses the NEXT beat to 0, and flipping back restores 1200", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const callFrames: number[] = [];
      const secondCommand = EXPECTED_STEPS[1]?.command as string;
      const thirdCommand = EXPECTED_STEPS[2]?.command as string;

      h.sendScripted.mockImplementation((text: string) => {
        callFrames.push(ts.now());

        // Flipped from INSIDE the mock (not via ts.schedule at some fixed
        // frame) so the change is synchronously visible before
        // runStepPatches$'s own readLatest(powerSaverLevel$) call for the
        // NEXT beat — that read only happens once THIS synchronous call
        // returns and the auto-settled "done" has propagated, so this is
        // the exact moment the mechanism itself reads fresh, without
        // needing any TestScheduler same-frame ordering games.
        if (text === secondCommand) {
          // Freezes the step-2 → step-3 gap.
          h.powerSaverLevel$.next("freeze");
        }

        if (text === thirdCommand) {
          // Restores the step-3 → step-4 gap.
          h.powerSaverLevel$.next("off");
        }

        buildAutoSettlingSendScripted(
          h.jarvisState$,
          h.jarvisEvents$,
          h.nextId,
        )(text);
      });

      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      expect(callFrames).toEqual([
        1,
        1 + DEMO_STEP_BEAT_MS,
        1 + DEMO_STEP_BEAT_MS, // frozen: step 2 → step 3 gap collapses to 0
        1 + 2 * DEMO_STEP_BEAT_MS, // restored: step 3 → step 4 gap back to 1200
        1 + 3 * DEMO_STEP_BEAT_MS,
        1 + 4 * DEMO_STEP_BEAT_MS,
        1 + 5 * DEMO_STEP_BEAT_MS,
      ]);
      expect(commandOrder(h)).toEqual(
        EXPECTED_STEPS.map((step) => {
          return step.command;
        }),
      );
    });
  });

  it("step 6 waits for the confirm card and declines it after exactly one beat (deps exposes no way to approve one)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      h.sendScripted.mockImplementation(
        buildAutoSettlingSendScripted(
          h.jarvisState$,
          h.jarvisEvents$,
          h.nextId,
          {
            [EXECUTION_COMMAND as string]: withConfirmFlow(h),
          },
        ),
      );

      const declineFrames: number[] = [];
      h.declineConfirmation.mockImplementation(() => {
        declineFrames.push(ts.now());
        const s = h.jarvisState$.getValue();
        h.jarvisState$.next({ ...s, pendingConfirmation: null });
        h.jarvisEvents$.next({ type: "done" });
      });

      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      const executionFrame = 1 + EXECUTION_STEP_INDEX * DEMO_STEP_BEAT_MS;
      const declineFrame = executionFrame + DEMO_STEP_BEAT_MS;

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      // Declined exactly one beat after the confirm card appeared — never
      // sooner, never twice.
      expect(declineFrames).toEqual([declineFrame]);
      // The demo carries on to the final step afterward — the whole
      // 7-command script still completes, decline included.
      expect(commandOrder(h)).toEqual(
        EXPECTED_STEPS.map((step) => {
          return step.command;
        }),
      );
    });
  });

  it("step 7 closes the overlay before sending and reopens after settling", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      const lastStep = JARVIS_DEMO_STEPS[JARVIS_DEMO_STEPS.length - 1];
      expect(lastStep?.closesOverlay).toBe(true);

      // open() is called once at demo start and once at the very end.
      expect(h.open).toHaveBeenCalledTimes(2);
      expect(h.close).toHaveBeenCalledTimes(1);

      const closeOrder = h.close.mock.invocationCallOrder[0];
      const lastSendOrder =
        h.sendScripted.mock.invocationCallOrder[
          h.sendScripted.mock.invocationCallOrder.length - 1
        ];

      const finalOpenOrder =
        h.open.mock.invocationCallOrder[
          h.open.mock.invocationCallOrder.length - 1
        ];

      expect(closeOrder).toBeLessThan(lastSendOrder as number);
      expect(finalOpenOrder).toBeGreaterThan(lastSendOrder as number);
    });
  });

  it("stopDemo mid-run returns to idle and declines any pending card", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      h.sendScripted.mockImplementation(
        buildAutoSettlingSendScripted(
          h.jarvisState$,
          h.jarvisEvents$,
          h.nextId,
          {
            [EXECUTION_COMMAND as string]: withConfirmFlow(h),
          },
        ),
      );

      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      const executionFrame = 1 + EXECUTION_STEP_INDEX * DEMO_STEP_BEAT_MS;

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      // One virtual tick after the confirm card lands (still well before
      // the machine's own one-beat decline timer would fire at
      // executionFrame + DEMO_STEP_BEAT_MS) — a genuine mid-wait stop.
      ts.schedule(() => {
        demo.intents.stopDemo();
      }, executionFrame + 1);

      flush();

      expect(h.declineConfirmation).toHaveBeenCalledTimes(1);
      // The final step ("Set up my morning workspace") is never reached.
      expect(commandOrder(h)).not.toContain(
        EXPECTED_STEPS[EXPECTED_STEPS.length - 1]?.command,
      );

      let final: JarvisDemoState | undefined;
      demo.state$.subscribe((s) => {
        final = s;
      });
      expect(final).toEqual({
        running: false,
        stepIndex: 0,
        stepCount: JARVIS_DEMO_STEPS.length,
        label: null,
      });
      // The overlay was never closed at this point in the run (stop landed
      // on step 6, well before step 7's closesOverlay) — stopDemo's own
      // reopen guard must NOT fire spuriously: only the demo-start open()
      // call happened.
      expect(h.open).toHaveBeenCalledTimes(1);
    });
  });

  it("stopDemo reopens the overlay if the stopped run had closed it (M1: symmetric with the error/complete exit paths)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      const lastStepFrame =
        1 + (JARVIS_DEMO_STEPS.length - 1) * DEMO_STEP_BEAT_MS;

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);
      // One tick after step 7's own advance — jarvis.close() has already
      // fired and its auto-settled turn has already "done", but the
      // post-settle beat hasn't elapsed yet, so finishPatch$'s own reopen
      // hasn't run naturally. A genuine "closed, not yet reopened" window.
      ts.schedule(() => {
        demo.intents.stopDemo();
      }, lastStepFrame + 1);

      flush();

      expect(h.close).toHaveBeenCalledTimes(1);
      // open() fires once at demo start, and again from stopDemo's reopen
      // guard — NOT from finishPatch$, which never got the chance to run
      // (takeUntil cut the chain first).
      expect(h.open).toHaveBeenCalledTimes(2);

      let final: JarvisDemoState | undefined;
      demo.state$.subscribe((s) => {
        final = s;
      });
      expect(final).toEqual({
        running: false,
        stepIndex: 0,
        stepCount: JARVIS_DEMO_STEPS.length,
        label: null,
      });
    });
  });

  it("stopDemo with no pending confirmation is a plain no-op decline (never calls declineConfirmation)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);
      // Stop well before the execution step's confirm card ever appears.
      ts.schedule(() => {
        demo.intents.stopDemo();
      }, 2);

      flush();

      expect(h.declineConfirmation).not.toHaveBeenCalled();
    });
  });

  it("startDemo while running is a no-op (single chain)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);
      // Fired again well before the FIRST step's own post-settle beat
      // elapses (that beat ends at 1 + DEMO_STEP_BEAT_MS) — a genuine
      // "still running" re-entry attempt.
      ts.schedule(() => {
        demo.intents.startDemo();
      }, 2);

      flush();

      expect(commandOrder(h)).toEqual(
        EXPECTED_STEPS.map((step) => {
          return step.command;
        }),
      );
    });
  });

  it("an errored turn aborts the remaining steps to idle", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const erroringStepIndex = 2;
      const erroringCommand = EXPECTED_STEPS[erroringStepIndex]
        ?.command as string;

      h.sendScripted.mockImplementation(
        buildAutoSettlingSendScripted(
          h.jarvisState$,
          h.jarvisEvents$,
          h.nextId,
          {
            [erroringCommand]: (text: string) => {
              appendTurnPair(h.jarvisState$, h.nextId, text);
              h.jarvisEvents$.next({
                type: "error",
                message: "quote unavailable",
              });
            },
          },
        ),
      );

      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      // Only steps 0..erroringStepIndex ever ran — nothing after.
      expect(commandOrder(h)).toEqual(
        EXPECTED_STEPS.slice(0, erroringStepIndex + 1).map((step) => {
          return step.command;
        }),
      );

      let final: JarvisDemoState | undefined;
      demo.state$.subscribe((s) => {
        final = s;
      });
      expect(final).toEqual({
        running: false,
        stepIndex: 0,
        stepCount: JARVIS_DEMO_STEPS.length,
        label: null,
      });
      // The abort tail still reopens the overlay (idempotent — see
      // runDemo$'s doc), same as a natural finish.
      expect(h.open).toHaveBeenCalledTimes(2);
    });
  });

  it("a step whose settle never arrives (silent no-op send — e.g. WS-mode unavailable) times out after DEMO_STEP_TIMEOUT_MS and aborts to idle, reopening the overlay it had closed", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      // The LAST step: it both closes the overlay AND is the one whose
      // settle never arrives, so this single test also proves the "reopens
      // the overlay if the aborting step had closed it" sub-clause.
      const stuckIndex = EXPECTED_STEPS.length - 1;
      const stuckCommand = EXPECTED_STEPS[stuckIndex]?.command as string;
      const openFrames: number[] = [];
      h.open.mockImplementation(() => {
        openFrames.push(ts.now());
      });

      h.sendScripted.mockImplementation(
        buildAutoSettlingSendScripted(
          h.jarvisState$,
          h.jarvisEvents$,
          h.nextId,
          {
            [stuckCommand]: () => {
              // Silent no-op — mirrors JarvisMachine's real behavior while
              // `available` is false: `turnRequests$`'s concatMap returns
              // EMPTY, so no entries pair and no jarvisEvents$ emission
              // EVER arrive for this call — runStep's watcher has nothing
              // to observe, ever.
            },
          },
        ),
      );

      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      // sendScripted WAS called for the stuck step (the demo has no way to
      // know it silently no-op'd) but the demo never advances past it.
      expect(commandOrder(h)).toEqual(
        EXPECTED_STEPS.slice(0, stuckIndex + 1).map((step) => {
          return step.command;
        }),
      );

      let final: JarvisDemoState | undefined;
      demo.state$.subscribe((s) => {
        final = s;
      });
      expect(final).toEqual({
        running: false,
        stepIndex: 0,
        stepCount: JARVIS_DEMO_STEPS.length,
        label: null,
      });
      expect(h.close).toHaveBeenCalledTimes(1);
      // open() fires at demo start AND again from the abort tail — the
      // watchdog timeout takes the SAME reopen-and-reset path as an errored
      // turn (runDemo$'s catchError), so the overlay the stuck step had
      // closed is reopened even though it never settled. The second open()
      // lands EXACTLY DEMO_STEP_TIMEOUT_MS after the stuck step's own
      // advance (no post-settle beat on the abort path — see
      // runStepPatches$'s doc).
      const stuckStepFrame = 1 + stuckIndex * DEMO_STEP_BEAT_MS;
      expect(openFrames).toEqual([1, stuckStepFrame + DEMO_STEP_TIMEOUT_MS]);
    });
  });

  it("a narrator turn's decoy 'done' arriving BEFORE the step's own [user, jarvis] pair does not advance the demo", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const firstCommand = EXPECTED_STEPS[0]?.command as string;

      h.sendScripted.mockImplementationOnce((text: string) => {
        // Simulate a narrate() turn that was already queued ahead of this
        // step's sendScripted() call: its OWN [user(origin:narrator),
        // jarvis] pair appears and settles FIRST, entirely before this
        // step's real pair ever lands.
        appendTurnPair(
          h.jarvisState$,
          h.nextId,
          "[narration] anomaly spotted",
          "narrator",
        );
        h.jarvisEvents$.next({ type: "done" });

        // Only NOW does this step's own turn actually start (mirrors
        // JarvisMachine's single turn-queue concatMap: this step's request
        // was queued behind the narrator's, and only runs once it's done).
        appendTurnPair(h.jarvisState$, h.nextId, text);
        h.jarvisEvents$.next({ type: "done" });
      });

      const demo = createJarvisDemoMachine(depsFrom(h, ts));

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      // The decoy "done" was correctly ignored (never mistaken for step 0's
      // own settle) — sendScripted was called with step 0's real command
      // exactly once, and the demo still completed all 7 steps in order.
      expect(
        h.sendScripted.mock.calls.filter((call) => {
          return call[0] === firstCommand;
        }),
      ).toHaveLength(1);
      expect(commandOrder(h)).toEqual(
        EXPECTED_STEPS.map((step) => {
          return step.command;
        }),
      );
    });
  });

  it("progress state exposes 1-based stepIndex, static stepCount, and the step label", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const demo = createJarvisDemoMachine(depsFrom(h, ts));
      const seen: JarvisDemoState[] = [];
      demo.state$.subscribe((s) => {
        seen.push(s);
      });

      ts.schedule(() => {
        demo.intents.startDemo();
      }, 1);

      flush();

      EXPECTED_STEPS.forEach((step, index) => {
        expect(
          seen.some((s) => {
            return (
              s.running &&
              s.stepIndex === index + 1 &&
              s.stepCount === JARVIS_DEMO_STEPS.length &&
              s.label === step.label
            );
          }),
        ).toBe(true);
      });
    });
  });
});

describe("guideCommand", () => {
  it("resolves a known section + index to its command text", () => {
    expect(guideCommand("EXECUTION", 0)).toBe("Buy 5M EURUSD");
  });

  it("throws on an unknown section title", () => {
    expect(() => {
      return guideCommand("NOT A REAL SECTION", 0);
    }).toThrow(/no guide section/);
  });

  it("throws on an out-of-range index within a known section", () => {
    expect(() => {
      return guideCommand("EXECUTION", 99);
    }).toThrow(/has no item at index/);
  });
});

interface ExpectedStep {
  readonly label: string;
  readonly command: string;
}

/** The demo script's 7 commands + labels, RE-TYPED by hand (deliberately —
 * see this file's "pins guideCommand's derivation" test) — every
 * order/content assertion in this file compares against THIS literal fixture
 * rather than `JARVIS_DEMO_STEPS` itself, so a `guideCommand` lookup that
 * silently drifts (a catalog edit reassigns what index N resolves to, e.g.)
 * fails a test instead of the whole file quietly comparing derived output
 * against itself. */
const EXPECTED_STEPS: readonly ExpectedStep[] = [
  { label: "DESK BRIEFING", command: "Brief me on the desk" },
  { label: "MARKET INTEL", command: "Where is EURUSD?" },
  { label: "MARKET INTEL", command: "What's moving?" },
  { label: "GENERATIVE UI", command: "Show me GBP volatility" },
  { label: "GENERATIVE UI", command: "Make it a heatmap" },
  { label: "EXECUTION", command: "Buy 5M EURUSD" },
  { label: "MORNING WORKSPACE", command: "Set up my morning workspace" },
];

const EXECUTION_STEP_INDEX: number = JARVIS_DEMO_STEPS.findIndex((step) => {
  return step.awaitsConfirmation === true;
});

const EXECUTION_COMMAND: string | undefined =
  EXPECTED_STEPS[EXECUTION_STEP_INDEX]?.command;

/** The `confirmRequest` event's fields minus its `type` discriminant — the
 * shared fixture `withConfirmFlow` spreads into both `pendingConfirmation`
 * (plus `remainingFraction`) and the real `JarvisEvent` union member. */
interface ConfirmFixture {
  readonly confirmationId: string;
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
  readonly quotedPrice: number;
  readonly ratePrecision: number;
}

const CONFIRM_FIXTURE: ConfirmFixture = {
  confirmationId: "confirm-1",
  symbol: "EURUSD",
  direction: Direction.Buy,
  notional: 5_000_000,
  quotedPrice: 1.0821,
  ratePrecision: 4,
};

function baseJarvisState(overrides: Partial<JarvisState> = {}): JarvisState {
  return {
    open: false,
    skin: DEFAULT_JARVIS_SKIN,
    unread: 0,
    unreadNarration: false,
    phase: "idle",
    entries: [{ id: 0, role: "jarvis", text: "hi", done: true }],
    pendingConfirmation: null,
    available: true,
    brains: JARVIS_BRAINS,
    effectiveBrain: DEFAULT_JARVIS_BRAIN,
    gate: null,
    openCount: 0,
    ...overrides,
  };
}

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** Mutable counter shared between `buildAutoSettlingSendScripted` and
 * `appendTurnPair` for allocating fresh entry ids — the same "just a mutable
 * ref" shape `JarvisMachine.ts`'s own `nextEntryId` uses, boxed in an object
 * so both helpers observe the SAME running counter. */
interface NextIdCounter {
  current: number;
}

/** Simulates a real `JarvisMachine`'s turn behavior closely enough for this
 * machine's own logic to exercise: appends the `[userEntry, jarvisEntry]`
 * pair `entryPatches$`'s "start" item would, flips `phase` to "speaking",
 * and — UNLESS `text` is the confirm-gated execution command (handled by
 * `withConfirmFlow` below) — immediately emits a `"done"` event, mirroring
 * a zero-latency scripted reply. Every harness in this file builds its
 * `sendScripted` mock by composing this with `overrides` for the one or two
 * commands a given test needs different behavior from (an error instead of
 * a done, a narrator decoy first, etc).
 */
function buildAutoSettlingSendScripted(
  jarvisState$: BehaviorSubject<JarvisState>,
  jarvisEvents$: Subject<JarvisEvent>,
  nextId: NextIdCounter,
  overrides: Record<string, (text: string) => void> = {},
): (text: string) => void {
  return (text: string) => {
    const override = overrides[text];

    if (override) {
      override(text);
      return;
    }

    appendTurnPair(jarvisState$, nextId, text);
    jarvisEvents$.next({ type: "done" });
  };
}

function appendTurnPair(
  jarvisState$: BehaviorSubject<JarvisState>,
  nextId: NextIdCounter,
  text: string,
  origin?: "narrator",
): void {
  const s = jarvisState$.getValue();
  const userEntry: JarvisEntry = {
    id: nextId.current++,
    role: "user",
    text,
    done: true,
    ...(origin ? { origin } : {}),
  };

  const jarvisEntry: JarvisEntry = {
    id: nextId.current++,
    role: "jarvis",
    text: "",
    done: false,
  };

  jarvisState$.next({
    ...s,
    phase: "speaking",
    entries: [...s.entries, userEntry, jarvisEntry],
  });
}

interface Harness {
  readonly jarvisState$: BehaviorSubject<JarvisState>;
  readonly jarvisEvents$: Subject<JarvisEvent>;
  readonly powerSaverLevel$: BehaviorSubject<PowerSaverLevel>;
  readonly open: ReturnType<typeof vi.fn<() => void>>;
  readonly close: ReturnType<typeof vi.fn<() => void>>;
  readonly sendScripted: ReturnType<typeof vi.fn<(text: string) => void>>;
  readonly declineConfirmation: ReturnType<typeof vi.fn<() => void>>;
  readonly nextId: NextIdCounter;
}

interface HarnessOverrides {
  readonly powerSaverLevel?: PowerSaverLevel;
}

/** Builds a harness whose `sendScripted` mock defaults to
 * `buildAutoSettlingSendScripted`'s zero-latency "append pair, then done"
 * behavior for every command. A test that needs different behavior for one
 * or more commands replaces it afterward via
 * `h.sendScripted.mockImplementation(buildAutoSettlingSendScripted(..., {
 * [command]: ... }))` — see the "step 6"/"stopDemo"/"errored turn" tests
 * below for the pattern. */
function buildHarness(overrides: HarnessOverrides = {}): Harness {
  const jarvisState$ = new BehaviorSubject<JarvisState>(baseJarvisState());
  const jarvisEvents$ = new Subject<JarvisEvent>();
  const nextId: NextIdCounter = { current: 1 };

  const declineConfirmation = vi.fn<() => void>(() => {
    const s = jarvisState$.getValue();

    if (!s.pendingConfirmation) {
      return;
    }

    jarvisState$.next({ ...s, pendingConfirmation: null });
    jarvisEvents$.next({ type: "done" });
  });

  const sendScripted = vi.fn(
    buildAutoSettlingSendScripted(jarvisState$, jarvisEvents$, nextId),
  );

  return {
    jarvisState$,
    jarvisEvents$,
    powerSaverLevel$: new BehaviorSubject<PowerSaverLevel>(
      overrides.powerSaverLevel ?? "off",
    ),
    open: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    sendScripted,
    declineConfirmation,
    nextId,
  };
}

function depsFrom(h: Harness, ts: TestScheduler): JarvisDemoDeps {
  return {
    jarvisState$: h.jarvisState$,
    jarvisEvents$: h.jarvisEvents$,
    jarvis: {
      open: h.open,
      close: h.close,
      sendScripted: h.sendScripted,
      declineConfirmation: h.declineConfirmation,
    },
    powerSaverLevel$: h.powerSaverLevel$,
    scheduler: ts,
  };
}

/** The confirm-gated execution step's realistic `sendScripted` override:
 * appends the turn pair, then emits `"confirmRequest"` (and mirrors
 * `pendingConfirmation` onto `jarvisState$`, the same field
 * `JarvisMachine.ts`'s own `eventPatch` sets) instead of an immediate
 * `"done"` — the demo machine's own `declineConfirmation` call (via
 * `harness.declineConfirmation` above) is what eventually resolves the turn. */
function withConfirmFlow(h: Harness): (text: string) => void {
  return (text: string) => {
    appendTurnPair(h.jarvisState$, h.nextId, text);
    h.jarvisState$.next({
      ...h.jarvisState$.getValue(),
      pendingConfirmation: { ...CONFIRM_FIXTURE, remainingFraction: 1 },
    });
    h.jarvisEvents$.next({ type: "confirmRequest", ...CONFIRM_FIXTURE });
  };
}

function commandOrder(h: Harness): readonly string[] {
  return h.sendScripted.mock.calls.map((call) => {
    return call[0] as string;
  });
}
