import { NEVER, of } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_JARVIS_SKIN,
  Direction,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisSkin,
} from "@rtc/domain";
import type { PanelSpecV1 } from "@rtc/shared";

import type {
  JarvisAskOptions,
  JarvisAvailability,
  JarvisEvent,
  JarvisPort,
} from "#/adapters/jarvisPort";

import {
  createJarvisMachine,
  formatGateResetTime,
  JARVIS_GREETING,
  type JarvisDeps,
  type JarvisState,
} from "../JarvisMachine";

describe("createJarvisMachine", () => {
  it("starts with the greeting, closed, idle, no pending confirmation, the first skin$ value, and the sim-default scripted-only brain", () => {
    const ts = scheduler();
    ts.run(() => {
      const machine = createJarvisMachine({
        port: basePort(ts),
        skin$: of<JarvisSkin>("reactor"),
        setSkin: () => {},
        ...baseBrainDeps(),
      });
      let current: JarvisState | undefined;
      const sub = machine.state$.subscribe((s) => {
        current = s;
      });
      expect(current).toEqual({
        open: false,
        skin: "reactor",
        unread: 0,
        unreadNarration: false,
        phase: "idle",
        entries: [{ id: 0, role: "jarvis", text: JARVIS_GREETING, done: true }],
        pendingConfirmation: null,
        available: true,
        brains: ["scripted"],
        effectiveBrain: "scripted",
        gate: null,
      });
      sub.unsubscribe();
      machine.dispose();
    });
  });

  it("folds deltas into one streaming entry and closes it on done", () => {
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "a-b-c-(d|)", {
            a: { type: "delta", text: "EUR" },
            b: { type: "delta", text: "USD" },
            c: { type: "delta", text: " is up" },
            d: { type: "done" },
          }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("quote EURUSD");
        }, 1);
      },
    );

    const phases = states.map((s) => {
      return s.phase;
    });
    // idle (initial) -> speaking (turn starts) -> ... -> idle (done)
    expect(phases[0]).toBe("idle");
    expect(phases[1]).toBe("speaking");
    expect(phases.at(-1)).toBe("idle");

    const last = states.at(-1);
    expect(last?.entries).toEqual([
      { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
      { id: 1, role: "user", text: "quote EURUSD", done: true },
      { id: 2, role: "jarvis", text: "EURUSD is up", done: true },
    ]);
  });

  it("attaches a toolEvent to the streaming jarvis entry", () => {
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "a-b-(c|)", {
            a: { type: "toolEvent", tool: "quote", status: "running" },
            b: { type: "toolEvent", tool: "quote", status: "done" },
            c: { type: "done" },
          }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("quote EURUSD");
        }, 1);
      },
    );

    const last = states.at(-1);
    const jarvisEntry = last?.entries.at(-1);
    expect(jarvisEntry).toEqual({
      id: 2,
      role: "jarvis",
      text: "",
      done: true,
      tool: { name: "quote", status: "done" },
    });
  });

  it("a panel event is a no-op for chat state — JarvisPanelsMachine (Task 5) owns it, not this machine", () => {
    const stubPanelSpec: PanelSpecV1 = {
      v: 1,
      title: "GBP Volatility",
      source: { kind: "priceHistory", symbols: ["GBPUSD"] },
      transforms: [{ kind: "rollingVol", samples: 20 }],
      viz: { kind: "line" },
    };

    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "a-b-(c|)", {
            a: { type: "delta", text: "EURUSD is up" },
            b: {
              type: "panel",
              panelId: "panel-scripted-1",
              spec: stubPanelSpec,
            },
            c: { type: "done" },
          }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("show me gbp volatility");
        }, 1);
      },
    );

    const last = states.at(-1);
    expect(last?.entries).toEqual([
      { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
      { id: 1, role: "user", text: "show me gbp volatility", done: true },
      { id: 2, role: "jarvis", text: "EURUSD is up", done: true },
    ]);
    expect(last?.pendingConfirmation).toBeNull();
    expect(last?.phase).toBe("idle");
  });

  it("an error reply finalizes the streaming entry with the error message and returns to idle", () => {
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "a-(b|)", {
            a: { type: "delta", text: "partial" },
            b: { type: "error", message: "quote service unavailable" },
          }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("quote EURUSD");
        }, 1);
      },
    );

    const last = states.at(-1);
    expect(last?.phase).toBe("idle");
    expect(last?.entries.at(-1)).toEqual({
      id: 2,
      role: "jarvis",
      text: "quote service unavailable",
      done: true,
    });
  });

  it("an error arriving after a toolEvent clears the tool badge, not just the text", () => {
    // Mirrors ScriptedJarvisAdapter's pnl/movers turns: toolEvent(running) is
    // pushed before a later sequential snapshot read, and THAT read can
    // still time out into an error. Without clearing `tool`, the finalized
    // entry would be done:true with error text but a permanently-stuck
    // running badge.
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "a-(b|)", {
            a: { type: "toolEvent", tool: "pnl", status: "running" },
            b: { type: "error", message: "snapshot timed out" },
          }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("brief me on pnl");
        }, 1);
      },
    );

    const last = states.at(-1);
    expect(last?.phase).toBe("idle");
    expect(last?.entries.at(-1)).toEqual({
      id: 2,
      role: "jarvis",
      text: "snapshot timed out",
      done: true,
    });
  });

  it("runs sequential sends one at a time (concatMap), not interleaved", () => {
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "5ms (a|)", { a: { type: "done" } }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("first");
        }, 1);
        ts.schedule(() => {
          machine.intents.send("second");
        }, 2);
      },
    );

    const last = states.at(-1);
    // greeting, first-user, first-jarvis(done), second-user, second-jarvis(done)
    expect(
      last?.entries.map((e) => {
        return e.text;
      }),
    ).toEqual([JARVIS_GREETING, "first", "", "second", ""]);
    expect(
      last?.entries.every((e) => {
        return e.done;
      }),
    ).toBe(true);
  });

  it("sets pendingConfirmation with remainingFraction 1 on a confirmRequest", () => {
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "a", {
            a: {
              type: "confirmRequest",
              confirmationId: "c1",
              symbol: "EURUSD",
              direction: Direction.Buy,
              notional: 1_000_000,
              quotedPrice: 1.0925,
              ratePrecision: 5,
            },
          }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("buy 1m EURUSD");
        }, 1);
      },
    );

    // flush() drains the whole virtual timeline (the default 60s timer
    // included, same as TileExecutionMachine's tests), so assert against the
    // state right as the confirmRequest lands rather than the final one.
    const justRequested = states.find((s) => {
      return s.pendingConfirmation !== null;
    });
    expect(justRequested?.pendingConfirmation).toEqual({
      confirmationId: "c1",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.0925,
      ratePrecision: 5,
      remainingFraction: 1,
    });
  });

  it("auto-declines the confirmation after confirmTimeoutMs and clears it", () => {
    const confirmEvent: JarvisEvent = {
      type: "confirmRequest",
      confirmationId: "c1",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.0925,
      ratePrecision: 5,
    };
    let port: FakeJarvisPort | undefined;
    const states = run(
      (ts) => {
        port = fakePort(ts, "a", { a: confirmEvent });
        const deps: JarvisDeps = {
          port,
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          confirmTimeoutMs: 3000,
          ...baseBrainDeps(),
        };
        return deps;
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("buy 1m EURUSD");
        }, 1);
        ts.schedule(() => {}, 3100);
      },
    );

    expect(port?.confirms).toEqual([["c1", false]]);
    expect(states.at(-1)?.pendingConfirmation).toBeNull();
  });

  it("approveConfirmation resolves via port.confirm(true), clears, and cancels the ticker", () => {
    const confirmEvent: JarvisEvent = {
      type: "confirmRequest",
      confirmationId: "c1",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.0925,
      ratePrecision: 5,
    };
    let port: FakeJarvisPort | undefined;
    const states = run(
      (ts) => {
        port = fakePort(ts, "a", { a: confirmEvent });
        const deps: JarvisDeps = {
          port,
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          confirmTimeoutMs: 3000,
          ...baseBrainDeps(),
        };
        return deps;
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("buy 1m EURUSD");
        }, 1);
        ts.schedule(() => {
          machine.intents.approveConfirmation();
        }, 500);
        // well past confirmTimeoutMs — if the ticker weren't cancelled, a
        // second (auto-decline) confirm() call would show up here.
        ts.schedule(() => {}, 4000);
      },
    );

    expect(port?.confirms).toEqual([["c1", true]]);
    expect(states.at(-1)?.pendingConfirmation).toBeNull();
  });

  it("declineConfirmation resolves via port.confirm(false) and clears", () => {
    const confirmEvent: JarvisEvent = {
      type: "confirmRequest",
      confirmationId: "c1",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.0925,
      ratePrecision: 5,
    };
    let port: FakeJarvisPort | undefined;
    const states = run(
      (ts) => {
        port = fakePort(ts, "a", { a: confirmEvent });
        const deps: JarvisDeps = {
          port,
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          confirmTimeoutMs: 3000,
          ...baseBrainDeps(),
        };
        return deps;
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("buy 1m EURUSD");
        }, 1);
        ts.schedule(() => {
          machine.intents.declineConfirmation();
        }, 500);
      },
    );

    expect(port?.confirms).toEqual([["c1", false]]);
    expect(states.at(-1)?.pendingConfirmation).toBeNull();
  });

  it("approveConfirmation and declineConfirmation are no-ops when nothing pends", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const port = basePort(ts);
      const machine = createJarvisMachine({
        port,
        skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
        setSkin: () => {},
        ...baseBrainDeps(),
      });
      const seen: JarvisState[] = [];
      const sub = machine.state$.subscribe((s) => {
        seen.push(s);
      });
      machine.intents.approveConfirmation();
      machine.intents.declineConfirmation();
      flush();
      sub.unsubscribe();
      machine.dispose();
      expect(port.confirms).toEqual([]);
      expect(
        seen.every((s) => {
          return s.pendingConfirmation === null;
        }),
      ).toBe(true);
    });
  });

  it("counts unread while closed and clears on open", () => {
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "(a|)", { a: { type: "done" } }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("first");
        }, 1);
        ts.schedule(() => {
          machine.intents.send("second");
        }, 5);
        ts.schedule(() => {
          machine.intents.open();
        }, 10);
      },
    );

    const beforeOpen = states.filter((s) => {
      return !s.open;
    });
    expect(beforeOpen.at(-1)?.unread).toBe(2);
    expect(states.at(-1)?.open).toBe(true);
    expect(states.at(-1)?.unread).toBe(0);
  });

  it("toggle() opening also clears unread; toggle() closing does not touch it", () => {
    const states = run(
      (ts) => {
        return {
          port: fakePort(ts, "(a|)", { a: { type: "done" } }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        };
      },
      ({ machine, ts }) => {
        ts.schedule(() => {
          machine.intents.send("first");
        }, 1);
        ts.schedule(() => {
          machine.intents.toggle();
        }, 5);
        ts.schedule(() => {
          machine.intents.toggle();
        }, 6);
      },
    );

    expect(states[states.length - 2]?.open).toBe(true);
    expect(states[states.length - 2]?.unread).toBe(0);
    expect(states.at(-1)?.open).toBe(false);
    expect(states.at(-1)?.unread).toBe(0);
  });

  it("setSkin(s) calls deps.setSkin; state.skin follows skin$, the source of truth", () => {
    const ts = scheduler();
    ts.run(({ cold, flush }) => {
      const skin$ = cold<JarvisSkin>("a-b", {
        a: "singularity",
        b: "reactor",
      });
      const setSkinCalls: JarvisSkin[] = [];
      const machine = createJarvisMachine({
        port: basePort(ts),
        skin$,
        setSkin: (s: JarvisSkin) => {
          setSkinCalls.push(s);
        },
        ...baseBrainDeps(),
      });
      const seen: JarvisSkin[] = [];
      const sub = machine.state$.subscribe((s) => {
        seen.push(s.skin);
      });
      machine.intents.setSkin("reactor");
      flush();
      sub.unsubscribe();
      machine.dispose();
      expect(setSkinCalls).toEqual(["reactor"]);
      expect(seen).toEqual(["singularity", "singularity", "reactor"]);
    });
  });

  it("dispose() tears the machine down: source Subjects complete and intents become no-ops", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const port = basePort(ts);
      const machine = createJarvisMachine({
        port,
        skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
        setSkin: () => {},
        ...baseBrainDeps(),
      });
      const seen: JarvisState[] = [];
      const sub = machine.state$.subscribe((s) => {
        seen.push(s);
      });
      const beforeDispose = seen.length;
      machine.dispose();
      machine.intents.send("hello");
      machine.intents.open();
      machine.intents.close();
      machine.intents.toggle();
      machine.intents.approveConfirmation();
      machine.intents.declineConfirmation();
      machine.intents.setSkin("reactor");
      flush();
      sub.unsubscribe();
      expect(seen.length).toBe(beforeDispose);
    });
  });

  describe("availability", () => {
    it("defaults to available, scripted-only when deps.availability$ is absent (sim mode, legacy callers)", () => {
      const ts = scheduler();
      ts.run(({ flush }) => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          ...baseBrainDeps(),
        });
        const seen: JarvisState[] = [];
        const sub = machine.state$.subscribe((s) => {
          seen.push(s);
        });
        flush();
        sub.unsubscribe();
        machine.dispose();
        expect(seen.length).toBeGreaterThan(0);
        expect(
          seen.every((s) => {
            return s.available === true;
          }),
        ).toBe(true);
        expect(seen.at(-1)?.brains).toEqual(["scripted"]);
      });
    });

    it("folds availability$ into state.available/state.brains: goes false/empty, then flips back true/offered", () => {
      const ts = scheduler();
      ts.run(({ cold, flush }) => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          availability$: cold<JarvisAvailability>("f-t", {
            f: {
              available: false,
              brains: [],
              defaultBrain: "scripted",
              gate: null,
            },
            t: {
              available: true,
              brains: ["scripted"],
              defaultBrain: "scripted",
              gate: null,
            },
          }),
          ...baseBrainDeps(),
        });
        const seen: boolean[] = [];
        const sub = machine.state$.subscribe((s) => {
          seen.push(s.available);
        });
        flush();
        sub.unsubscribe();
        machine.dispose();
        // seen[0] is INITIAL.available (true), delivered synchronously at
        // subscribe time, before the cold availability$'s own frame-0 "f"
        // patch (same duplicate-first-value shape as the skin$ fold test
        // above).
        expect(seen).toEqual([true, false, true]);
      });
    });

    it("send() while unavailable is a no-op: no user entry appended, port.ask not called", () => {
      let port: FakeJarvisPort | undefined;
      const states = run(
        (ts) => {
          port = fakePort(ts, "a", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: ts.createColdObservable<JarvisAvailability>("f", {
              f: {
                available: false,
                brains: [],
                defaultBrain: "scripted",
                gate: null,
              },
            }),
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("hello");
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.available).toBe(false);
      expect(last?.phase).toBe("idle");
      expect(last?.entries).toEqual([
        { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
      ]);
      expect(port?.asks).toEqual([]);
    });

    it("a turn already streaming when availability$ flips false is NOT torn down — the in-flight turn's deltas/done still fold normally; only the NEXT send is suppressed", () => {
      // Guards against the tempting `takeWhile(available)`-style refactor of
      // turnItems$/entryPatches$: that would tear a LIVE turn down the
      // instant availability flips, discarding an already-billed, in-flight
      // reply. The actual (correct) gate only reads the `available` cache at
      // concatMap's projector — i.e. only when a NEW send() is about to
      // start a turn — so a turn already running rides out to its own
      // done/error untouched.
      let port: FakeJarvisPort | undefined;
      const states = run(
        (ts) => {
          port = fakePort(ts, "a-b-c-(d|)", {
            a: { type: "delta", text: "EUR" },
            b: { type: "delta", text: "USD" },
            c: { type: "delta", text: " is up" },
            d: { type: "done" },
          });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            // Flips false mid-turn: relative to the turn's own ask()
            // subscription (frame 1, from the send() schedule below), "a"
            // lands at frame 1, "b" at frame 3, "c" at frame 5, done at
            // frame 7 — so "false" at frame 4 lands strictly between the
            // "b" delta and the "c" delta, mid-stream. No leading "true"
            // frame needed: INITIAL.available / the local `available` cache
            // both already default to true.
            availability$: ts.createColdObservable<JarvisAvailability>(
              "----f",
              {
                f: {
                  available: false,
                  brains: [],
                  defaultBrain: "scripted",
                  gate: null,
                },
              },
            ),
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("first");
          }, 1);
          // Sent once availability has already flipped false. The first
          // turn is still in flight (concatMap queues this rather than
          // projecting it immediately), so this only proves out once the
          // first turn completes at frame 7 — by which point availability
          // is still false, so it must still be suppressed.
          ts.schedule(() => {
            machine.intents.send("second");
          }, 6);
        },
      );

      // Mid-turn: availability has just flipped false, but the still-open
      // turn (waiting on the " is up" delta and done) must not have been
      // reset or finalized early.
      const midTurn = states.find((s) => {
        return !s.available;
      });
      expect(midTurn?.phase).toBe("speaking");
      expect(midTurn?.entries.at(-1)).toEqual({
        id: 2,
        role: "jarvis",
        text: "EURUSD",
        done: false,
      });

      // The in-flight turn folds its remaining delta and done exactly as if
      // availability had never changed.
      const last = states.at(-1);
      expect(last?.available).toBe(false);
      expect(last?.phase).toBe("idle");
      expect(last?.entries).toEqual([
        { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
        { id: 1, role: "user", text: "first", done: true },
        { id: 2, role: "jarvis", text: "EURUSD is up", done: true },
      ]);

      // "second" never reached port.ask(): the unavailable gate suppressed
      // it at concatMap's projector rather than starting and then
      // cancelling it.
      expect(port?.asks).toEqual(["first"]);
    });
  });

  describe("brain + effort resolution", () => {
    it("resolves effectiveBrain to the preferred brain when it is among the offered brains", () => {
      const ts = scheduler();
      ts.run(({ flush }) => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          availability$: of<JarvisAvailability>({
            available: true,
            brains: ["scripted", "claude-sonnet-5"],
            defaultBrain: "scripted",
            gate: null,
          }),
          preferredBrain$: of<JarvisBrain>("claude-sonnet-5"),
          effort$: of<JarvisEffort>("high"),
        });
        let current: JarvisState | undefined;
        const sub = machine.state$.subscribe((s) => {
          current = s;
        });
        flush();
        sub.unsubscribe();
        machine.dispose();
        expect(current?.brains).toEqual(["scripted", "claude-sonnet-5"]);
        expect(current?.effectiveBrain).toBe("claude-sonnet-5");
      });
    });

    it("falls back to availability.defaultBrain when the preferred brain is NOT among the offered brains", () => {
      const ts = scheduler();
      ts.run(({ flush }) => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          availability$: of<JarvisAvailability>({
            available: true,
            brains: ["scripted"],
            defaultBrain: "scripted",
            gate: null,
          }),
          preferredBrain$: of<JarvisBrain>("claude-opus-5"),
          effort$: of<JarvisEffort>("medium"),
        });
        let current: JarvisState | undefined;
        const sub = machine.state$.subscribe((s) => {
          current = s;
        });
        flush();
        sub.unsubscribe();
        machine.dispose();
        expect(current?.effectiveBrain).toBe("scripted");
      });
    });

    it("an empty offered-brains array (available:false transient) is not treated as a nullish sentinel — resolution still falls back to defaultBrain cleanly", () => {
      const ts = scheduler();
      ts.run(({ flush }) => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          availability$: of<JarvisAvailability>({
            available: false,
            brains: [],
            defaultBrain: "claude-haiku-4-5",
            gate: null,
          }),
          preferredBrain$: of<JarvisBrain>("claude-opus-5"),
          effort$: of<JarvisEffort>("medium"),
        });
        let current: JarvisState | undefined;
        const sub = machine.state$.subscribe((s) => {
          current = s;
        });
        flush();
        sub.unsubscribe();
        machine.dispose();
        expect(current?.available).toBe(false);
        expect(current?.brains).toEqual([]);
        expect(current?.effectiveBrain).toBe("claude-haiku-4-5");
      });
    });

    it("REGRESSION: a send() before availability$ has EVER emitted (WS-real's pre-round-trip window) carries the preferred brain, not a scripted-only cache seed", () => {
      // The bug this pins: the synchronous `availability`/`preferredBrain`
      // caches send() reads at call time were previously seeded from
      // DEFAULT_AVAILABILITY (sim mode's scripted-only fallback), NOT from
      // INITIAL — inconsistent with the visible INITIAL state, and wrong
      // for WS-real mode specifically: availability$ emits nothing until
      // the JARVIS_AVAILABILITY round-trip replies, which is unbounded
      // while the socket is still connecting (WsAdapter buffers pre-open
      // sends, so a send() in that window is real, not hypothetical). A
      // scripted-only seed would silently pin brain:"scripted" onto that
      // first turn — the server honors the brain a keyed turn carries, so
      // the user would get a canned scripted reply where, pre-round, they
      // got the real model. `availability$: NEVER` reproduces exactly that
      // window: it never emits, so the cache is never corrected before
      // send() reads it.
      let port: FakeJarvisPort | undefined;
      run(
        (ts) => {
          port = fakePort(ts, "(a|)", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: NEVER,
            preferredBrain$: of<JarvisBrain>("claude-opus-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("hello");
          }, 1);
        },
      );

      expect(
        port?.askCalls.map((c) => {
          return c.options?.brain;
        }),
      ).toEqual(["claude-opus-5"]);
    });

    it("an availability flip mid-session re-resolves effectiveBrain against the same preferred brain", () => {
      const ts = scheduler();
      ts.run(({ cold, flush }) => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          availability$: cold<JarvisAvailability>("a-b", {
            a: {
              available: true,
              brains: ["scripted"],
              defaultBrain: "scripted",
              gate: null,
            },
            b: {
              available: true,
              brains: ["scripted", "claude-opus-5"],
              defaultBrain: "scripted",
              gate: null,
            },
          }),
          preferredBrain$: of<JarvisBrain>("claude-opus-5"),
          effort$: of<JarvisEffort>("medium"),
        });
        const seen: JarvisBrain[] = [];
        const sub = machine.state$.subscribe((s) => {
          seen.push(s.effectiveBrain);
        });
        flush();
        sub.unsubscribe();
        machine.dispose();
        // seen[0] is NOT INITIAL.effectiveBrain: unlike availability$ here
        // (a cold marble, not yet fired at subscribe time), preferredBrain$
        // is a plain synchronous `of(...)` — it already folds during
        // machine construction, before this test's own subscribe, resolving
        // against the availability CACHE's own seed. That seed matches
        // INITIAL (every selectable brain offered — see the "before
        // availability$ has EVER emitted" regression test above for why),
        // so "claude-opus-5" already resolves at this point. The cold
        // availability$'s own frame-0 "a" patch then NARROWS the offering
        // to `["scripted"]` — "claude-opus-5" is no longer offered, so it
        // falls back to "scripted"; frame "b" widens it back and the
        // preferred brain wins again.
        expect(seen).toEqual(["claude-opus-5", "scripted", "claude-opus-5"]);
      });
    });

    it("send() calls port.ask with the resolved effective brain and the current effort", () => {
      let port: FakeJarvisPort | undefined;
      run(
        (ts) => {
          port = fakePort(ts, "(a|)", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: of<JarvisAvailability>({
              available: true,
              brains: ["scripted", "claude-sonnet-5"],
              defaultBrain: "scripted",
              gate: null,
            }),
            preferredBrain$: of<JarvisBrain>("claude-sonnet-5"),
            effort$: of<JarvisEffort>("high"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("hello");
          }, 1);
        },
      );

      expect(port?.askCalls).toEqual([
        {
          text: "hello",
          options: { brain: "claude-sonnet-5", effort: "high" },
        },
      ]);
    });

    it("a preferredBrain$ change mid-session is reflected in the NEXT send()'s effective brain", () => {
      let port: FakeJarvisPort | undefined;
      run(
        (ts) => {
          port = fakePort(ts, "(a|)", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: of<JarvisAvailability>({
              available: true,
              brains: ["scripted", "claude-opus-5"],
              defaultBrain: "scripted",
              gate: null,
            }),
            preferredBrain$: ts.createColdObservable<JarvisBrain>("a-b", {
              a: "scripted",
              b: "claude-opus-5",
            }),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("first");
          }, 1);
          // Sent after preferredBrain$'s frame-2 "b" — the first turn's
          // "(a|)" port response completes synchronously relative to its own
          // (frame-1) subscribe, so this is genuinely a second, later turn.
          ts.schedule(() => {
            machine.intents.send("second");
          }, 3);
        },
      );

      expect(
        port?.askCalls.map((c) => {
          return c.options?.brain;
        }),
      ).toEqual(["scripted", "claude-opus-5"]);
    });

    it("REGRESSION: a queued turn resolves brain/effort at DEQUEUE time, not enqueue time — a preference flip while turn 1 is in flight re-prices the already-queued turn 2", () => {
      // Real-money consequence this pins: the user starts turn 1 on the
      // cheap/scripted brain, queues turn 2 while turn 1 is still
      // streaming, then flips their brain preference before turn 1
      // finishes. concatMap only PROJECTS (and this machine only
      // RESOLVES effectiveBrain) once the queue actually dequeues — same
      // "read the live cache at projector time" semantics the P3
      // `available` gate already relies on — so the already-queued turn 2
      // is billed at the NEW brain, not the one that was preferred when it
      // was enqueued.
      let port: FakeJarvisPort | undefined;
      const states = run(
        (ts) => {
          port = fakePort(ts, "a-b-c-(d|)", {
            a: { type: "delta", text: "EUR" },
            b: { type: "delta", text: "USD" },
            c: { type: "delta", text: " is up" },
            d: { type: "done" },
          });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: of<JarvisAvailability>({
              available: true,
              brains: ["scripted", "claude-opus-5"],
              defaultBrain: "scripted",
              gate: null,
            }),
            // Relative to ITS OWN subscribe at machine-construction time
            // (frame 0, not turn 1's frame-1 ask() subscribe): "scripted"
            // at frame 0, flips to "claude-opus-5" at frame 6 — strictly
            // between turn 2's frame-4 enqueue and turn 1's frame-7 done,
            // so the flip lands while turn 2 is queued but not yet
            // dequeued.
            preferredBrain$: ts.createColdObservable<JarvisBrain>("a-----b", {
              a: "scripted",
              b: "claude-opus-5",
            }),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("first");
          }, 1);
          // Turn 1's own deltas land at frames 1/3/5 and done at frame 7
          // (see the mid-turn availability test above for the same frame
          // math) — frame 4 is strictly between the "USD" delta (frame 3)
          // and the " is up" delta (frame 5), so turn 1 is genuinely still
          // in flight and concatMap actually queues this rather than
          // starting it immediately.
          ts.schedule(() => {
            machine.intents.send("second");
          }, 4);
        },
      );

      // Turn 2 only starts (phase -> speaking for its own entry pair)
      // once turn 1's done has folded — proving it was truly queued, not
      // run concurrently.
      const turn1Done = states.findIndex((s) => {
        return s.entries.at(-1)?.text === "EURUSD is up";
      });

      const turn2Started = states.findIndex((s) => {
        return s.entries.some((e) => {
          return e.role === "user" && e.text === "second";
        });
      });
      expect(turn2Started).toBeGreaterThan(turn1Done);

      expect(
        port?.askCalls.map((c) => {
          return c.options?.brain;
        }),
      ).toEqual(["scripted", "claude-opus-5"]);
    });
  });

  describe("narrate", () => {
    it("appends a user entry flagged origin:narrator, stripped of the [narration] prefix; the prefix rides only to port.ask", () => {
      let port: FakeJarvisPort | undefined;
      const states = run(
        (ts) => {
          port = fakePort(ts, "(a|)", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.narrate("[narration] EURUSD moved 3.2σ.");
          }, 1);
        },
      );

      const userEntry = states.at(-1)?.entries.find((e) => {
        return e.role === "user";
      });
      expect(userEntry).toMatchObject({
        text: "EURUSD moved 3.2σ.",
        origin: "narrator",
        done: true,
      });
      expect(port?.asks).toEqual(["[narration] EURUSD moved 3.2σ."]);
    });

    it("a send() turn's user entry carries no origin field", () => {
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("hello");
          }, 1);
        },
      );

      const userEntry = states.at(-1)?.entries.find((e) => {
        return e.role === "user";
      });
      expect(userEntry?.origin).toBeUndefined();
    });

    it("calls port.ask with the resolved effective brain/effort, exactly like send", () => {
      let port: FakeJarvisPort | undefined;
      run(
        (ts) => {
          port = fakePort(ts, "(a|)", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: of<JarvisAvailability>({
              available: true,
              brains: ["scripted", "claude-sonnet-5"],
              defaultBrain: "scripted",
              gate: null,
            }),
            preferredBrain$: of<JarvisBrain>("claude-sonnet-5"),
            effort$: of<JarvisEffort>("high"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.narrate("[narration] GBPUSD spread widened 4.0σ.");
          }, 1);
        },
      );

      expect(port?.askCalls).toEqual([
        {
          text: "[narration] GBPUSD spread widened 4.0σ.",
          options: { brain: "claude-sonnet-5", effort: "high" },
        },
      ]);
    });

    it("narrate() while unavailable is a no-op: no user entry appended, port.ask not called", () => {
      let port: FakeJarvisPort | undefined;
      const states = run(
        (ts) => {
          port = fakePort(ts, "a", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: ts.createColdObservable<JarvisAvailability>("f", {
              f: {
                available: false,
                brains: [],
                defaultBrain: "scripted",
                gate: null,
              },
            }),
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.narrate("[narration] EURUSD moved 3.0σ.");
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.available).toBe(false);
      expect(last?.entries).toEqual([
        { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
      ]);
      expect(port?.asks).toEqual([]);
    });

    it("a narrate() during an in-flight send() queues behind it (same concatMap queue)", () => {
      let port: FakeJarvisPort | undefined;
      const states = run(
        (ts) => {
          port = fakePort(ts, "5ms (a|)", { a: { type: "done" } });
          return {
            port,
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("first");
          }, 1);
          ts.schedule(() => {
            machine.intents.narrate("[narration] second");
          }, 2);
        },
      );

      const last = states.at(-1);
      expect(
        last?.entries.map((e) => {
          return e.text;
        }),
      ).toEqual([JARVIS_GREETING, "first", "", "second", ""]);
      expect(port?.asks).toEqual(["first", "[narration] second"]);

      // The narrate turn only starts once the send turn's own done has
      // folded — proving it was truly queued, not run concurrently. The
      // port here only ever emits a bare {type:"done"} (no delta), so the
      // send turn's jarvis stub entry (entries[2]) is text:"" both at ITS
      // OWN start (frame 2) and at its completion (frame ~7) — text/length
      // alone can't tell "queued" from "concurrent" apart. done:true CAN:
      // under the real concatMap queue, entries[2] must already be
      // finalized by the time the narrate turn's start item lands (concatMap
      // can't dequeue narrate until send's inner observable completes);
      // under a hypothetical concurrent (mergeMap) dispatch, narrate would
      // start at frame 2 while send is still mid-flight, so entries[2] would
      // still read done:false there.
      const narrateStartIndex = states.findIndex((s) => {
        return s.entries.some((e) => {
          return e.origin === "narrator";
        });
      });
      expect(states[narrateStartIndex]?.entries[2]?.done).toBe(true);
    });

    it("unreadNarration is set when a narrate turn completes while closed", () => {
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.narrate("[narration] EURUSD moved 3.0σ.");
          }, 1);
        },
      );

      expect(states.at(-1)?.open).toBe(false);
      expect(states.at(-1)?.unreadNarration).toBe(true);
    });

    it("unreadNarration is NOT set when a narrate turn completes while open", () => {
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.open();
          }, 1);
          ts.schedule(() => {
            machine.intents.narrate("[narration] EURUSD moved 3.0σ.");
          }, 2);
        },
      );

      expect(states.at(-1)?.open).toBe(true);
      expect(states.at(-1)?.unreadNarration).toBe(false);
    });

    it("unreadNarration is cleared by open()", () => {
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.narrate("[narration] EURUSD moved 3.0σ.");
          }, 1);
          ts.schedule(() => {
            machine.intents.open();
          }, 5);
        },
      );

      const beforeOpen = states.filter((s) => {
        return !s.open;
      });
      expect(beforeOpen.at(-1)?.unreadNarration).toBe(true);
      expect(states.at(-1)?.open).toBe(true);
      expect(states.at(-1)?.unreadNarration).toBe(false);
    });

    it("REGRESSION: unreadNarration reads `open` at COMPLETION time, not at dispatch time — closing mid-turn (after a narrate() sent while open) still sets it", () => {
      // Every other unreadNarration test above uses an instantaneous port
      // ("(a|)"), where dispatch and completion land in the same tick — so
      // "captured open at dispatch" and "captured open at completion" are
      // indistinguishable there. This pins the real discriminator: open()
      // at frame 1, narrate() at frame 2 (dispatch-time open === true), then
      // close() at frame 3 — strictly BEFORE the delayed port's frame-7
      // "done" (subscribed at frame 2, "5ms (a|)" fires 5 frames later) — so
      // the turn is genuinely still in flight when the panel closes. A
      // dispatch-time-cached read would see open:true and leave
      // unreadNarration false; the correct completion-time read sees
      // open:false (already closed by then) and sets it.
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "5ms (a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.open();
          }, 1);
          ts.schedule(() => {
            machine.intents.narrate("[narration] EURUSD moved 3.0σ.");
          }, 2);
          ts.schedule(() => {
            machine.intents.close();
          }, 3);
        },
      );

      const last = states.at(-1);
      expect(last?.open).toBe(false);
      expect(last?.unreadNarration).toBe(true);
    });

    it("initial state starts with unreadNarration false", () => {
      const ts = scheduler();
      ts.run(() => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>("reactor"),
          setSkin: () => {},
          ...baseBrainDeps(),
        });
        let current: JarvisState | undefined;
        const sub = machine.state$.subscribe((s) => {
          current = s;
        });
        expect(current?.unreadNarration).toBe(false);
        sub.unsubscribe();
        machine.dispose();
      });
    });
  });

  // recordDriveOutcome: JarvisDriverMachine's per-command outcomes (Task 10
  // follow-up ruling — composition.ts wires jarvisDriver.outcomes$ into this
  // intent). Not a user turn: no port.ask() call, no phase change, no
  // pending-confirmation involvement — just an entries fold.
  describe("recordDriveOutcome", () => {
    it("an APPLIED outcome appends a new jarvis-role entry with text 'drive: <kind>'", () => {
      const states = run(
        (ts) => {
          return {
            port: basePort(ts),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.recordDriveOutcome({
              command: { kind: "switchTab", tab: "equities" },
              status: "applied",
            });
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.entries).toEqual([
        { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
        { id: 1, role: "jarvis", text: "drive: switchTab", done: true },
      ]);
    });

    it("a SKIPPED outcome folds NOTHING — entries (and the id counter) stay untouched", () => {
      const states = run(
        (ts) => {
          return {
            port: basePort(ts),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.recordDriveOutcome({
              command: { kind: "eqSelect", symbol: "ZZZZZZ" },
              status: "skipped",
              reason: 'unknown symbol "ZZZZZZ"',
            });
          }, 1);
          // A LATER applied outcome proves the id counter wasn't consumed by
          // the skipped one above — id 1, not 2.
          ts.schedule(() => {
            machine.intents.recordDriveOutcome({
              command: { kind: "eqTimeframe", tf: "1W" },
              status: "applied",
            });
          }, 2);
        },
      );

      const last = states.at(-1);
      expect(last?.entries).toEqual([
        { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
        { id: 1, role: "jarvis", text: "drive: eqTimeframe", done: true },
      ]);
    });
  });

  // Governance round 2 (usage auto-gating): state.gate + the one-line
  // in-chat notice when a live gate frame downgrades THIS session's own
  // effectiveBrain. See JarvisState.gate's and availabilityPatches$'s docs.
  describe("budget-downgrade gate", () => {
    it("appends one system line when a gate frame downgrades the active brain mid-conversation", () => {
      const resetsAtMs = 1_893_456_000_000;
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            // Frame 0 offers every brain (opus included) — matches the
            // pre-emission cache's own seed, so effectiveBrain already
            // reads "claude-opus-5" before this frame even lands. Frame 10
            // (well after the frame-1 send()'s instant "(a|)" turn has
            // settled, so entries.length > 1 by then) narrows to
            // scripted+haiku and gates opus/sonnet — un-offering the
            // preferred brain, which re-resolves effectiveBrain to the new
            // defaultBrain "claude-haiku-4-5".
            availability$: ts.createColdObservable<JarvisAvailability>(
              "a---------b",
              {
                a: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
                b: {
                  available: true,
                  brains: ["scripted", "claude-haiku-4-5"],
                  defaultBrain: "claude-haiku-4-5",
                  gate: {
                    level: "soft",
                    resetsAtMs,
                    gated: ["claude-sonnet-5", "claude-opus-5"],
                  },
                },
              },
            ),
            preferredBrain$: of<JarvisBrain>("claude-opus-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.effectiveBrain).toBe("claude-haiku-4-5");
      expect(last?.gate).toEqual({
        level: "soft",
        resetsAtMs,
        gated: ["claude-sonnet-5", "claude-opus-5"],
      });

      // greeting, user, jarvis(done) from the completed turn, then exactly
      // one new system entry from the gate frame.
      expect(last?.entries).toHaveLength(4);
      expect(last?.entries.at(-1)).toEqual({
        id: 3,
        role: "jarvis",
        text: `Usage budget reached — continuing on Haiku 4.5 until ${formatGateResetTime(resetsAtMs)}.`,
        done: true,
        origin: "system",
      });
    });

    it("appends no system line when the effective brain is unaffected (haiku user, soft gate)", () => {
      const resetsAtMs = 1_893_456_000_000;
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            // haiku is offered both before and after the gate — the
            // preferred/effective brain never moves, so no line appends
            // even though a gate is active and the conversation is open.
            availability$: ts.createColdObservable<JarvisAvailability>(
              "a---------b",
              {
                a: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
                b: {
                  available: true,
                  brains: ["scripted", "claude-haiku-4-5"],
                  defaultBrain: "claude-haiku-4-5",
                  gate: {
                    level: "soft",
                    resetsAtMs,
                    gated: ["claude-sonnet-5", "claude-opus-5"],
                  },
                },
              },
            ),
            preferredBrain$: of<JarvisBrain>("claude-haiku-4-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.effectiveBrain).toBe("claude-haiku-4-5");
      expect(last?.gate).toEqual({
        level: "soft",
        resetsAtMs,
        gated: ["claude-sonnet-5", "claude-opus-5"],
      });
      // greeting, user, jarvis(done) — no fourth (system) entry.
      expect(last?.entries).toHaveLength(3);
      expect(
        last?.entries.some((e) => {
          return e.origin === "system";
        }),
      ).toBe(false);
    });

    it("appends no system line when the conversation is empty (only the canned greeting, no completed turn)", () => {
      const resetsAtMs = 1_893_456_000_000;
      const ts = scheduler();
      ts.run(({ flush }) => {
        const machine = createJarvisMachine({
          port: basePort(ts),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
          availability$: ts.createColdObservable<JarvisAvailability>("a-b", {
            a: {
              available: true,
              brains: [
                "scripted",
                "claude-haiku-4-5",
                "claude-sonnet-5",
                "claude-opus-5",
              ],
              defaultBrain: "scripted",
              gate: null,
            },
            b: {
              available: true,
              brains: ["scripted", "claude-haiku-4-5"],
              defaultBrain: "claude-haiku-4-5",
              gate: {
                level: "soft",
                resetsAtMs,
                gated: ["claude-sonnet-5", "claude-opus-5"],
              },
            },
          }),
          preferredBrain$: of<JarvisBrain>("claude-opus-5"),
          effort$: of<JarvisEffort>("medium"),
        });
        const seen: JarvisState[] = [];
        const sub = machine.state$.subscribe((s) => {
          seen.push(s);
        });
        flush();
        sub.unsubscribe();
        machine.dispose();

        const last = seen.at(-1);
        // effectiveBrain/gate still fold normally — only the entry append
        // is suppressed.
        expect(last?.effectiveBrain).toBe("claude-haiku-4-5");
        expect(last?.gate).not.toBeNull();
        expect(last?.entries).toEqual([
          { id: 0, role: "jarvis", text: JARVIS_GREETING, done: true },
        ]);
      });
    });

    it("hard gate wording names scripted", () => {
      const resetsAtMs = 1_893_456_000_000;
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: ts.createColdObservable<JarvisAvailability>(
              "a---------b",
              {
                a: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
                b: {
                  available: true,
                  brains: ["scripted"],
                  defaultBrain: "scripted",
                  gate: {
                    level: "hard",
                    resetsAtMs,
                    gated: [
                      "claude-haiku-4-5",
                      "claude-sonnet-5",
                      "claude-opus-5",
                    ],
                  },
                },
              },
            ),
            preferredBrain$: of<JarvisBrain>("claude-opus-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
        },
      );

      const last = states.at(-1);
      expect(last?.effectiveBrain).toBe("scripted");
      expect(last?.entries.at(-1)?.text).toBe(
        `Usage budget reached — continuing on scripted until ${formatGateResetTime(resetsAtMs)}.`,
      );
      expect(last?.entries.at(-1)?.origin).toBe("system");
    });

    it("state.gate mirrors the availability gate and clears on lift; no line appears on the lift frame even though effectiveBrain reverts", () => {
      const resetsAtMs = 1_893_456_000_000;
      const gate = {
        level: "soft" as const,
        resetsAtMs,
        gated: ["claude-sonnet-5" as const, "claude-opus-5" as const],
      };

      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            // a (frame 0): every brain offered, no gate.
            // b (frame 6, well after the frame-1 send() has settled): the
            // soft gate above narrows brains and un-offers opus.
            // c (frame 12): lift — every brain re-offered, gate back to
            // null. effectiveBrain reverts opus->...->opus, but no system
            // line appends on this frame.
            availability$: ts.createColdObservable<JarvisAvailability>(
              "a-----b-----c",
              {
                a: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
                b: {
                  available: true,
                  brains: ["scripted", "claude-haiku-4-5"],
                  defaultBrain: "claude-haiku-4-5",
                  gate,
                },
                c: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
              },
            ),
            preferredBrain$: of<JarvisBrain>("claude-opus-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
        },
      );

      const softState = states.find((s) => {
        return s.gate !== null;
      });
      expect(softState?.gate).toEqual(gate);

      const last = states.at(-1);
      expect(last?.gate).toBeNull();
      expect(last?.effectiveBrain).toBe("claude-opus-5");
      expect(
        last?.entries.filter((e) => {
          return e.origin === "system";
        }),
      ).toHaveLength(1);
    });

    it("omits the 'until' clause when resetsAtMs is 0 (forced gate on a fresh window)", () => {
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: ts.createColdObservable<JarvisAvailability>(
              "a---------b",
              {
                a: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
                b: {
                  available: true,
                  brains: ["scripted"],
                  defaultBrain: "scripted",
                  gate: {
                    level: "hard",
                    resetsAtMs: 0,
                    gated: [
                      "claude-haiku-4-5",
                      "claude-sonnet-5",
                      "claude-opus-5",
                    ],
                  },
                },
              },
            ),
            preferredBrain$: of<JarvisBrain>("claude-opus-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
        },
      );

      expect(states.at(-1)?.entries.at(-1)?.text).toBe(
        "Usage budget reached — continuing on scripted.",
      );
    });

    it("REGRESSION (root fix): a gate frame landing between two deltas of an in-flight turn does not hijack the streaming entry — the real reply still gets both deltas + done:true, and the system line is a separate, clean entry", () => {
      // The MODAL path per the reviewer's CRITICAL finding: the server
      // pushes JARVIS_AVAILABILITY synchronously off the very turn's own
      // recordTokens, so a gate frame landing strictly BETWEEN two deltas
      // of the turn that tripped it is the common case, not an edge case.
      // Before the id-targeting fix, the system line (appended mid-turn)
      // became "the last entry", so the "USD" delta below would have glued
      // onto ITS text instead of the real streaming entry — leaving the
      // real entry stuck at done:false forever.
      const resetsAtMs = 1_893_456_000_000;
      const states = run(
        (ts) => {
          return {
            // Relative to this port's own subscribe at frame 1 (send()'s
            // schedule below): delta "EUR" at frame 1, delta "USD" at frame
            // 7, done at frame 10.
            port: fakePort(ts, "a-----b--(c|)", {
              a: { type: "delta", text: "EUR" },
              b: { type: "delta", text: "USD" },
              c: { type: "done" },
            }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            // Relative to machine construction (frame 0): baseline at
            // frame 0, the gate at frame 4 — strictly between the turn's
            // own delta-1 (frame 1) and delta-2 (frame 7).
            availability$: ts.createColdObservable<JarvisAvailability>(
              "a---g",
              {
                a: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
                g: {
                  available: true,
                  brains: ["scripted", "claude-haiku-4-5"],
                  defaultBrain: "claude-haiku-4-5",
                  gate: {
                    level: "soft",
                    resetsAtMs,
                    gated: ["claude-sonnet-5", "claude-opus-5"],
                  },
                },
              },
            ),
            preferredBrain$: of<JarvisBrain>("claude-opus-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
        },
      );

      const last = states.at(-1);

      // The real streaming reply (id 2, allocated by the turn's own
      // "start" item): both deltas concatenated, finalized done:true.
      expect(
        last?.entries.find((e) => {
          return e.id === 2;
        }),
      ).toEqual({
        id: 2,
        role: "jarvis",
        text: "EURUSD",
        done: true,
      });

      // The system line (id 3, appended mid-turn) stayed a separate, clean
      // entry — untouched by either delta.
      expect(
        last?.entries.find((e) => {
          return e.origin === "system";
        })?.text,
      ).toBe(
        `Usage budget reached — continuing on Haiku 4.5 until ${formatGateResetTime(resetsAtMs)}.`,
      );

      // Append order: greeting, user, jarvis reply, system line — the
      // system line landing mid-turn doesn't reorder anything, since the
      // fix targets the real entry BY ID rather than by array position.
      expect(
        last?.entries.map((e) => {
          return e.id;
        }),
      ).toEqual([0, 1, 2, 3]);
    });

    it("REGRESSION (root fix): a drive outcome landing between two deltas of an in-flight turn does not hijack the streaming entry — mirrors the P5 latent bug (a stray delta glued onto 'drive: switchTab')", () => {
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "a-----b--(c|)", {
              a: { type: "delta", text: "EUR" },
              b: { type: "delta", text: "USD" },
              c: { type: "done" },
            }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            ...baseBrainDeps(),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
          // Lands strictly between the turn's own delta-1 (frame 1) and
          // delta-2 (frame 7).
          ts.schedule(() => {
            machine.intents.recordDriveOutcome({
              command: { kind: "switchTab", tab: "equities" },
              status: "applied",
            });
          }, 4);
        },
      );

      const last = states.at(-1);

      expect(
        last?.entries.find((e) => {
          return e.id === 2;
        }),
      ).toEqual({
        id: 2,
        role: "jarvis",
        text: "EURUSD",
        done: true,
      });

      expect(
        last?.entries.find((e) => {
          return e.text.startsWith("drive:");
        })?.text,
      ).toBe("drive: switchTab");

      expect(
        last?.entries.map((e) => {
          return e.id;
        }),
      ).toEqual([0, 1, 2, 3]);
    });

    it("REGRESSION (mutation witness): a republished frame at the SAME gate level with only resetsAtMs bumped does not append a second line — 'exactly once per downgrade', not 'once per gated frame'", () => {
      // A comparison against `preferredBrain` (unaffected by a re-judge
      // that doesn't change what's offered) instead of the FOLDED state's
      // own previous effectiveBrain would re-append on every republished
      // gated frame — this is the discriminating witness.
      const t1 = 1_893_456_000_000;
      const t2 = 1_893_456_600_000; // 10 minutes later — a re-judge, not a new downgrade
      const states = run(
        (ts) => {
          return {
            port: fakePort(ts, "(a|)", { a: { type: "done" } }),
            skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
            setSkin: () => {},
            availability$: ts.createColdObservable<JarvisAvailability>(
              "a---------b---------c",
              {
                a: {
                  available: true,
                  brains: [
                    "scripted",
                    "claude-haiku-4-5",
                    "claude-sonnet-5",
                    "claude-opus-5",
                  ],
                  defaultBrain: "scripted",
                  gate: null,
                },
                b: {
                  available: true,
                  brains: ["scripted", "claude-haiku-4-5"],
                  defaultBrain: "claude-haiku-4-5",
                  gate: {
                    level: "soft",
                    resetsAtMs: t1,
                    gated: ["claude-sonnet-5", "claude-opus-5"],
                  },
                },
                c: {
                  available: true,
                  brains: ["scripted", "claude-haiku-4-5"],
                  defaultBrain: "claude-haiku-4-5",
                  gate: {
                    level: "soft",
                    resetsAtMs: t2,
                    gated: ["claude-sonnet-5", "claude-opus-5"],
                  },
                },
              },
            ),
            preferredBrain$: of<JarvisBrain>("claude-opus-5"),
            effort$: of<JarvisEffort>("medium"),
          };
        },
        ({ machine, ts }) => {
          ts.schedule(() => {
            machine.intents.send("quote EURUSD");
          }, 1);
        },
      );

      const last = states.at(-1);
      // gate/effectiveBrain still fold to the LATEST re-judged frame — only
      // the entry append is suppressed the second time.
      expect(last?.gate?.resetsAtMs).toBe(t2);
      expect(last?.effectiveBrain).toBe("claude-haiku-4-5");
      expect(
        last?.entries.filter((e) => {
          return e.origin === "system";
        }),
      ).toHaveLength(1);
    });
  });

  describe("formatGateResetTime", () => {
    it("returns the em-dash sentinel for 0", () => {
      expect(formatGateResetTime(0)).toBe("—");
    });

    it("formats a non-zero epoch as locale HH:MM", () => {
      const resetsAtMs = 1_893_456_000_000;
      expect(formatGateResetTime(resetsAtMs)).toBe(
        new Date(resetsAtMs).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    });

    it("WITNESS: pins the intended HH:MM 24-hour shape under an explicit en-GB locale, independent of whatever locale is ambient in the test runner", () => {
      // formatGateResetTime itself always formats under `[]` (the ambient
      // ICU default locale — see its doc), so it can't be asked to render
      // as en-GB directly, and the two tests above (which recompute their
      // own "expected" value via that same ambient formula) would pass
      // even if the ambient ICU default happened to render 12-hour AM/PM
      // copy. This pins the concrete 24-hour "HH:MM" shape the feature is
      // designed around against Node's full ICU under an EXPLICIT locale,
      // so at least one assertion in this suite carries a literal,
      // environment-independent expected string. CI runs UTC, so a
      // `Date.UTC` instant renders identically regardless of the runner's
      // timezone.
      const resetsAtMs = Date.UTC(2026, 0, 15, 14, 30);
      expect(
        new Date(resetsAtMs).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      ).toBe("14:30");
    });
  });
});

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** The default `preferredBrain$`/`effort$` most tests don't care about:
 * "scripted" is always among the sim-default's offered brains, so
 * effectiveBrain resolves predictably without every unrelated test needing
 * to reason about brain-picker semantics. */
function baseBrainDeps(): Pick<JarvisDeps, "preferredBrain$" | "effort$"> {
  return {
    preferredBrain$: of<JarvisBrain>("scripted"),
    effort$: of<JarvisEffort>("medium"),
  };
}

interface AskCall {
  readonly text: string;
  readonly options: JarvisAskOptions | undefined;
}

function fakePort(
  ts: TestScheduler,
  marbles: string,
  values: Record<string, JarvisEvent>,
): FakeJarvisPort {
  const confirms: Array<[string, boolean]> = [];
  const asks: string[] = [];
  const askCalls: AskCall[] = [];
  return {
    confirms,
    asks,
    askCalls,
    ask: (text: string, options?: JarvisAskOptions) => {
      asks.push(text);
      askCalls.push({ text, options });
      return ts.createColdObservable<JarvisEvent>(marbles, values);
    },
    confirm: (id: string, approved: boolean) => {
      confirms.push([id, approved]);
    },
  };
}

interface RunCtx {
  machine: ReturnType<typeof createJarvisMachine>;
  ts: TestScheduler;
}

/** Collect every emission of a machine's state$ as it runs, marble-driven. */
function run(
  buildDeps: (ts: TestScheduler) => JarvisDeps,
  drive: (ctx: RunCtx) => void,
): JarvisState[] {
  const states: JarvisState[] = [];
  const ts = scheduler();
  ts.run(({ flush }) => {
    const machine = createJarvisMachine(buildDeps(ts));
    const sub = machine.state$.subscribe((s) => {
      states.push(s);
    });
    drive({ machine, ts });
    flush();
    sub.unsubscribe();
    machine.dispose();
  });
  return states;
}

function basePort(ts: TestScheduler): FakeJarvisPort {
  return fakePort(ts, "-", {});
}

/** A JarvisPort test double that also records every confirm() and ask() call
 * (`asks` — the raw text of each turn; `askCalls` — text + the full
 * `options` argument, for asserting brain/effort forwarding). */
interface FakeJarvisPort extends JarvisPort {
  readonly confirms: Array<[string, boolean]>;
  readonly asks: string[];
  readonly askCalls: AskCall[];
}
