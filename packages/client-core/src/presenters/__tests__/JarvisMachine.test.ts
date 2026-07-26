import { of } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";

import { DEFAULT_JARVIS_SKIN, Direction, type JarvisSkin } from "@rtc/domain";

import type { JarvisEvent, JarvisPort } from "#/adapters/jarvisPort";

import {
  createJarvisMachine,
  JARVIS_GREETING,
  type JarvisDeps,
  type JarvisState,
} from "../JarvisMachine";

describe("createJarvisMachine", () => {
  it("starts with the greeting, closed, idle, no pending confirmation, and the first skin$ value", () => {
    const ts = scheduler();
    ts.run(() => {
      const machine = createJarvisMachine({
        port: basePort(ts),
        skin$: of<JarvisSkin>("reactor"),
        setSkin: () => {},
      });
      let current: JarvisState | undefined;
      const sub = machine.state$.subscribe((s) => {
        current = s;
      });
      expect(current).toEqual({
        open: false,
        skin: "reactor",
        unread: 0,
        phase: "idle",
        entries: [{ id: 0, role: "jarvis", text: JARVIS_GREETING, done: true }],
        pendingConfirmation: null,
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
            },
          }),
          skin$: of<JarvisSkin>(DEFAULT_JARVIS_SKIN),
          setSkin: () => {},
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
});

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

function fakePort(
  ts: TestScheduler,
  marbles: string,
  values: Record<string, JarvisEvent>,
): FakeJarvisPort {
  const confirms: Array<[string, boolean]> = [];
  return {
    confirms,
    ask: () => {
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

/** A JarvisPort test double that also records every confirm() call. */
interface FakeJarvisPort extends JarvisPort {
  readonly confirms: Array<[string, boolean]>;
}
