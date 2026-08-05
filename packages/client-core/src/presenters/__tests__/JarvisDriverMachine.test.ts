import { of, Subject } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it, vi } from "vitest";

import type { PowerSaverLevel, ThemeSkin } from "@rtc/domain";
import type { DriveCommandV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";
import {
  createDefaultLayoutPort,
  type WorkspaceTab,
} from "#/layout/defaultLayoutPort";
import type { LayoutNode } from "#/layout/layoutPort";

import { createEqWorkspaceMachine } from "../EqWorkspaceMachine";
import {
  createJarvisDriverMachine,
  DRIVE_STAGGER_MS,
  type DriveOutcome,
  type JarvisDriverDeps,
  type JarvisDriverState,
} from "../JarvisDriverMachine";
import { createLayoutMachine } from "../LayoutMachine";
import { createWorkspaceNavMachine } from "../WorkspaceNavMachine";

const KNOWN_PANEL_IDS: Record<WorkspaceTab, readonly string[]> = {
  fx: collectPanelIds(createDefaultLayoutPort("fx").initial.root),
  credit: collectPanelIds(createDefaultLayoutPort("credit").initial.root),
  admin: collectPanelIds(createDefaultLayoutPort("admin").initial.root),
  equities: collectPanelIds(createDefaultLayoutPort("equities").initial.root),
};

describe("createJarvisDriverMachine", () => {
  it("starts with an empty lastBatch", () => {
    const { seen } = run(() => {
      // no drive
    });
    expect(seen[0]?.lastBatch).toEqual([]);
  });

  it("applies a batch's commands in order, DRIVE_STAGGER_MS apart", () => {
    const { seen } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([
            { kind: "switchTab", tab: "equities" },
            { kind: "switchTab", tab: "fx" },
          ]),
        );
      }, 1);
    });

    const growing = seen.filter((e) => {
      return e.lastBatch.length > 0;
    });
    expect(
      growing.map((e) => {
        return e.frame;
      }),
    ).toEqual([1 + DRIVE_STAGGER_MS, 1 + DRIVE_STAGGER_MS * 2]);
    expect(growing[0]?.lastBatch).toEqual([
      { command: { kind: "switchTab", tab: "equities" }, status: "applied" },
    ]);
    expect(growing[1]?.lastBatch).toEqual([
      { command: { kind: "switchTab", tab: "equities" }, status: "applied" },
      { command: { kind: "switchTab", tab: "fx" }, status: "applied" },
    ]);
  });

  it("switchTab dispatches workspaceNav.intents.switchTab", () => {
    const { harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(commandEvent([{ kind: "switchTab", tab: "equities" }]));
      }, 1);
    });

    let active: string | undefined;
    harness.workspaceNav.state$
      .subscribe((s) => {
        active = s.activeTab;
      })
      .unsubscribe();
    expect(active).toBe("equities");
  });

  it("stagger collapses to 0 when powerSaverLevel$'s latest value is freeze", () => {
    const { seen } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([
              { kind: "switchTab", tab: "equities" },
              { kind: "switchTab", tab: "fx" },
            ]),
          );
        }, 1);
      },
      { powerSaverLevel$: of<PowerSaverLevel>("freeze") },
    );

    const growing = seen.filter((e) => {
      return e.lastBatch.length > 0;
    });
    // Both commands land at the SAME frame (1) — no stagger under freeze.
    expect(
      growing.map((e) => {
        return e.frame;
      }),
    ).toEqual([1, 1]);
  });

  it("an unknown layout panelId is skipped with a reason; later commands still apply", () => {
    const { seen, harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([
            {
              kind: "layout",
              op: "maximize",
              tab: "equities",
              panelId: "not-a-real-panel",
            },
            { kind: "switchTab", tab: "equities" },
          ]),
        );
      }, 1);
    });

    const last = seen.at(-1);
    expect(last?.lastBatch).toEqual([
      {
        command: {
          kind: "layout",
          op: "maximize",
          tab: "equities",
          panelId: "not-a-real-panel",
        },
        status: "skipped",
        reason: 'unknown panelId "not-a-real-panel" for tab "equities"',
      },
      { command: { kind: "switchTab", tab: "equities" }, status: "applied" },
    ]);
    // The unknown-panel command never even asked for a layout machine.
    expect(harness.layoutSpy).not.toHaveBeenCalled();
  });

  it("a known layout panelId is applied against the machine for the command's OWN tab, regardless of workspaceNav state", () => {
    const { harness } = run((h) => {
      // workspaceNav stays on the default "fx" tab throughout — never switched.
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([
            {
              kind: "layout",
              op: "maximize",
              tab: "equities",
              panelId: "eq-chart",
            },
          ]),
        );
      }, 1);
    });

    expect(harness.layoutSpy).toHaveBeenCalledWith("equities");
    const created = harness.layoutSpy.mock.results[0]?.value as ReturnType<
      typeof createLayoutMachine
    >;
    let maximized: string | null | undefined;
    created.state$
      .subscribe((s) => {
        maximized = s.maximized;
      })
      .unsubscribe();
    expect(maximized).toBe("eq-chart");

    let active: string | undefined;
    harness.workspaceNav.state$
      .subscribe((s) => {
        active = s.activeTab;
      })
      .unsubscribe();
    expect(active).toBe("fx");
  });

  it("an unknown eqSelect symbol is skipped with a reason", () => {
    const { seen } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(commandEvent([{ kind: "eqSelect", symbol: "ZZZZZZ" }]));
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "eqSelect", symbol: "ZZZZZZ" },
        status: "skipped",
        reason: 'unknown symbol "ZZZZZZ"',
      },
    ]);
  });

  it("a known eqSelect symbol is applied against eqWorkspace", () => {
    const { seen, harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(commandEvent([{ kind: "eqSelect", symbol: "GBPUSD" }]));
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      { command: { kind: "eqSelect", symbol: "GBPUSD" }, status: "applied" },
    ]);
    let sel: string | undefined;
    harness.eqWorkspace.state$
      .subscribe((s) => {
        sel = s.sel;
      })
      .unsubscribe();
    expect(sel).toBe("GBPUSD");
  });

  it("eqIndicator already at the requested value is skipped 'already set' and the toggle intent is NOT called", () => {
    const { seen, harness } = run((h) => {
      // ema50 starts OFF; requesting on:false is already satisfied.
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([{ kind: "eqIndicator", id: "ema50", on: false }]),
        );
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "eqIndicator", id: "ema50", on: false },
        status: "skipped",
        reason: "already set",
      },
    ]);
    let indicators: readonly string[] = [];
    harness.eqWorkspace.state$
      .subscribe((s) => {
        indicators = s.indicators;
      })
      .unsubscribe();
    expect(indicators).toEqual([]);
  });

  it("eqIndicator NOT at the requested value is applied and the toggle intent IS called", () => {
    const { seen, harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([{ kind: "eqIndicator", id: "ema50", on: true }]),
        );
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "eqIndicator", id: "ema50", on: true },
        status: "applied",
      },
    ]);
    let indicators: readonly string[] = [];
    harness.eqWorkspace.state$
      .subscribe((s) => {
        indicators = s.indicators;
      })
      .unsubscribe();
    expect(indicators).toEqual(["ema50"]);
  });

  it("eqPane follows the same already-set / applied rule as eqIndicator", () => {
    const { seen, harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(commandEvent([{ kind: "eqPane", id: "rsi", on: true }]));
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      { command: { kind: "eqPane", id: "rsi", on: true }, status: "applied" },
    ]);
    let panes: readonly string[] = [];
    harness.eqWorkspace.state$
      .subscribe((s) => {
        panes = s.panes;
      })
      .unsubscribe();
    expect(panes).toEqual(["rsi"]);
  });

  it("eqTimeframe and eqChartType are applied directly", () => {
    const { harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([
            { kind: "eqTimeframe", tf: "1W" },
            { kind: "eqChartType", chart: "line" },
          ]),
        );
      }, 1);
    });

    let state: EqDisplayState | undefined;
    harness.eqWorkspace.state$
      .subscribe((s) => {
        state = { timeframe: s.timeframe, chartType: s.chartType };
      })
      .unsubscribe();
    expect(state).toEqual({ timeframe: "1W", chartType: "line" });
  });

  it("setTheme and setPowerSaver call their injected closures", () => {
    const { harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([
            { kind: "setTheme", skin: "neon" },
            { kind: "setPowerSaver", level: "calm" },
          ]),
        );
      }, 1);
    });

    expect(harness.setThemeSkin).toHaveBeenCalledWith("neon");
    expect(harness.setPowerSaver).toHaveBeenCalledWith("calm");
  });

  it("dismissPanel always calls the injected dismissPanel, no membership check", () => {
    const { seen, harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([{ kind: "dismissPanel", panelId: "panel-scripted-1" }]),
        );
      }, 1);
    });

    expect(harness.dismissPanel).toHaveBeenCalledWith("panel-scripted-1");
    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "dismissPanel", panelId: "panel-scripted-1" },
        status: "applied",
      },
    ]);
  });

  it("an unknown command kind (cast around the closed union) is skipped, never thrown", () => {
    const bogus = { kind: "doTheImpossible" } as unknown as DriveCommandV1;
    let thrown: unknown;
    const { seen } = run((h) => {
      h.ts.schedule(() => {
        try {
          h.events$.next(commandEvent([bogus]));
        } catch (err) {
          thrown = err;
        }
      }, 1);
    });

    expect(thrown).toBeUndefined();
    expect(seen.at(-1)?.lastBatch).toEqual([
      { command: bogus, status: "skipped", reason: "unknown command kind" },
    ]);
  });

  it("a second batch arriving mid-stagger queues after the first (concatMap)", () => {
    const { seen } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([
            { kind: "switchTab", tab: "equities" },
            { kind: "switchTab", tab: "credit" },
          ]),
        );
      }, 1);
      // Fires mid-first-batch's stagger (well before frame 1 + 2*DRIVE_STAGGER_MS).
      h.ts.schedule(
        () => {
          h.events$.next(commandEvent([{ kind: "switchTab", tab: "admin" }]));
        },
        1 + DRIVE_STAGGER_MS + 1,
      );
    });

    const growing = seen.filter((e) => {
      return e.lastBatch.length > 0;
    });
    // batch 1's two commands land at 1+350 and 1+700; batch 2's single
    // command only starts its own stagger once batch 1 fully completes, so
    // it lands at 1+700+350 = 1051 — never interleaved earlier.
    expect(
      growing.map((e) => {
        return e.frame;
      }),
    ).toEqual([
      1 + DRIVE_STAGGER_MS,
      1 + DRIVE_STAGGER_MS * 2,
      1 + DRIVE_STAGGER_MS * 3,
    ]);
    expect(growing.at(-1)?.lastBatch).toEqual([
      { command: { kind: "switchTab", tab: "admin" }, status: "applied" },
    ]);
  });

  it("lastBatch resets to [] at the start of a new batch rather than accumulating across batches", () => {
    const { seen } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(commandEvent([{ kind: "switchTab", tab: "equities" }]));
      }, 1);
      h.ts.schedule(
        () => {
          h.events$.next(commandEvent([{ kind: "switchTab", tab: "fx" }]));
        },
        1 + DRIVE_STAGGER_MS + 1,
      );
    });

    const last = seen.at(-1);
    // If batches accumulated, this would have length 2.
    expect(last?.lastBatch).toEqual([
      { command: { kind: "switchTab", tab: "fx" }, status: "applied" },
    ]);
  });

  it("non-command JarvisEvents (delta, done, etc.) are ignored", () => {
    const { seen } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next({ type: "delta", text: "hello" });
      }, 1);
      h.ts.schedule(() => {
        h.events$.next({ type: "done" });
      }, 2);
    });

    expect(
      seen.every((e) => {
        return e.lastBatch.length === 0;
      }),
    ).toBe(true);
  });

  it("a late subscriber replays the current lastBatch rather than starting empty (warm subscription)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const harness = buildHarness(ts);
      const handle = createJarvisDriverMachine(depsFrom(harness));

      ts.schedule(() => {
        harness.events$.next(
          commandEvent([{ kind: "switchTab", tab: "equities" }]),
        );
      }, 1);

      let late: readonly DriveOutcome[] | undefined;
      ts.schedule(
        () => {
          const lateSub = handle.state$.subscribe((s) => {
            late = s.lastBatch;
          });
          lateSub.unsubscribe();
        },
        1 + DRIVE_STAGGER_MS + 1,
      );

      flush();
      expect(late).toEqual([
        { command: { kind: "switchTab", tab: "equities" }, status: "applied" },
      ]);
    });
  });
});

function collectPanelIds(node: LayoutNode): string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

function commandEvent(commands: DriveCommandV1[]): JarvisEvent {
  return { type: "command", batch: { v: 1, commands } };
}

interface Harness {
  readonly events$: Subject<JarvisEvent>;
  readonly ts: TestScheduler;
  readonly workspaceNav: ReturnType<typeof createWorkspaceNavMachine>;
  readonly eqWorkspace: ReturnType<typeof createEqWorkspaceMachine>;
  readonly layoutSpy: ReturnType<
    typeof vi.fn<(tab: WorkspaceTab) => ReturnType<typeof createLayoutMachine>>
  >;
  readonly setThemeSkin: ReturnType<typeof vi.fn<(skin: ThemeSkin) => void>>;
  readonly setPowerSaver: ReturnType<
    typeof vi.fn<(level: PowerSaverLevel) => void>
  >;
  readonly dismissPanel: ReturnType<typeof vi.fn<(panelId: string) => void>>;
}

interface HarnessOverrides {
  readonly knownSymbols$?: JarvisDriverDeps["knownSymbols$"];
  readonly powerSaverLevel$?: JarvisDriverDeps["powerSaverLevel$"];
  readonly initialEqSymbol?: string;
}

function buildHarness(
  ts: TestScheduler,
  overrides: HarnessOverrides = {},
): Harness {
  return {
    events$: new Subject<JarvisEvent>(),
    ts,
    workspaceNav: createWorkspaceNavMachine(),
    eqWorkspace: createEqWorkspaceMachine({
      initialSymbol: overrides.initialEqSymbol ?? "EURUSD",
    }),
    layoutSpy: vi.fn<
      (tab: WorkspaceTab) => ReturnType<typeof createLayoutMachine>
    >((tab: WorkspaceTab) => {
      return createLayoutMachine(createDefaultLayoutPort(tab));
    }),
    setThemeSkin: vi.fn<(skin: ThemeSkin) => void>(),
    setPowerSaver: vi.fn<(level: PowerSaverLevel) => void>(),
    dismissPanel: vi.fn<(panelId: string) => void>(),
  };
}

function depsFrom(
  h: Harness,
  overrides: HarnessOverrides = {},
): JarvisDriverDeps {
  return {
    events$: h.events$,
    workspaceNav: h.workspaceNav,
    layout: h.layoutSpy,
    eqWorkspace: h.eqWorkspace,
    setThemeSkin: h.setThemeSkin,
    setPowerSaver: h.setPowerSaver,
    dismissPanel: h.dismissPanel,
    knownLayoutPanelIds: (tab: WorkspaceTab) => {
      return KNOWN_PANEL_IDS[tab];
    },
    knownSymbols$: overrides.knownSymbols$ ?? of(["EURUSD", "GBPUSD"]),
    powerSaverLevel$: overrides.powerSaverLevel$ ?? of<PowerSaverLevel>("off"),
    scheduler: h.ts,
  };
}

interface FrameEmission {
  readonly frame: number;
  readonly lastBatch: readonly DriveOutcome[];
}

interface EqDisplayState {
  readonly timeframe: string;
  readonly chartType: string;
}

interface RunResult {
  readonly seen: FrameEmission[];
  readonly harness: Harness;
}

/** Runs `drive` inside a TestScheduler, recording every `state$` emission
 * with its virtual frame. `drive` receives the harness (spies/machines) and
 * may push events via `ts.schedule`. */
function run(
  drive: (h: Harness) => void,
  overrides: HarnessOverrides = {},
): RunResult {
  const seen: FrameEmission[] = [];
  const ts = scheduler();
  let harness!: Harness;
  ts.run(({ flush }) => {
    harness = buildHarness(ts, overrides);
    const handle = createJarvisDriverMachine(depsFrom(harness, overrides));
    const sub = handle.state$.subscribe((s: JarvisDriverState) => {
      seen.push({ frame: ts.now(), lastBatch: s.lastBatch });
    });
    drive(harness);
    flush();
    sub.unsubscribe();
  });
  return { seen, harness };
}
