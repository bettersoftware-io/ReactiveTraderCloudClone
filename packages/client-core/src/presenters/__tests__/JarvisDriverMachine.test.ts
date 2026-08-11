import { BehaviorSubject, NEVER, of, Subject } from "rxjs";
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
import { MAX_DOCKED_PANELS } from "../JarvisPanelsMachine";
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

  it("the batch's first command applies immediately; later commands are DRIVE_STAGGER_MS apart", () => {
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
    // First command lands at the SAME frame the batch arrived (no dead
    // pause); the second is DRIVE_STAGGER_MS later.
    expect(
      growing.map((e) => {
        return e.frame;
      }),
    ).toEqual([1, 1 + DRIVE_STAGGER_MS]);
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

  it("powerSaverLevel$ is re-read fresh per command — a mid-batch flip to freeze collapses the NEXT command's stagger, not just a value latched once at batch start", () => {
    const level$ = new BehaviorSubject<PowerSaverLevel>("off");
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
        // Scheduled at the SAME frame as the batch, but registered AFTER it —
        // TestScheduler runs same-frame actions in scheduling order, so this
        // flip lands between the first command firing (index 0, always
        // immediate) and the second command's own stagger read. A "read once
        // at batch start" bug would have already captured "off" before this
        // ever runs, landing command 2 at 1 + DRIVE_STAGGER_MS instead.
        h.ts.schedule(() => {
          level$.next("freeze");
        }, 1);
      },
      { powerSaverLevel$: level$ },
    );

    const growing = seen.filter((e) => {
      return e.lastBatch.length > 0;
    });
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

  it("layout restore/collapse/expand ops apply successfully (not routed to the unknown-op default)", () => {
    const { seen, harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([
            {
              kind: "layout",
              op: "restore",
              tab: "equities",
              panelId: "eq-chart",
            },
            {
              kind: "layout",
              op: "collapse",
              tab: "equities",
              panelId: "eq-chart",
            },
            {
              kind: "layout",
              op: "expand",
              tab: "equities",
              panelId: "eq-chart",
            },
          ]),
        );
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: {
          kind: "layout",
          op: "restore",
          tab: "equities",
          panelId: "eq-chart",
        },
        status: "applied",
      },
      {
        command: {
          kind: "layout",
          op: "collapse",
          tab: "equities",
          panelId: "eq-chart",
        },
        status: "applied",
      },
      {
        command: {
          kind: "layout",
          op: "expand",
          tab: "equities",
          panelId: "eq-chart",
        },
        status: "applied",
      },
    ]);
    expect(harness.layoutSpy).toHaveBeenCalledTimes(3);

    // The collapse command's own fresh machine instance actually recorded
    // the collapse — proof `machine.intents.collapse` was really invoked,
    // not just that the outcome says "applied".
    const collapseMachine = harness.layoutSpy.mock.results[1]
      ?.value as ReturnType<typeof createLayoutMachine>;
    let collapsed: readonly string[] = [];
    collapseMachine.state$
      .subscribe((s) => {
        collapsed = s.collapsed;
      })
      .unsubscribe();
    expect(collapsed).toEqual(["eq-chart"]);
  });

  it("an unknown layout op (cast around the closed union) is skipped, not applied", () => {
    const bogusOp = {
      kind: "layout",
      op: "obliterate",
      tab: "equities",
      panelId: "eq-chart",
    } as unknown as DriveCommandV1;

    const { seen, harness } = run((h) => {
      h.ts.schedule(() => {
        h.events$.next(commandEvent([bogusOp]));
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      { command: bogusOp, status: "skipped", reason: "unknown layout op" },
    ]);
    // The membership check passed (panelId IS known) so `layout(tab)` was
    // called — the unknown-op branch is only reached after that.
    expect(harness.layoutSpy).toHaveBeenCalledWith("equities");
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

  it("eqSelect before knownSymbols$ has emitted is skipped 'watchlist not loaded' — never a false 'unknown symbol'", () => {
    const { seen } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([{ kind: "eqSelect", symbol: "EURUSD" }]),
          );
        }, 1);
      },
      { knownSymbols$: NEVER },
    );

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "eqSelect", symbol: "EURUSD" },
        status: "skipped",
        reason: "watchlist not loaded",
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

  it("eqPane already at the requested value is skipped 'already set' and the toggle intent is NOT called", () => {
    const { seen, harness } = run((h) => {
      // rsi starts OFF; requesting on:false is already satisfied.
      h.ts.schedule(() => {
        h.events$.next(
          commandEvent([{ kind: "eqPane", id: "rsi", on: false }]),
        );
      }, 1);
    });

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "eqPane", id: "rsi", on: false },
        status: "skipped",
        reason: "already set",
      },
    ]);
    let panes: readonly string[] = [];
    harness.eqWorkspace.state$
      .subscribe((s) => {
        panes = s.panes;
      })
      .unsubscribe();
    expect(panes).toEqual([]);
  });

  it("eqPane NOT at the requested value is applied and the toggle intent IS called", () => {
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

  it("dockPanel: an unknown panelId (not in livePanelIds$) is skipped with a reason; the injected dockPanel is never called", () => {
    const { seen, harness } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([{ kind: "dockPanel", panelId: "not-a-real-panel" }]),
          );
        }, 1);
      },
      { livePanelIds$: of(["panel-scripted-1"]), dockedPanelIds$: of([]) },
    );

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "dockPanel", panelId: "not-a-real-panel" },
        status: "skipped",
        reason: 'unknown panelId "not-a-real-panel"',
      },
    ]);
    expect(harness.dockPanel).not.toHaveBeenCalled();
  });

  it("dockPanel: a panelId already in dockedPanelIds$ is skipped 'already docked'", () => {
    const { seen, harness } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([{ kind: "dockPanel", panelId: "panel-scripted-1" }]),
          );
        }, 1);
      },
      {
        livePanelIds$: of(["panel-scripted-1"]),
        dockedPanelIds$: of(["panel-scripted-1"]),
      },
    );

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "dockPanel", panelId: "panel-scripted-1" },
        status: "skipped",
        reason: "already docked",
      },
    ]);
    expect(harness.dockPanel).not.toHaveBeenCalled();
  });

  it("dockPanel: at MAX_DOCKED_PANELS already docked (elsewhere) is skipped 'dock full'", () => {
    const dockedElsewhere = Array.from(
      { length: MAX_DOCKED_PANELS },
      (_, i) => {
        return `docked-${i}`;
      },
    );

    const { seen, harness } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([{ kind: "dockPanel", panelId: "panel-scripted-1" }]),
          );
        }, 1);
      },
      {
        livePanelIds$: of(["panel-scripted-1", ...dockedElsewhere]),
        dockedPanelIds$: of(dockedElsewhere),
      },
    );

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "dockPanel", panelId: "panel-scripted-1" },
        status: "skipped",
        reason: "dock full",
      },
    ]);
    expect(harness.dockPanel).not.toHaveBeenCalled();
  });

  it("dockPanel: a known, undocked panelId under the cap is applied — the injected dockPanel is called", () => {
    const { seen, harness } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([{ kind: "dockPanel", panelId: "panel-scripted-1" }]),
          );
        }, 1);
      },
      { livePanelIds$: of(["panel-scripted-1"]), dockedPanelIds$: of([]) },
    );

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "dockPanel", panelId: "panel-scripted-1" },
        status: "applied",
      },
    ]);
    expect(harness.dockPanel).toHaveBeenCalledWith("panel-scripted-1");
  });

  it("undockPanel: a panelId not in dockedPanelIds$ is skipped 'not docked'; the injected undockPanel is never called", () => {
    const { seen, harness } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([
              { kind: "undockPanel", panelId: "panel-scripted-1" },
            ]),
          );
        }, 1);
      },
      { dockedPanelIds$: of([]) },
    );

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "undockPanel", panelId: "panel-scripted-1" },
        status: "skipped",
        reason: "not docked",
      },
    ]);
    expect(harness.undockPanel).not.toHaveBeenCalled();
  });

  it("undockPanel: a docked panelId is applied — the injected undockPanel is called", () => {
    const { seen, harness } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([
              { kind: "undockPanel", panelId: "panel-scripted-1" },
            ]),
          );
        }, 1);
      },
      { dockedPanelIds$: of(["panel-scripted-1"]) },
    );

    expect(seen.at(-1)?.lastBatch).toEqual([
      {
        command: { kind: "undockPanel", panelId: "panel-scripted-1" },
        status: "applied",
      },
    ]);
    expect(harness.undockPanel).toHaveBeenCalledWith("panel-scripted-1");
  });

  it("layout: the membership gate widens to STATIC ids ∪ dockedPanelIds$ — a docked panel outside the tab's default layout tree is a legitimate layout target", () => {
    const { harness } = run(
      (h) => {
        h.ts.schedule(() => {
          h.events$.next(
            commandEvent([
              {
                kind: "layout",
                op: "maximize",
                tab: "equities",
                panelId: "panel-docked-only",
              },
            ]),
          );
        }, 1);
      },
      { dockedPanelIds$: of(["panel-docked-only"]) },
    );

    // Reaching layout(tab) at all proves the membership check passed —
    // "panel-docked-only" is not in KNOWN_PANEL_IDS.equities.
    expect(harness.layoutSpy).toHaveBeenCalledWith("equities");
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

  it("a throwing injected dep is caught per-command: the batch continues and the driver survives for the next batch", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const harness = buildHarness(ts);
      const throwingWorkspaceNav: Harness["workspaceNav"] = {
        ...harness.workspaceNav,
        intents: {
          switchTab: () => {
            throw new Error("boom — switchTab blew up");
          },
        },
      };

      const handle = createJarvisDriverMachine({
        ...depsFrom(harness),
        workspaceNav: throwingWorkspaceNav,
      });

      let erroredOut = false;
      const seen: JarvisDriverState[] = [];
      const sub = handle.state$.subscribe({
        next: (s: JarvisDriverState) => {
          seen.push(s);
        },
        error: () => {
          erroredOut = true;
        },
      });

      ts.schedule(() => {
        harness.events$.next(
          commandEvent([
            { kind: "switchTab", tab: "equities" }, // throws
            { kind: "eqTimeframe", tf: "1W" }, // must still apply
          ]),
        );
      }, 1);

      // A SEPARATE, later batch — proves state$ itself never errored out.
      ts.schedule(
        () => {
          harness.events$.next(
            commandEvent([{ kind: "eqChartType", chart: "line" }]),
          );
        },
        1 + DRIVE_STAGGER_MS + 1,
      );

      flush();
      sub.unsubscribe();

      expect(erroredOut).toBe(false);

      const firstBatchFinal = seen.find((s) => {
        return s.lastBatch.length === 2;
      });
      expect(firstBatchFinal?.lastBatch).toEqual([
        {
          command: { kind: "switchTab", tab: "equities" },
          status: "skipped",
          reason: "boom — switchTab blew up",
        },
        { command: { kind: "eqTimeframe", tf: "1W" }, status: "applied" },
      ]);

      expect(seen.at(-1)?.lastBatch).toEqual([
        { command: { kind: "eqChartType", chart: "line" }, status: "applied" },
      ]);
    });
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
      // Fires well before batch 1 completes (its 2nd command lands at
      // 1 + DRIVE_STAGGER_MS = 351): a genuine mid-stagger arrival.
      h.ts.schedule(() => {
        h.events$.next(commandEvent([{ kind: "switchTab", tab: "admin" }]));
      }, 100);
    });

    const growing = seen.filter((e) => {
      return e.lastBatch.length > 0;
    });
    // batch 1's first command lands immediately (frame 1), its second
    // DRIVE_STAGGER_MS later (351). Batch 2's own single command is index 0
    // within ITS batch, so it too fires immediately — but only once batch 1's
    // whole observable completes, i.e. also at frame 351, never at 100.
    expect(
      growing.map((e) => {
        return e.frame;
      }),
    ).toEqual([1, 1 + DRIVE_STAGGER_MS, 1 + DRIVE_STAGGER_MS]);
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

  it("outcomes$ emits once per command, in application order, at the SAME frames lastBatch grows at — both applied AND skipped outcomes flow through", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const harness = buildHarness(ts);
      const handle = createJarvisDriverMachine(depsFrom(harness));

      const seen: OutcomeEmission[] = [];
      const sub = handle.outcomes$.subscribe((outcome) => {
        seen.push({ frame: ts.now(), outcome });
      });

      ts.schedule(() => {
        harness.events$.next(
          commandEvent([
            { kind: "switchTab", tab: "equities" }, // applied, index 0
            { kind: "eqSelect", symbol: "ZZZZZZ" }, // skipped, index 1 (staggered)
          ]),
        );
      }, 1);

      flush();
      sub.unsubscribe();

      expect(seen).toEqual([
        {
          frame: 1,
          outcome: {
            command: { kind: "switchTab", tab: "equities" },
            status: "applied",
          },
        },
        {
          frame: 1 + DRIVE_STAGGER_MS,
          outcome: {
            command: { kind: "eqSelect", symbol: "ZZZZZZ" },
            status: "skipped",
            reason: 'unknown symbol "ZZZZZZ"',
          },
        },
      ]);
    });
  });

  it("outcomes$ keeps emitting across a SECOND queued batch — never completes", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const harness = buildHarness(ts);
      const handle = createJarvisDriverMachine(depsFrom(harness));

      const outcomes: DriveOutcome[] = [];
      const sub = handle.outcomes$.subscribe((outcome) => {
        outcomes.push(outcome);
      });

      ts.schedule(() => {
        harness.events$.next(
          commandEvent([{ kind: "switchTab", tab: "equities" }]),
        );
      }, 1);
      ts.schedule(
        () => {
          harness.events$.next(
            commandEvent([{ kind: "switchTab", tab: "fx" }]),
          );
        },
        1 + DRIVE_STAGGER_MS + 1,
      );

      flush();
      sub.unsubscribe();

      expect(outcomes).toEqual([
        { command: { kind: "switchTab", tab: "equities" }, status: "applied" },
        { command: { kind: "switchTab", tab: "fx" }, status: "applied" },
      ]);
    });
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
  readonly dockPanel: ReturnType<typeof vi.fn<(panelId: string) => void>>;
  readonly undockPanel: ReturnType<typeof vi.fn<(panelId: string) => void>>;
}

interface HarnessOverrides {
  readonly knownSymbols$?: JarvisDriverDeps["knownSymbols$"];
  readonly powerSaverLevel$?: JarvisDriverDeps["powerSaverLevel$"];
  readonly initialEqSymbol?: string;
  readonly livePanelIds$?: JarvisDriverDeps["livePanelIds$"];
  readonly dockedPanelIds$?: JarvisDriverDeps["dockedPanelIds$"];
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
    dockPanel: vi.fn<(panelId: string) => void>(),
    undockPanel: vi.fn<(panelId: string) => void>(),
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
    dockPanel: h.dockPanel,
    undockPanel: h.undockPanel,
    knownLayoutPanelIds: (tab: WorkspaceTab) => {
      return KNOWN_PANEL_IDS[tab];
    },
    knownSymbols$: overrides.knownSymbols$ ?? of(["EURUSD", "GBPUSD"]),
    powerSaverLevel$: overrides.powerSaverLevel$ ?? of<PowerSaverLevel>("off"),
    livePanelIds$: overrides.livePanelIds$ ?? of(["panel-scripted-1"]),
    dockedPanelIds$: overrides.dockedPanelIds$ ?? of([]),
    scheduler: h.ts,
  };
}

interface FrameEmission {
  readonly frame: number;
  readonly lastBatch: readonly DriveOutcome[];
}

interface OutcomeEmission {
  readonly frame: number;
  readonly outcome: DriveOutcome;
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
