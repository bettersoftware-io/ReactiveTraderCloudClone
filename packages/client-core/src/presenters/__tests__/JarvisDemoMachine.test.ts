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
        JARVIS_DEMO_STEPS.map((step) => {
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
        JARVIS_DEMO_STEPS.map((step) => {
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
        JARVIS_DEMO_STEPS[JARVIS_DEMO_STEPS.length - 1]?.command,
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
        JARVIS_DEMO_STEPS.map((step) => {
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
      const erroringCommand = JARVIS_DEMO_STEPS[erroringStepIndex]
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
        JARVIS_DEMO_STEPS.slice(0, erroringStepIndex + 1).map((step) => {
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

  it("a narrator turn's decoy 'done' arriving BEFORE the step's own [user, jarvis] pair does not advance the demo", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const h = buildHarness();
      const firstCommand = JARVIS_DEMO_STEPS[0]?.command as string;

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
        JARVIS_DEMO_STEPS.map((step) => {
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

      JARVIS_DEMO_STEPS.forEach((step, index) => {
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

const EXECUTION_STEP_INDEX: number = JARVIS_DEMO_STEPS.findIndex((step) => {
  return step.awaitsConfirmation === true;
});

const EXECUTION_COMMAND: string | undefined =
  JARVIS_DEMO_STEPS[EXECUTION_STEP_INDEX]?.command;

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
