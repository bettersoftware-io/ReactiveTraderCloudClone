import { Observable, Subject } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";

import type { PanelSpecV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import {
  createJarvisPanelsMachine,
  type JarvisPanelsState,
  MAX_LIVE_PANELS,
  type PanelInstance,
  UNSUPPORTED_SENTINEL_SPEC,
} from "../JarvisPanelsMachine";

describe("createJarvisPanelsMachine", () => {
  it("starts with no panels", () => {
    const ts = scheduler();
    ts.run(() => {
      const events$ = new Subject<JarvisEvent>();
      const machine = createJarvisPanelsMachine(events$);
      let current: JarvisPanelsState | undefined;
      const sub = machine.state$.subscribe((s) => {
        current = s;
      });
      expect(current).toEqual({ panels: [] });
      sub.unsubscribe();
    });
  });

  it("a panel event for a new panelId appends a new live panel", () => {
    const states = run(
      () => {
        return undefined;
      },
      ({ events$, ts }) => {
        ts.schedule(() => {
          events$.next(panelEvent("p1", makeSpec("EURUSD vol")));
        }, 1);
      },
    );

    const last = states.at(-1);
    expect(last?.panels).toEqual([
      { panelId: "p1", spec: makeSpec("EURUSD vol"), status: "live" },
    ]);
  });

  it("a second panel event for the SAME panelId replaces it in place, preserving array order (a morph, not a move)", () => {
    const states = run(
      () => {
        return undefined;
      },
      ({ events$, ts }) => {
        ts.schedule(() => {
          events$.next(panelEvent("p1", makeSpec("first")));
        }, 1);
        ts.schedule(() => {
          events$.next(panelEvent("p2", makeSpec("second")));
        }, 2);
        ts.schedule(() => {
          // Edits p1 with a new spec. If this were append-based, p1 would
          // move to the end; a morph keeps it at index 0.
          events$.next(panelEvent("p1", makeSpec("first-edited")));
        }, 3);
      },
    );

    const last = states.at(-1);
    expect(
      last?.panels.map((p) => {
        return p.panelId;
      }),
    ).toEqual(["p1", "p2"]);
    expect(last?.panels[0]).toEqual({
      panelId: "p1",
      spec: makeSpec("first-edited"),
      status: "live",
    });
    expect(last?.panels[1]).toEqual({
      panelId: "p2",
      spec: makeSpec("second"),
      status: "live",
    });
  });

  it(`the ${MAX_LIVE_PANELS + 1}th spawn (a 5th NEW panelId) evicts index 0 — FIFO`, () => {
    const states = run(
      () => {
        return undefined;
      },
      ({ events$, ts }) => {
        ["p1", "p2", "p3", "p4", "p5"].forEach((panelId, i) => {
          ts.schedule(() => {
            events$.next(panelEvent(panelId, makeSpec(panelId)));
          }, i + 1);
        });
      },
    );

    const last = states.at(-1);
    expect(
      last?.panels.map((p) => {
        return p.panelId;
      }),
    ).toEqual(["p2", "p3", "p4", "p5"]);
    expect(last?.panels).toHaveLength(MAX_LIVE_PANELS);
  });

  it("an edit to an existing panelId does NOT evict, even already at MAX_LIVE_PANELS", () => {
    const states = run(
      () => {
        return undefined;
      },
      ({ events$, ts }) => {
        ["p1", "p2", "p3", "p4"].forEach((panelId, i) => {
          ts.schedule(() => {
            events$.next(panelEvent(panelId, makeSpec(panelId)));
          }, i + 1);
        });
        ts.schedule(() => {
          // Edits p1, already the oldest — must NOT be treated as a spawn
          // (which would evict something) since it targets a live panelId.
          events$.next(panelEvent("p1", makeSpec("p1-edited")));
        }, 5);
      },
    );

    const last = states.at(-1);
    expect(
      last?.panels.map((p) => {
        return p.panelId;
      }),
    ).toEqual(["p1", "p2", "p3", "p4"]);
    expect(last?.panels[0]?.spec?.title).toBe("p1-edited");
  });

  it("dismissPanel removes the matching panel and leaves the rest untouched", () => {
    const states: JarvisPanelsState[] = [];
    const ts = scheduler();
    ts.run(({ flush }) => {
      const events$ = new Subject<JarvisEvent>();
      const machine = createJarvisPanelsMachine(events$);
      const sub = machine.state$.subscribe((s) => {
        states.push(s);
      });
      ts.schedule(() => {
        events$.next(panelEvent("p1", makeSpec("p1")));
      }, 1);
      ts.schedule(() => {
        events$.next(panelEvent("p2", makeSpec("p2")));
      }, 2);
      ts.schedule(() => {
        machine.dismissPanel("p1");
      }, 3);
      flush();
      sub.unsubscribe();
    });

    const last = states.at(-1);
    expect(
      last?.panels.map((p) => {
        return p.panelId;
      }),
    ).toEqual(["p2"]);
  });

  it("dismissing an unknown panelId is a silent no-op", () => {
    const states = run(
      () => {
        return undefined;
      },
      ({ events$, machine, ts }) => {
        ts.schedule(() => {
          events$.next(panelEvent("p1", makeSpec("p1")));
        }, 1);
        ts.schedule(() => {
          machine.dismissPanel("does-not-exist");
        }, 2);
      },
    );

    const last = states.at(-1);
    expect(
      last?.panels.map((p) => {
        return p.panelId;
      }),
    ).toEqual(["p1"]);
  });

  it("a later edit targeting a DISMISSED panelId appends it as a fresh panel (never errors)", () => {
    const states: JarvisPanelsState[] = [];
    const ts = scheduler();
    ts.run(({ flush }) => {
      const events$ = new Subject<JarvisEvent>();
      const machine = createJarvisPanelsMachine(events$);
      const sub = machine.state$.subscribe((s) => {
        states.push(s);
      });
      ts.schedule(() => {
        events$.next(panelEvent("p1", makeSpec("p1")));
      }, 1);
      ts.schedule(() => {
        events$.next(panelEvent("p2", makeSpec("p2")));
      }, 2);
      ts.schedule(() => {
        machine.dismissPanel("p1");
      }, 3);
      ts.schedule(() => {
        // "Edits" p1 again, but p1 was dismissed — this must be treated as
        // a brand-new spawn (appended), never an error/no-op.
        events$.next(panelEvent("p1", makeSpec("p1-reborn")));
      }, 4);
      flush();
      sub.unsubscribe();
    });

    const last = states.at(-1);
    expect(
      last?.panels.map((p) => {
        return p.panelId;
      }),
    ).toEqual(["p2", "p1"]);
    expect(last?.panels[1]).toEqual({
      panelId: "p1",
      spec: makeSpec("p1-reborn"),
      status: "live",
    });
  });

  it("a panel event whose spec IS the UNSUPPORTED_SENTINEL_SPEC (by reference) maps to status: unsupported, spec: null", () => {
    const states = run(
      () => {
        return undefined;
      },
      ({ events$, ts }) => {
        ts.schedule(() => {
          events$.next(panelEvent("p1", UNSUPPORTED_SENTINEL_SPEC));
        }, 1);
      },
    );

    const last = states.at(-1);
    expect(last?.panels).toEqual([
      { panelId: "p1", spec: null, status: "unsupported" },
    ]);
  });

  it("a structurally-identical-but-distinct spec object is NOT treated as the sentinel — reference equality only", () => {
    const lookalike: PanelSpecV1 = {
      v: 1,
      title: "Unsupported panel",
      source: { kind: "blotter" },
      transforms: [],
      viz: { kind: "table" },
    };
    expect(lookalike).not.toBe(UNSUPPORTED_SENTINEL_SPEC);

    const states = run(
      () => {
        return undefined;
      },
      ({ events$, ts }) => {
        ts.schedule(() => {
          events$.next(panelEvent("p1", lookalike));
        }, 1);
      },
    );

    const last = states.at(-1);
    expect(last?.panels).toEqual([
      { panelId: "p1", spec: lookalike, status: "live" },
    ]);
  });

  it("non-panel JarvisEvents (delta, done, etc.) are ignored", () => {
    const states = run(
      () => {
        return undefined;
      },
      ({ events$, ts }) => {
        ts.schedule(() => {
          events$.next({ type: "delta", text: "hello" });
        }, 1);
        ts.schedule(() => {
          events$.next({ type: "done" });
        }, 2);
      },
    );

    expect(
      states.every((s) => {
        return s.panels.length === 0;
      }),
    ).toBe(true);
  });

  it("a late subscriber replays the current state rather than starting from empty", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const events$ = new Subject<JarvisEvent>();
      const machine = createJarvisPanelsMachine(events$);
      const early: JarvisPanelsState[] = [];
      const earlySub = machine.state$.subscribe((s) => {
        early.push(s);
      });

      ts.schedule(() => {
        events$.next(panelEvent("p1", makeSpec("p1")));
      }, 1);

      let late: PanelInstance[] | undefined;
      ts.schedule(() => {
        const lateSub = machine.state$.subscribe((s) => {
          late = [...s.panels];
        });
        lateSub.unsubscribe();
      }, 2);

      flush();
      earlySub.unsubscribe();
      expect(late).toEqual([
        { panelId: "p1", spec: makeSpec("p1"), status: "live" },
      ]);
    });
  });

  describe("warm-subscription semantics (pins createJarvisPanelsMachine's internal `state$.subscribe()`)", () => {
    // These two tests exist to catch a mutant that deleting the machine's
    // internal warm `state$.subscribe()` would otherwise leave undetected:
    // every other test in this file drives events through an EXTERNALLY
    // held subscription, so the warm subscription's own job — keeping
    // state$'s refCount above zero between external subscribers — is never
    // exercised. Without it, a panel event fired while nobody is externally
    // subscribed is lost, and any subscribe/unsubscribe/re-subscribe cycle
    // tears the underlying `scan` fold down and restarts it from INITIAL
    // (the ws-effects #171 leak class: a fresh stream per re-subscribe).

    it("a panel event pushed before any external subscriber is captured by the warm internal subscription — a later subscribe replays it, not empty", () => {
      const ts = scheduler();
      ts.run(() => {
        const events$ = new Subject<JarvisEvent>();
        const machine = createJarvisPanelsMachine(events$);

        // No external subscriber yet — only the machine's own internal warm
        // subscription (held from construction) is live. Without it, this
        // event fires into a hot Subject with nobody listening and is lost
        // for good; state$ would replay an empty INITIAL to the subscriber
        // below instead.
        events$.next(panelEvent("p1", makeSpec("p1")));

        let current: JarvisPanelsState | undefined;
        const sub = machine.state$.subscribe((s) => {
          current = s;
        });
        expect(current?.panels).toEqual([
          { panelId: "p1", spec: makeSpec("p1"), status: "live" },
        ]);
        sub.unsubscribe();
      });
    });

    it("the fold accumulates across an external subscribe/unsubscribe/re-subscribe cycle rather than resetting, and events$ is subscribed exactly once for the whole scenario", () => {
      const ts = scheduler();
      ts.run(() => {
        const rawEvents$ = new Subject<JarvisEvent>();
        let subscribeCount = 0;
        // An instrumented source: counts every subscription to the RAW
        // event source, independent of how many times state$ itself is
        // subscribed/unsubscribed from the outside.
        const events$ = new Observable<JarvisEvent>((subscriber) => {
          subscribeCount += 1;
          return rawEvents$.subscribe(subscriber);
        });

        const machine = createJarvisPanelsMachine(events$);

        const firstSub = machine.state$.subscribe();
        rawEvents$.next(panelEvent("p1", makeSpec("p1")));
        firstSub.unsubscribe();

        // If the warm internal subscription didn't exist, the line above
        // would have dropped state$'s refCount to zero, tearing the fold
        // (and its events$ subscription) down — this push would be lost.
        rawEvents$.next(panelEvent("p2", makeSpec("p2")));

        let current: JarvisPanelsState | undefined;
        const secondSub = machine.state$.subscribe((s) => {
          current = s;
        });

        expect(
          current?.panels.map((p) => {
            return p.panelId;
          }),
        ).toEqual(["p1", "p2"]);
        // events$ was subscribed exactly once for the whole scenario — proof
        // the underlying fold was never torn down and rebuilt mid-session.
        expect(subscribeCount).toBe(1);
        secondSub.unsubscribe();
      });
    });
  });
});

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

function makeSpec(title: string): PanelSpecV1 {
  return {
    v: 1,
    title,
    source: { kind: "blotter" },
    transforms: [],
    viz: { kind: "table" },
  };
}

function panelEvent(panelId: string, spec: PanelSpecV1): JarvisEvent {
  return { type: "panel", panelId, spec };
}

interface RunCtx {
  machine: ReturnType<typeof createJarvisPanelsMachine>;
  ts: TestScheduler;
  events$: Subject<JarvisEvent>;
}

/** Collect every emission of a machine's state$ as it runs, marble-driven —
 * same idiom as JarvisMachine.test.ts's `run` helper. */
function run(
  buildEvents: (ts: TestScheduler) => JarvisEvent[] | undefined,
  drive: (ctx: RunCtx) => void,
): JarvisPanelsState[] {
  const states: JarvisPanelsState[] = [];
  const ts = scheduler();
  ts.run(({ flush }) => {
    buildEvents(ts);
    const events$ = new Subject<JarvisEvent>();
    const machine = createJarvisPanelsMachine(events$);
    const sub = machine.state$.subscribe((s) => {
      states.push(s);
    });
    drive({ machine, ts, events$ });
    flush();
    sub.unsubscribe();
  });
  return states;
}
