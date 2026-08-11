import { Observable, Subject } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";

import type { PanelSpecV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import {
  createJarvisPanelsMachine,
  type JarvisPanelsState,
  MAX_DOCKED_PANELS,
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
      {
        panelId: "p1",
        spec: makeSpec("EURUSD vol"),
        status: "live",
        docked: false,
      },
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
      docked: false,
    });
    expect(last?.panels[1]).toEqual({
      panelId: "p2",
      spec: makeSpec("second"),
      status: "live",
      docked: false,
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
      docked: false,
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
      { panelId: "p1", spec: null, status: "unsupported", docked: false },
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
      { panelId: "p1", spec: lookalike, status: "live", docked: false },
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
        { panelId: "p1", spec: makeSpec("p1"), status: "live", docked: false },
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
          {
            panelId: "p1",
            spec: makeSpec("p1"),
            status: "live",
            docked: false,
          },
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

  describe("docked panels", () => {
    it("dockPanel on an unknown panelId is a silent no-op", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.dockPanel("does-not-exist");
          }, 2);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([
        { panelId: "p1", spec: makeSpec("p1"), status: "live", docked: false },
      ]);
    });

    it("dockPanel sets docked: true IN PLACE — array position among siblings is unchanged", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            events$.next(panelEvent("p2", makeSpec("p2")));
          }, 2);
          ts.schedule(() => {
            machine.dockPanel("p1");
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
        spec: makeSpec("p1"),
        status: "live",
        docked: true,
      });
      expect(last?.panels[1]?.docked).toBe(false);
    });

    it("dockPanel on an already-docked panelId is a no-op", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.dockPanel("p1");
          }, 2);
          ts.schedule(() => {
            machine.dockPanel("p1");
          }, 3);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([
        { panelId: "p1", spec: makeSpec("p1"), status: "live", docked: true },
      ]);
    });

    it(`dockPanel at ${MAX_DOCKED_PANELS} already-docked panels is a no-op`, () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          // Spawn-then-dock each one at a time, so the floating pool never
          // exceeds MAX_LIVE_PANELS in between (docking a panel right after
          // spawning it keeps this scenario isolated from the floating cap
          // — MAX_LIVE_PANELS and MAX_DOCKED_PANELS both happen to be 4).
          ["d1", "d2", "d3", "d4"].forEach((panelId, i) => {
            ts.schedule(
              () => {
                events$.next(panelEvent(panelId, makeSpec(panelId)));
              },
              2 * i + 1,
            );
            ts.schedule(
              () => {
                machine.dockPanel(panelId);
              },
              2 * i + 2,
            );
          });
          ts.schedule(() => {
            events$.next(panelEvent("d5", makeSpec("d5")));
          }, 9);
          ts.schedule(() => {
            // d1..d4 already fill MAX_DOCKED_PANELS — docking a 5th must
            // no-op, leaving d5 floating.
            machine.dockPanel("d5");
          }, 10);
        },
      );

      const last = states.at(-1);
      const docked = last?.panels.filter((p) => {
        return p.docked;
      });
      expect(
        docked?.map((p) => {
          return p.panelId;
        }),
      ).toEqual(["d1", "d2", "d3", "d4"]);
      expect(
        last?.panels.find((p) => {
          return p.panelId === "d5";
        })?.docked,
      ).toBe(false);
    });

    it("undockPanel on an unknown panelId is a silent no-op", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.undockPanel("does-not-exist");
          }, 2);
        },
      );

      const last = states.at(-1);
      expect(last?.panels[0]?.docked).toBe(false);
    });

    it("undockPanel on a panel that is not docked (already floating) is a no-op", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.undockPanel("p1");
          }, 2);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([
        { panelId: "p1", spec: makeSpec("p1"), status: "live", docked: false },
      ]);
    });

    it("undockPanel sets docked: false", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.dockPanel("p1");
          }, 2);
          ts.schedule(() => {
            machine.undockPanel("p1");
          }, 3);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([
        { panelId: "p1", spec: makeSpec("p1"), status: "live", docked: false },
      ]);
    });

    it("dismissPanel removes a docked panel just like a floating one", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.dockPanel("p1");
          }, 2);
          ts.schedule(() => {
            machine.dismissPanel("p1");
          }, 3);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([]);
    });

    it("docking a panel frees a floating slot — with the floating pool already at MAX_LIVE_PANELS, docking one and then spawning a new wire panel does NOT evict any of the remaining floating panels", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ["p1", "p2", "p3", "p4"].forEach((panelId, i) => {
            ts.schedule(() => {
              events$.next(panelEvent(panelId, makeSpec(panelId)));
            }, i + 1);
          });
          ts.schedule(() => {
            machine.dockPanel("p2");
          }, 5);
          ts.schedule(() => {
            events$.next(panelEvent("p5", makeSpec("p5")));
          }, 6);
        },
      );

      const last = states.at(-1);
      expect(
        last?.panels.map((p) => {
          return p.panelId;
        }),
      ).toEqual(["p1", "p2", "p3", "p4", "p5"]);
      expect(
        last?.panels.find((p) => {
          return p.panelId === "p2";
        })?.docked,
      ).toBe(true);
    });

    it("a wire spawn evicts the oldest FLOATING panel while an older DOCKED panel survives at its index", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.dockPanel("p1");
          }, 2);
          ["p2", "p3", "p4", "p5"].forEach((panelId, i) => {
            ts.schedule(() => {
              events$.next(panelEvent(panelId, makeSpec(panelId)));
            }, 3 + i);
          });
          ts.schedule(() => {
            // Floating pool (p2..p5) is now at MAX_LIVE_PANELS; this 6th
            // distinct panelId is a genuine spawn and must evict the oldest
            // FLOATING entry (p2) — p1, docked, is invisible to the cap and
            // survives at index 0.
            events$.next(panelEvent("p6", makeSpec("p6")));
          }, 7);
        },
      );

      const last = states.at(-1);
      expect(
        last?.panels.map((p) => {
          return p.panelId;
        }),
      ).toEqual(["p1", "p3", "p4", "p5", "p6"]);
      expect(last?.panels[0]?.docked).toBe(true);
    });

    it("a wire edit to an already-DOCKED panelId morphs its spec in place without undocking it (restyle-while-docked)", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.dockPanel("p1");
          }, 2);
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1-restyled")));
          }, 3);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([
        {
          panelId: "p1",
          spec: makeSpec("p1-restyled"),
          status: "live",
          docked: true,
        },
      ]);
    });

    it("undockPanel at a full floating cap evicts the oldest OTHER floating panel, never the panel being undocked itself", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          ts.schedule(() => {
            events$.next(panelEvent("p1", makeSpec("p1")));
          }, 1);
          ts.schedule(() => {
            machine.dockPanel("p1");
          }, 2);
          ["p2", "p3", "p4", "p5"].forEach((panelId, i) => {
            ts.schedule(() => {
              events$.next(panelEvent(panelId, makeSpec(panelId)));
            }, 3 + i);
          });
          ts.schedule(() => {
            // Floating pool (p2..p5) is already at MAX_LIVE_PANELS. Undocking
            // p1 would push it to 5 — p1 (array index 0, the oldest overall)
            // must NOT be the one evicted; the oldest OTHER floating panel
            // (p2) is evicted instead.
            machine.undockPanel("p1");
          }, 7);
        },
      );

      const last = states.at(-1);
      expect(
        last?.panels.map((p) => {
          return p.panelId;
        }),
      ).toEqual(["p1", "p3", "p4", "p5"]);
      expect(last?.panels[0]?.docked).toBe(false);
    });

    it("restoreDockedPanel appends a docked live panel", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.restoreDockedPanel("r1", makeSpec("r1"));
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([
        { panelId: "r1", spec: makeSpec("r1"), status: "live", docked: true },
      ]);
    });

    it("restoreDockedPanel dedupes by id — a second call for an id already present is a no-op", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.restoreDockedPanel("r1", makeSpec("first"));
          }, 1);
          ts.schedule(() => {
            machine.restoreDockedPanel("r1", makeSpec("second"));
          }, 2);
        },
      );

      const last = states.at(-1);
      expect(last?.panels).toEqual([
        {
          panelId: "r1",
          spec: makeSpec("first"),
          status: "live",
          docked: true,
        },
      ]);
    });

    it(`restoreDockedPanel drops entries beyond ${MAX_DOCKED_PANELS} — the cap is enforced, excess silently dropped`, () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ machine, ts }) => {
          ["r1", "r2", "r3", "r4", "r5"].forEach((panelId, i) => {
            ts.schedule(() => {
              machine.restoreDockedPanel(panelId, makeSpec(panelId));
            }, i + 1);
          });
        },
      );

      const last = states.at(-1);
      expect(
        last?.panels.map((p) => {
          return p.panelId;
        }),
      ).toEqual(["r1", "r2", "r3", "r4"]);
      expect(last?.panels).toHaveLength(MAX_DOCKED_PANELS);
    });

    it("restoreDockedPanel ignores the floating cap entirely — with the floating pool already full at MAX_LIVE_PANELS, MAX_DOCKED_PANELS restores all land, none evicted", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ events$, machine, ts }) => {
          // Fill the floating pool to its cap first.
          ["p1", "p2", "p3", "p4"].forEach((panelId, i) => {
            ts.schedule(() => {
              events$.next(panelEvent(panelId, makeSpec(panelId)));
            }, i + 1);
          });
          // Then restore MAX_DOCKED_PANELS docked panels — the floating cap
          // must have zero effect on this path (restoreDockedPanel is
          // boot-time rehydration, gated only by MAX_DOCKED_PANELS).
          ["r1", "r2", "r3", "r4"].forEach((panelId, i) => {
            ts.schedule(() => {
              machine.restoreDockedPanel(panelId, makeSpec(panelId));
            }, 10 + i);
          });
        },
      );

      const last = states.at(-1);
      expect(
        last?.panels.map((p) => {
          return p.panelId;
        }),
      ).toEqual(["p1", "p2", "p3", "p4", "r1", "r2", "r3", "r4"]);
      expect(last?.panels).toHaveLength(8);
      expect(
        last?.panels.filter((p) => {
          return p.docked;
        }),
      ).toHaveLength(MAX_DOCKED_PANELS);
      expect(
        last?.panels.filter((p) => {
          return !p.docked;
        }),
      ).toHaveLength(MAX_LIVE_PANELS);
    });

    it("restoreDockedPanel never constructs a spec reference-equal to UNSUPPORTED_SENTINEL_SPEC — a restored panel is always status: live", () => {
      const states = run(
        () => {
          return undefined;
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.restoreDockedPanel("r1", makeSpec("r1"));
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.panels[0]?.spec).not.toBe(UNSUPPORTED_SENTINEL_SPEC);
      expect(last?.panels[0]?.status).toBe("live");
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
