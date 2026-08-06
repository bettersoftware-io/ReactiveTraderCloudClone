#!/usr/bin/env tsx
/**
 * Framework compare — React (19 + React Compiler) vs Solid runtime cost on
 * identical scenarios, against PRODUCTION builds of both web clients.
 *
 * Both clients share `@rtc/client-core` (streams, presenters, machines) and
 * the same scenario roster, so any main-thread difference is the framework
 * layer: reconciliation, DOM writes, and the style/layout they trigger. Runs
 * default to power-saver FREEZE — the motion audit proves freeze is
 * motion-free in both clients, so no CSS animation, rAF loop, or WAAPI churn
 * pollutes the numbers; what remains per quote tick is exactly the
 * framework's update path. (`--levels freeze,off` adds the full-motion
 * condition as a secondary datapoint; its rAF/FLIP work is shared
 * `motion-core` math, but compositor noise makes it a coarser signal.)
 *
 * Requires `pnpm build` first — the script serves each client's `dist/` via
 * `vite preview`, because dev-server overhead differs between the frameworks
 * (React's dev mode is far heavier than Solid's) and would bias the result.
 *
 * Metrics per scenario, median across trials, from CDP `Performance.getMetrics`
 * deltas: task/script/layout/style-recalc main-thread milliseconds, layout and
 * recalc counts, plus long-task (>50ms) counts, end-of-scenario JS heap and
 * live DOM node count.
 *
 * Usage:
 *   pnpm perf:framework-compare                  # both clients, freeze, 3 trials
 *   pnpm perf:framework-compare -- --levels freeze,off --trials 5 --seconds 10
 *   pnpm perf:framework-compare -- --cpu-throttle 8   # emulate slow hardware
 */
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { type CDPSession, chromium, type Page } from "@playwright/test";

import {
  E2E_SESSION_JSON,
  E2E_SESSION_KEY,
  seedLocalStorageItem,
} from "../browser/authSeed";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const CLIENTS = [
  { name: "react", pkg: "@rtc/client-react", port: 4273 },
  { name: "solid", pkg: "@rtc/client-solid", port: 4274 },
] as const;

const ALL_LEVELS = ["freeze", "off"] as const;

type Level = (typeof ALL_LEVELS)[number];
type ClientName = (typeof CLIENTS)[number]["name"];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const results = new Map<string, ScenarioSample[]>();

  for (const client of CLIENTS) {
    if (!args.clients.includes(client.name)) {
      continue;
    }

    const server = await startPreviewServer(client.pkg, client.port);

    try {
      for (const level of args.levels) {
        for (let trial = 0; trial < args.trials; trial += 1) {
          console.error(
            `[compare] ${client.name} · ${level} · trial ${trial + 1}/${args.trials}`,
          );
          await runTrial(client.name, client.port, level, args, results);
        }
      }
    } finally {
      server.kill();
    }
  }

  report(results, args);
}

/** One full pass over every scenario in a fresh browser context. */
async function runTrial(
  client: ClientName,
  port: number,
  level: Level,
  args: CompareArgs,
  results: Map<string, ScenarioSample[]>,
): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  await context.addInitScript(seedLocalStorageItem, {
    key: E2E_SESSION_KEY,
    value: E2E_SESSION_JSON,
  });
  // tsx's esbuild transform (keepNames) wraps serialized page functions in
  // `__name(...)` calls that do not exist in the page — same shim as
  // motion-audit.ts.
  await context.addInitScript(() => {
    const g = globalThis as EsbuildHelperGlobal;

    g.__name ??= (target: unknown): unknown => {
      return target;
    };
  });
  // Long-task observer: counts main-thread tasks >50ms during a scenario.
  await context.addInitScript(() => {
    const g = globalThis as LongTaskGlobal;

    g.__rtcLongTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        g.__rtcLongTasks?.push(entry.duration);
      }
    }).observe({ type: "longtask", buffered: true });
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send("Performance.enable");

  if (args.cpuThrottle > 1) {
    // Emulated slow hardware (the GPU-less Citrix/VDI case freeze exists
    // for): every main-thread millisecond is multiplied, so policies that
    // only matter under load — input-pressure coalescing, per-event update
    // costs — actually engage.
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: args.cpuThrottle,
    });
  }

  try {
    const url = `http://localhost:${port}/`;

    // Seed the power-saver preference BEFORE the app composes, then reload so
    // the whole session runs at this level (same key the preferences adapter
    // reads).
    await page.goto(url);
    await page.evaluate((lvl) => {
      localStorage.setItem("rtc-power-saver", lvl);
    }, level);
    await page.goto(url);
    await page
      .getByTestId("tab-fx")
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1500);

    for (const scenario of SCENARIOS) {
      const sample = await measure(cdp, page, args.seconds, scenario.run);

      push(results, `${client}|${level}|${scenario.name}`, sample);
    }
  } finally {
    await browser.close();
  }
}

interface Scenario {
  readonly name: string;
  readonly run: (page: Page, seconds: number) => Promise<void>;
}

const SCENARIOS: readonly Scenario[] = [
  {
    // Steady-state streaming on the FX tile grid: many independent price
    // cells updating — the classic fine-grained-vs-VDOM case.
    name: "stream-fx",
    run: async (page: Page, seconds: number): Promise<void> => {
      await openView(page, "fx");
      await page.waitForTimeout(seconds * 1000);
    },
  },
  {
    // Steady-state streaming on equities: watchlist re-ranks + chart data
    // appends — keyed list updates plus SVG path rebuilds.
    name: "stream-equities",
    run: async (page: Page, seconds: number): Promise<void> => {
      await openView(page, "equities");
      await page.waitForTimeout(seconds * 1000);
    },
  },
  {
    // Crosshair sweep: pointermove-driven synchronous re-render of the
    // crosshair overlay + readout on every event.
    name: "chart-crosshair",
    run: async (page: Page): Promise<void> => {
      await openView(page, "equities");

      const box = await boundingBox(page, "chart-plot");
      const y = box.y + box.height / 2;

      for (let pass = 0; pass < 3; pass += 1) {
        for (let i = 0; i <= 40; i += 1) {
          const t = pass % 2 === 0 ? i / 40 : 1 - i / 40;

          await page.mouse.move(box.x + 4 + (box.width - 8) * t, y);
        }
      }
    },
  },
  {
    // Wheel zoom: 10 notches in, 10 out — each notch rescales the viewport
    // and rebuilds the plot (20% span per notch).
    name: "chart-zoom",
    run: async (page: Page): Promise<void> => {
      await openView(page, "equities");

      const box = await boundingBox(page, "chart-plot");

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

      for (let i = 0; i < 10; i += 1) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(60);
      }

      for (let i = 0; i < 10; i += 1) {
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(60);
      }
    },
  },
  {
    // Navigator brush drag: pointer-driven window pan across the mini-map —
    // every pointermove re-derives the viewport and re-renders the chart.
    name: "chart-navigator-drag",
    run: async (page: Page): Promise<void> => {
      await openView(page, "equities");

      const box = await boundingBox(page, "navigator-window");
      const y = box.y + box.height / 2;
      const startX = box.x + box.width / 2;

      await page.mouse.move(startX, y);
      await page.mouse.down();

      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 0; i <= 30; i += 1) {
          const t = pass % 2 === 0 ? i / 30 : 1 - i / 30;

          await page.mouse.move(startX + 120 * t, y);
        }
      }

      await page.mouse.up();

      // Restore live-follow for the scenarios after this one; the button only
      // exists while the viewport is pinned away from the live edge.
      const backToLive = page.getByTestId("chart-back-to-live");

      if (await backToLive.isVisible()) {
        await backToLive.click();
      }
    },
  },
  {
    // Mount/unmount cost: cycle every workspace panel tree.
    name: "view-switch",
    run: async (page: Page): Promise<void> => {
      for (let round = 0; round < 4; round += 1) {
        for (const view of ["credit", "admin", "equities", "fx"] as const) {
          await openView(page, view);
          await page.waitForTimeout(250);
        }
      }
    },
  },
];

async function openView(
  page: Page,
  view: "fx" | "credit" | "equities" | "admin",
): Promise<void> {
  await page.getByTestId(`tab-${view}`).click();

  if (view === "equities") {
    await page
      .getByTestId("chart-plot")
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  await page.waitForTimeout(500);
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boundingBox(page: Page, testId: string): Promise<Box> {
  const box = await page.getByTestId(testId).boundingBox();

  if (box === null) {
    throw new Error(`no bounding box for testid "${testId}"`);
  }

  return box;
}

interface ScenarioSample {
  readonly taskMs: number;
  readonly scriptMs: number;
  readonly layoutMs: number;
  readonly styleMs: number;
  readonly layoutCount: number;
  readonly styleCount: number;
  readonly longTasks: number;
  readonly longTaskMs: number;
  readonly heapMb: number;
  readonly nodes: number;
}

async function measure(
  cdp: CDPSession,
  page: Page,
  seconds: number,
  run: (page: Page, seconds: number) => Promise<void>,
): Promise<ScenarioSample> {
  await page.evaluate(() => {
    (globalThis as LongTaskGlobal).__rtcLongTasks = [];
  });

  const before = await metricsMap(cdp);

  await run(page, seconds);

  const after = await metricsMap(cdp);
  const longTasks = await page.evaluate(() => {
    return (globalThis as LongTaskGlobal).__rtcLongTasks ?? [];
  });

  function delta(name: string): number {
    return (after.get(name) ?? 0) - (before.get(name) ?? 0);
  }

  return {
    taskMs: delta("TaskDuration") * 1000,
    scriptMs: delta("ScriptDuration") * 1000,
    layoutMs: delta("LayoutDuration") * 1000,
    styleMs: delta("RecalcStyleDuration") * 1000,
    layoutCount: delta("LayoutCount"),
    styleCount: delta("RecalcStyleCount"),
    longTasks: longTasks.length,
    longTaskMs: longTasks.reduce((sum, d) => {
      return sum + d;
    }, 0),
    heapMb: (after.get("JSHeapUsedSize") ?? 0) / (1024 * 1024),
    nodes: after.get("Nodes") ?? 0,
  };
}

async function metricsMap(cdp: CDPSession): Promise<Map<string, number>> {
  const { metrics } = await cdp.send("Performance.getMetrics");

  return new Map(
    metrics.map((m) => {
      return [m.name, m.value];
    }),
  );
}

function push(
  results: Map<string, ScenarioSample[]>,
  key: string,
  sample: ScenarioSample,
): void {
  const list = results.get(key) ?? [];

  list.push(sample);
  results.set(key, list);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => {
    return a - b;
  });
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

const METRIC_ROWS = [
  {
    label: "task ms (total main thread)",
    pick: (s: ScenarioSample): number => {
      return s.taskMs;
    },
  },
  {
    label: "script ms",
    pick: (s: ScenarioSample): number => {
      return s.scriptMs;
    },
  },
  {
    label: "layout ms",
    pick: (s: ScenarioSample): number => {
      return s.layoutMs;
    },
  },
  {
    label: "style-recalc ms",
    pick: (s: ScenarioSample): number => {
      return s.styleMs;
    },
  },
  {
    label: "layout count",
    pick: (s: ScenarioSample): number => {
      return s.layoutCount;
    },
  },
  {
    label: "style-recalc count",
    pick: (s: ScenarioSample): number => {
      return s.styleCount;
    },
  },
  {
    label: "long tasks (>50ms)",
    pick: (s: ScenarioSample): number => {
      return s.longTasks;
    },
  },
  {
    label: "long-task ms",
    pick: (s: ScenarioSample): number => {
      return s.longTaskMs;
    },
  },
  {
    label: "JS heap MB (end)",
    pick: (s: ScenarioSample): number => {
      return s.heapMb;
    },
  },
  {
    label: "DOM nodes (end)",
    pick: (s: ScenarioSample): number => {
      return s.nodes;
    },
  },
] as const;

function report(
  results: Map<string, ScenarioSample[]>,
  args: CompareArgs,
): void {
  for (const level of args.levels) {
    for (const scenario of SCENARIOS) {
      const react = results.get(`react|${level}|${scenario.name}`);
      const solid = results.get(`solid|${level}|${scenario.name}`);

      console.log(`\n=== ${scenario.name} @ ${level} ===`);
      console.log(
        `${"metric".padEnd(30)} ${"react".padStart(10)} ${"solid".padStart(10)} ${"solid/react".padStart(12)}`,
      );

      for (const row of METRIC_ROWS) {
        const r = react ? median(react.map(row.pick)) : Number.NaN;
        const s = solid ? median(solid.map(row.pick)) : Number.NaN;
        const ratio =
          Number.isFinite(r) && Number.isFinite(s) && r !== 0
            ? (s / r).toFixed(2)
            : "-";

        console.log(
          `${row.label.padEnd(30)} ${format(r).padStart(10)} ${format(s).padStart(10)} ${ratio.padStart(12)}`,
        );
      }
    }
  }
}

function format(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
}

/** Serve a client's production `dist/` via `vite preview`; resolves when the
 * port answers. */
async function startPreviewServer(
  pkg: string,
  port: number,
): Promise<ChildProcess> {
  const child = spawn(
    "pnpm",
    [
      "--filter",
      pkg,
      "exec",
      "vite",
      "preview",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );

  const deadline = Date.now() + 30_000;

  for (;;) {
    try {
      const res = await fetch(`http://localhost:${port}/`);

      if (res.ok) {
        return child;
      }
    } catch {
      // Not up yet — keep polling until the deadline.
    }

    if (Date.now() > deadline) {
      child.kill();
      throw new Error(
        `vite preview for ${pkg} did not answer on :${port} within 30s — did you run \`pnpm build\` first?`,
      );
    }

    await new Promise((resolve) => {
      return setTimeout(resolve, 250);
    });
  }
}

/** esbuild's keepNames helper slot — see the `addInitScript` shim above. */
interface EsbuildHelperGlobal {
  __name?: (target: unknown, name: string) => unknown;
}

interface LongTaskGlobal {
  __rtcLongTasks?: number[];
}

interface CompareArgs {
  readonly clients: readonly ClientName[];
  readonly levels: readonly Level[];
  readonly trials: number;
  readonly seconds: number;
  readonly cpuThrottle: number;
}

function parseArgs(argv: readonly string[]): CompareArgs {
  let clients: readonly ClientName[] = ["react", "solid"];
  let levels: readonly Level[] = ["freeze"];
  let trials = 3;
  let seconds = 8;
  let cpuThrottle = 1;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === "--") {
      // pnpm forwards the `run script -- --flag` separator verbatim.
    } else if (arg === "--clients" && value !== undefined) {
      clients = value.split(",").map((raw) => {
        const trimmed = raw.trim();

        if (trimmed !== "react" && trimmed !== "solid") {
          throw new Error(`unknown client "${trimmed}" (use react, solid)`);
        }

        return trimmed;
      });
      i += 1;
    } else if (arg === "--levels" && value !== undefined) {
      levels = value.split(",").map((raw) => {
        const trimmed = raw.trim();

        if (!ALL_LEVELS.includes(trimmed as Level)) {
          throw new Error(`unknown level "${trimmed}" (use freeze, off)`);
        }

        return trimmed as Level;
      });
      i += 1;
    } else if (arg === "--trials" && value !== undefined) {
      trials = Number.parseInt(value, 10);
      i += 1;
    } else if (arg === "--seconds" && value !== undefined) {
      seconds = Number.parseFloat(value);
      i += 1;
    } else if (arg === "--cpu-throttle" && value !== undefined) {
      cpuThrottle = Number.parseFloat(value);
      i += 1;
    } else {
      throw new Error(
        `unknown argument "${arg}" (use --clients, --levels, --trials, --seconds, --cpu-throttle)`,
      );
    }
  }

  return { clients, levels, trials, seconds, cpuThrottle };
}

await main();
