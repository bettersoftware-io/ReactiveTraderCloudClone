# Chart Renderer Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every chart vm's geometry exist as a pure-numeric `ChartScene` (CSS custom-property strings become a projection at the edge), prove the seam with a framework-free canvas spike pinned by its own visual golden, and correct the docs' renderer-neutrality and "TradingView prerequisite" claims.

**Architecture:** Approach A from the spec — inside `@rtc/motion-core`, each vm splits into a numeric scene builder (`chartScene.ts`) plus a CSS-var projection (`chartCssVars.ts`); the existing `chartVm`/`volumeVm`/`crosshairVm`/`navigatorWindowStyle` keep identical signatures and byte-identical outputs, reimplemented as projection∘scene. A `drawChartScene` canvas engine in `@rtc/ui-contract` consumes the same scene, mounted by ~15-line test hosts in both clients' visual trees under one shared scenario.

**Tech Stack:** TypeScript (nodenext, `.js` import extensions), vitest, Playwright visual tier, Canvas 2D.

**Spec:** [../specs/2026-08-02-pluggable-chart-renderer-design.md](../specs/2026-08-02-pluggable-chart-renderer-design.md)

## Global Constraints

- **Zero visual change to existing goldens; zero behavioral change to either client.** All existing motion-core unit tests, both contract suites, and all committed goldens pass untouched.
- `chartVm` / `volumeVm` / `crosshairVm` / `navigatorLinePoints` / `navigatorWindowStyle` / `navigatorVm` keep their **exact public signatures and outputs** (byte-identical strings).
- `@rtc/motion-core` stays **zero-dependency and no-DOM**; `chartCssVars.ts` is string math only. `drawChartScene` lives in `@rtc/ui-contract` because it types against `CanvasRenderingContext2D`.
- Scene types carry only `number` / `boolean` / label-text `string` fields — **no `--`-keyed fields, no `%` or `calc(` inside any string value**. Coordinates are percent (0–100) of the plot box.
- **No module-level import cycle** (`pnpm check:deps` gates it): `chartScene.ts` is a leaf; `chartCssVars.ts` imports only from `chartScene.ts`; the vm modules import from both.
- Solid `src/` untouched — its visual **test tree** gains only the canvas host. RN untouched; no user-facing toggle; no charting library; no new workspace package.
- Repo rules: `#/` subpath imports with `.js` extensions in tsc-built libs; mandatory braces; handler-naming (`docs/handler-naming.md`); Biome format (`pnpm exec biome ci .` before push).

## File Structure

```
packages/motion-core/src/
  chartScene.ts        NEW  scene types + builders + moved geometry primitives
  chartScene.test.ts   NEW  scene neutrality (runtime walker + type-level) tests
  chartCssVars.ts      NEW  all scene→ChartVarStyle projections
  chartCssVars.test.ts NEW  equivalence pins (projection∘scene ≡ legacy vm)
  chartVm.ts           MOD  thin: re-exports moved names; chartVm/volumeVm = projection∘scene
  crosshairVm.ts       MOD  thin: crosshairVm = projection∘scene
  navigatorVm.ts       MOD  thin: navigatorWindowStyle = projection∘scene
  index.ts             MOD  export the new modules (explicit named exports)
packages/ui-contract/src/visual/canvas/
  drawChartScene.ts        NEW  engine + ChartPalette + SPIKE_PALETTE + spikeScene()
  drawChartScene.test.ts   NEW  recorder-ctx unit test
packages/ui-contract/src/visual/scenarios.ts                      MOD  +1 scenario
packages/client-react/tests/ui/visual/react/EquitiesChartCanvasSpike.visual.tsx  NEW
packages/client-react/tests/ui/visual/react/registry.tsx          MOD  +1 entry
packages/client-solid/tests/ui/visual/solid/EquitiesChartCanvasSpike.visual.tsx  NEW
packages/client-solid/tests/ui/visual/solid/registry.tsx          MOD  +1 entry
packages/ui-contract/goldens/playwright/__screenshots__/react-local/<arch>/…      NEW  10 goldens
docs/architecture/17-web-client-up-close.md                       MOD  renderer-seam subsection
docs/STATUS.md                                                    MOD  entry replaced
```

---

### Task 1: `chartScene` + `chartCssVars` — the chartVm/volumeVm split

**Files:**
- Create: `packages/motion-core/src/chartScene.ts`, `packages/motion-core/src/chartCssVars.ts`, `packages/motion-core/src/chartScene.test.ts`, `packages/motion-core/src/chartCssVars.test.ts`
- Modify: `packages/motion-core/src/chartVm.ts`, `packages/motion-core/src/index.ts`

**Interfaces:**
- Consumes: current `chartVm.ts` internals (`resolveWindow`, `xPct`, `withLiveLast`, `candleGeometry`, `buildTimeLabels`, constants).
- Produces (Tasks 2–4 rely on these exact names):
  - `chartScene(series: readonly ChartCandle[], liveRate: number, flashOn: boolean, opts?: ChartVmOptions): ChartScene`
  - `volumeScene(series: readonly ChartCandle[], viewport?: ChartViewport): readonly VolumeSceneBar[]`
  - `chartVmFromScene(scene: ChartScene): ChartVm`
  - `volumeBarsFromScene(bars: readonly VolumeSceneBar[]): readonly VolumeBarVm[]`
  - Types `ChartScene`, `SceneCandle`, `SceneGridLine`, `SceneLabel`, `VolumeSceneBar` (shapes below).
  - `ChartVarStyle`, `ChartCandle`, `ChartPoint`, `ChartScale`, `ChartKind`, `ChartVmOptions`, `Y_TOP`, `Y_SPAN`, `formatTimeLabel` now **live in `chartScene.ts`** but remain importable from `./chartVm.js` (named re-exports) and from the package root — no import site outside motion-core changes.

- [ ] **Step 1: Pin the current outputs (characterization).** Read `packages/motion-core/src/chartVm.test.ts`. Confirm it asserts exact `ChartVarStyle` strings for: a candles-kind render (body `--x/--top/--h/--w/--wleft-offset`, wick `--wx` `calc(…% - 0.5px)`/`--wtop`/`--wh`), grid `--gtop`, price-label `--ltop` `calc(…% - 6px)` + `txt`, time-label `--tx` + `txt`, a **clamped viewport** (fractional `start`/`end` where `iFirst`/`iLast` clamp), `line`/`area` kinds (`linePoints` populated, `candles` empty), the live-overlay last candle (`close`=liveRate, high/low stretched), `flashOn` glow, and `volumeVm` bars (`--x/--w/--h`, up flag). For any case NOT already asserted, add it to `chartVm.test.ts` now, against the UNSPLIT implementation, with exact expected strings taken from running the code.

- [ ] **Step 2: Run to verify green on unsplit code.**

Run: `pnpm --filter @rtc/motion-core test -- chartVm`
Expected: PASS (these are pins, not new behavior).

- [ ] **Step 3: Commit the pins.** `git add packages/motion-core/src/chartVm.test.ts && git commit -m "test(motion-core): pin chartVm/volumeVm string outputs ahead of the scene split"`

- [ ] **Step 4: Create `chartScene.ts`.** Move from `chartVm.ts` — verbatim, not rewritten: `ChartVarStyle`, `ChartCandle`, `ChartKind`, `ChartPoint`, `ChartScale`, `TimeLabelVm` (type only; its projected shape stays in chartVm.ts — see Step 5 note), `ChartVmOptions`, `Y_TOP`, `Y_SPAN`, `BODY_FRAC`, `HALF_BODY_FRAC`, `MIN_BODY`, `GRID_FRACTIONS`, `LABEL_FRACTIONS`, `DAY_MS`, `LABEL_TARGET_DIVISOR`, `STEP_CANDIDATES`, `MONTHS`, `formatTimeLabel`, `resolveWindow`, `xPct`, `withLiveLast`, `roundStepUp` and the `ChartWindow` interface. Then add the scene types and builders:

```ts
export interface SceneCandle {
  readonly key: number;
  readonly up: boolean;
  readonly last: boolean;
  readonly glow: boolean;
  readonly x: number; // column center, % of plot box
  readonly top: number; // body top
  readonly h: number; // body height
  readonly w: number; // body width
  readonly wickX: number; // == x; the -0.5px nudge is projection-side
  readonly wickTop: number;
  readonly wickH: number;
}

export interface SceneGridLine {
  readonly key: number;
  readonly top: number;
}

export interface SceneLabel {
  readonly key: number;
  readonly txt: string;
  /** Price labels position by `top`, time labels by `x`; the unused axis is 0. */
  readonly top: number;
  readonly x: number;
}

export interface VolumeSceneBar {
  readonly key: number;
  readonly up: boolean;
  readonly x: number;
  readonly w: number;
  readonly h: number;
}

export interface ChartScene {
  readonly kind: ChartKind;
  readonly candles: readonly SceneCandle[];
  readonly grid: readonly SceneGridLine[];
  readonly priceLabels: readonly SceneLabel[];
  readonly timeLabels: readonly SceneLabel[];
  readonly linePoints: readonly ChartPoint[];
  readonly scale: ChartScale;
}
```

`chartScene(series, liveRate, flashOn, opts)` is today's `chartVm` body with every `ChartVarStyle` construction replaced by the numeric fields — the mechanical rule is *every `--foo: "${N}%"` becomes numeric `foo: N`*. Specifically: candle `{x, top: Math.min(yOpen,yClose), h: Math.max(MIN_BODY, |yOpen-yClose|), w: cw*BODY_FRAC, wickX: x, wickTop: yPct(high), wickH: yPct(low)-yPct(high)}`; grid `{key: i, top: f*100}`; price labels `{key: i, txt: (cmax-f*crng).toFixed(2), top: f*100, x: 0}`; time labels `{key: i, txt: formatTimeLabel(...), top: 0, x: xPct(i, win.vp, win.span)}`; `linePoints`/`scale` unchanged; empty series returns the empty scene with `scale: {cmin: 0, cmax: 0}` and `kind` from opts. `volumeScene(series, viewport)` likewise: `{key: i, up, x, w: cw*BODY_FRAC, h: (volume/maxVolume)*100}`, empty series → `[]`.

- [ ] **Step 5: Create `chartCssVars.ts`** (imports ONLY from `./chartScene.js`):

```ts
import {
  BODY_FRAC_UNUSED_GUARD, // ← do NOT import geometry constants; projections never recompute geometry
} from "./chartScene.js";
```
…is the *anti*-pattern: the projection uses only scene fields. Real content:

```ts
import type {
  ChartScene,
  ChartVarStyle,
  SceneCandle,
  VolumeSceneBar,
} from "./chartScene.js";
import type { ChartVm, VolumeBarVm } from "./chartVm.js"; // TYPE-ONLY import — no cycle at runtime; if check:deps still flags it, move the ChartVm/VolumeBarVm/TimeLabelVm/CandleVm/GridLineVm/PriceLabelVm interfaces into chartScene.ts and re-export from chartVm.ts like the rest

export function chartVmFromScene(scene: ChartScene): ChartVm {
  return {
    candles: scene.candles.map(candleVmFromScene),
    grid: scene.grid.map((g) => {
      return { key: g.key, style: { "--gtop": `${g.top}%` } as ChartVarStyle };
    }),
    labels: scene.priceLabels.map((l) => {
      return {
        key: l.key,
        txt: l.txt,
        style: { "--ltop": `calc(${l.top}% - 6px)` } as ChartVarStyle,
      };
    }),
    linePoints: scene.linePoints,
    timeLabels: scene.timeLabels.map((l) => {
      return {
        key: l.key,
        txt: l.txt,
        style: { "--tx": `${l.x}%` } as ChartVarStyle,
      };
    }),
    scale: scene.scale,
  };
}

function candleVmFromScene(cd: SceneCandle) {
  return {
    key: cd.key,
    up: cd.up,
    last: cd.last,
    glow: cd.glow,
    style: {
      "--x": `${cd.x}%`,
      "--top": `${cd.top}%`,
      "--h": `${cd.h}%`,
      "--w": `${cd.w}%`,
      "--wleft-offset": `${cd.w / 2}%`,
    } as ChartVarStyle,
    wickStyle: {
      "--wx": `calc(${cd.wickX}% - 0.5px)`,
      "--wtop": `${cd.wickTop}%`,
      "--wh": `${cd.wickH}%`,
    } as ChartVarStyle,
  };
}

export function volumeBarsFromScene(
  bars: readonly VolumeSceneBar[],
): readonly VolumeBarVm[] {
  return bars.map((b) => {
    return {
      key: b.key,
      up: b.up,
      style: {
        "--x": `${b.x}%`,
        "--w": `${b.w}%`,
        "--h": `${b.h}%`,
      } as ChartVarStyle,
    };
  });
}
```

**Float caveat you must NOT "fix":** `--wleft-offset` was `cw * HALF_BODY_FRAC` and is now `cd.w / 2` where `w = cw * BODY_FRAC`. These are bit-identical (`0.64`'s double halved IS `0.32`'s double; `/2` and `*2` are exact), so the strings match. The equivalence pins in Step 7 prove it — if they ever disagree, the projection is wrong, not the pin.

- [ ] **Step 6: Thin out `chartVm.ts`.** It keeps: the `ChartVm`/`CandleVm`/`GridLineVm`/`PriceLabelVm`/`VolumeBarVm`/`TimeLabelVm` interfaces (unless Step 5's cycle note forced them into `chartScene.ts`), named re-exports of everything moved (`export { Y_TOP, Y_SPAN, formatTimeLabel } from "./chartScene.js"; export type { ChartCandle, ChartKind, ChartPoint, ChartScale, ChartVarStyle, ChartVmOptions } from "./chartScene.js";`), and:

```ts
export function chartVm(
  series: readonly ChartCandle[],
  liveRate: number,
  flashOn: boolean,
  opts?: ChartVmOptions,
): ChartVm {
  return chartVmFromScene(chartScene(series, liveRate, flashOn, opts));
}

export function volumeVm(
  series: readonly ChartCandle[],
  viewport?: ChartViewport,
): readonly VolumeBarVm[] {
  return volumeBarsFromScene(volumeScene(series, viewport));
}
```

`crosshairVm.ts` / `navigatorVm.ts` keep importing from `./chartVm.js` and compile unchanged (the re-exports cover them).

- [ ] **Step 7: Write the equivalence + neutrality tests.** `chartCssVars.test.ts`: for fixtures {empty series; single candle; 12 mixed candles with viewport `{start: 2.4, end: 9.6}`; kind `line`; kind `area`; liveRate above the last high; flashOn true} assert `chartVmFromScene(chartScene(f...))` deep-equals `chartVm(f...)` and `volumeBarsFromScene(volumeScene(...))` deep-equals `volumeVm(...)`. `chartScene.test.ts`: (a) runtime neutrality walker —

```ts
function assertSceneNeutral(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      return assertSceneNeutral(v, `${path}[${i}]`);
    });
    return;
  }

  if (typeof node === "string") {
    expect(node, `${path} leaks CSS syntax`).not.toMatch(/%|calc\(/);
    return;
  }

  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      expect(k.startsWith("--"), `${path}.${k} is a CSS var key`).toBe(false);
      assertSceneNeutral(v, `${path}.${k}`);
    }
  }
}
```

run over `chartScene(...)` and `volumeScene(...)` for the 12-candle fixture; (b) type-level check —

```ts
type CssVarKeys<T> = {
  [K in keyof T]: K extends `--${string}` ? K : never;
}[keyof T];
type AssertNever<T extends never> = T;
type _CandleClean = AssertNever<CssVarKeys<SceneCandle>>;
type _SceneClean = AssertNever<CssVarKeys<ChartScene>>;
```

- [ ] **Step 8: Export from `index.ts`** (explicit named block, mirroring the file's style): types `ChartScene`, `SceneCandle`, `SceneGridLine`, `SceneLabel`, `VolumeSceneBar` and values `chartScene`, `volumeScene` from `./chartScene.js`; `chartVmFromScene`, `volumeBarsFromScene` from `./chartCssVars.js`. Leave every existing export line byte-unchanged.

- [ ] **Step 9: Verify.**

Run: `pnpm --filter @rtc/motion-core test && pnpm --filter @rtc/motion-core build && pnpm typecheck`
Expected: all green — including the Step 1 pins, untouched.

- [ ] **Step 10: Commit.** `git commit -m "feat(motion-core): numeric ChartScene + CSS-var projection behind unchanged chartVm/volumeVm"`

---

### Task 2: crosshair + navigator scene splits

**Files:**
- Modify: `packages/motion-core/src/chartScene.ts` (+`CrosshairScene`, `NavigatorWindowScene`, `crosshairScene`, `navigatorWindowScene`), `packages/motion-core/src/chartCssVars.ts` (+`crosshairVmFromScene`, `navigatorWindowStyleFromScene`), `packages/motion-core/src/crosshairVm.ts`, `packages/motion-core/src/navigatorVm.ts`, `packages/motion-core/src/index.ts`
- Test: extend `chartScene.test.ts` / `chartCssVars.test.ts`; existing `crosshairVm.test.ts` / `navigatorVm.test.ts` pass untouched.

**Interfaces:**
- Consumes: Task 1's modules and the mechanical rule.
- Produces: `crosshairScene(xFrac, yFrac, series, viewport, scale): CrosshairScene | null` with `CrosshairScene {idx: number; x: number; y: number; price: string; readout: {time, open, high, low, close, volume: string}}`; `crosshairVmFromScene(scene: CrosshairScene | null): CrosshairVm | null` (adds `--chx`/`--chy`); `navigatorWindowScene(viewport, seriesLen): NavigatorWindowScene` with `{left: number; w: number}` (len 0 → `{left: 0, w: 100}`); `navigatorWindowStyleFromScene(win): ChartVarStyle`.

- [ ] **Step 1: Pin.** Check `crosshairVm.test.ts` asserts the exact `--chx`/`--chy` strings, `price`, and every readout field (incl. the `K`/`M` compact-volume arms), and `navigatorVm.test.ts` the `--nav-left`/`--nav-w` strings incl. the `seriesLen === 0` arm. Add any missing pin against the unsplit code; run `pnpm --filter @rtc/motion-core test -- crosshairVm navigatorVm`; commit as `test(motion-core): pin crosshair/navigator string outputs`.
- [ ] **Step 2: Split.** Move the body of `crosshairVm` into `crosshairScene` (numeric `x`/`y` instead of the style record; `compactVolume`/`clamp`/`bucketMsOf` move to `chartScene.ts`); `crosshairVmFromScene` builds `{idx, style: {"--chx": `${x}%`, "--chy": `${y}%`}, price, readout}` — `price`/`readout` pass through (preformatted label text, allowed by the neutrality rule; the walker's `%`-ban still holds since none contain `%`). `navigatorWindowScene` computes today's `leftPct`/`rightPct - leftPct` as numbers; the projection formats them. Reimplement the two public fns as projection∘scene. `navigatorLinePoints` and `navigatorVm`'s composition are untouched.
- [ ] **Step 3: Extend the equivalence + neutrality tests** with crosshair fixtures (center hit; xFrac 0 and 1 clamped ends; empty series → null passthrough) and navigator fixtures (normal window; len 0).
- [ ] **Step 4: Verify.** `pnpm --filter @rtc/motion-core test && pnpm build && pnpm typecheck` — all green; then both contract suites: `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract` (the strongest cheap proof of zero behavioral change).
- [ ] **Step 5: Commit.** `git commit -m "feat(motion-core): crosshair + navigator scene splits behind unchanged public vms"`

---

### Task 3: `drawChartScene` canvas engine (ui-contract)

**Files:**
- Create: `packages/ui-contract/src/visual/canvas/drawChartScene.ts`, `packages/ui-contract/src/visual/canvas/drawChartScene.test.ts`

**Interfaces:**
- Consumes: `ChartScene`, `SceneCandle` types + `chartScene` from `@rtc/motion-core` (already a ui-contract dependency).
- Produces (Task 4 relies on): `drawChartScene(ctx: CanvasRenderingContext2D, scene: ChartScene, palette: ChartPalette, size: {readonly w: number; readonly h: number}): void`; `ChartPalette {bodyUp, bodyDown, wick, grid: string}`; `SPIKE_PALETTE: ChartPalette`; `spikeScene(): ChartScene` (deterministic: built from the same seeded candle series the `equities-loaded` fixture provides — read `packages/ui-contract/src/visual/fixtures.ts` and reuse its equities series verbatim; `liveRate` = last close, `flashOn` false, default whole-series viewport).

- [ ] **Step 1: Write the recorder test first.** A fake ctx records calls:

```ts
interface RecordedCall {
  readonly op: string;
  readonly args: readonly (number | string)[];
}

function recorderCtx(): {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let fillStyle = "";
  const target = {
    set fillStyle(v: string) {
      fillStyle = v;
      calls.push({ op: "fillStyle", args: [v] });
    },
    get fillStyle() {
      return fillStyle;
    },
  } as Record<string, unknown>;
  for (const op of [
    "clearRect",
    "fillRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
  ]) {
    target[op] = (...args: number[]) => {
      calls.push({ op, args });
    };
  }
  target.strokeStyle = "";
  target.lineWidth = 0;
  return { ctx: target as unknown as CanvasRenderingContext2D, calls };
}
```

Assertions against a hand-built 2-candle scene (one up, one down; grid line at top 40) at `size {w: 100, h: 100}` (percent == px so expected coords are the scene numbers): grid stroke at y 40; wick fillRects at `x-0.5` width 1; body fillRects at `x - w/2` with the palette colors in up/down order; first call is `clearRect(0,0,100,100)`. Also one test that `spikeScene()` returns a non-empty candles array and is deep-equal across two calls (determinism).

- [ ] **Step 2: Run to verify it fails** (`pnpm --filter @rtc/ui-contract test -- drawChartScene` → module not found).
- [ ] **Step 3: Implement.**

```ts
export function drawChartScene(
  ctx: CanvasRenderingContext2D,
  scene: ChartScene,
  palette: ChartPalette,
  size: { readonly w: number; readonly h: number },
): void {
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;

  for (const line of scene.grid) {
    const y = (line.top / 100) * size.h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.w, y);
    ctx.stroke();
  }

  ctx.fillStyle = palette.wick;

  for (const cd of scene.candles) {
    ctx.fillRect(
      (cd.wickX / 100) * size.w - 0.5,
      (cd.wickTop / 100) * size.h,
      1,
      (cd.wickH / 100) * size.h,
    );
  }

  for (const cd of scene.candles) {
    ctx.fillStyle = cd.up ? palette.bodyUp : palette.bodyDown;
    const w = (cd.w / 100) * size.w;
    ctx.fillRect(
      (cd.x / 100) * size.w - w / 2,
      (cd.top / 100) * size.h,
      w,
      (cd.h / 100) * size.h,
    );
  }
}
```

Plus `SPIKE_PALETTE` (fixed hex literals — e.g. `{bodyUp: "#2ec4b6", bodyDown: "#e63946", wick: "#8d99ae", grid: "#2b2d42"}`) and `spikeScene()`. **No text drawing** — geometry only, per spec §5.

- [ ] **Step 4: Verify green** + `pnpm --filter @rtc/ui-contract build && pnpm lint:dead` (knip must not flag the new exports; Task 4's hosts are the consumers — if knip fires before Task 4 lands, note it and confirm it clears after Task 4 rather than adding an ignore).
- [ ] **Step 5: Commit.** `git commit -m "feat(ui-contract): framework-free drawChartScene canvas engine + recorder test"`

---

### Task 4: shared scenario + both hosts + arm64 goldens

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts`, `packages/client-react/tests/ui/visual/react/registry.tsx`, `packages/client-solid/tests/ui/visual/solid/registry.tsx`
- Create: `packages/client-react/tests/ui/visual/react/EquitiesChartCanvasSpike.visual.tsx`, `packages/client-solid/tests/ui/visual/solid/EquitiesChartCanvasSpike.visual.tsx`
- Goldens: 10 new files under `packages/ui-contract/goldens/playwright/__screenshots__/react-local/<arch>/visual.spec.ts/<theme>/equities-chart-canvas-spike.png`

**Interfaces:**
- Consumes: `drawChartScene`, `SPIKE_PALETTE`, `spikeScene` from Task 3 (import path per ui-contract's export map — check how the visual trees import `@ui-visual-shared/*` and use the same alias).
- Produces: scenario `"equities/chart-canvas-spike"`, componentKey `EquitiesChartCanvasSpike`.

- [ ] **Step 1: Add the scenario (fails first).** In `scenarios.ts` after the backfill-chip entries:

```ts
  // Canvas-spike (renderer-seam proof, spec 2026-08-02): the framework-free
  // drawChartScene engine rendering the numeric ChartScene onto a <canvas> —
  // the same scene drives both frameworks' hosts to one golden. Geometry
  // only (no text): font rasterization is the nondeterminism trap.
  "equities/chart-canvas-spike": {
    componentKey: "EquitiesChartCanvasSpike",
    fixtureKey: "equities-loaded",
  },
```

Run both registry-coverage gates and watch them fail on the unknown key:
`pnpm --filter @rtc/client-react test -- registryCoverage` and the solid twin.
Expected: FAIL — `scenario "equities/chart-canvas-spike" points at unknown componentKey`.

- [ ] **Step 2: React host.** Model file placement/naming on `EquitiesChartInteractive.visual.tsx` (same directory). Fixed CSS size so the golden is deterministic:

```tsx
export function EquitiesChartCanvasSpike(): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) {
      return;
    }

    drawChartScene(ctx, spikeScene(), SPIKE_PALETTE, {
      w: canvas.width,
      h: canvas.height,
    });
  }, []);

  return (
    <canvas
      ref={ref}
      width={640}
      height={360}
      style={undefined /* if the tree bans inline styles use a co-located .module.css for the fixed 640×360 box */}
      data-testid="chart-canvas-spike"
    />
  );
}
```

Register in `registry.tsx` exactly like `EquitiesChartLoadingOlder` (import + `EquitiesChartCanvasSpike: () => { return <EquitiesChartCanvasSpike />; }`). **Readiness:** read `VisualScenario.tsx` and match the harness's readiness convention so the screenshot cannot race the `useEffect` draw (the known first-mount-race trap from the scenario-add recipe). If the harness signals readiness synchronously on mount, gate it: keep a `drawn` state flipped after the draw and only render the readiness marker when set.

- [ ] **Step 3: Solid host.** Same shape with Solid idioms (`onMount`, plain ref variable), registered in the solid registry. This is the only Solid change in the PR — test tree, not `src/`.

- [ ] **Step 4: Registry gates + unit tiers green.** Re-run both registryCoverage tests (now PASS), then `pnpm --filter @rtc/client-react test:ui:contract && pnpm --filter @rtc/client-solid test:ui:contract`.

- [ ] **Step 5: Generate the arm64 goldens.** From the worktree (install + build first if not already — the worktree-visual-run recipe):
`pnpm --filter @rtc/client-react run test:ui:visual:playwright:react:update -g "chart-canvas-spike"`
(Package script, never direct `playwright` exec — the webServer resolution breaks otherwise.) Expect exactly 10 new files (×10 themes), additions-only under `react-local/`. Run the non-update tier twice more with `-g "chart-canvas-spike"` to confirm stability (3 consecutive passes). Commit ONLY the 10 new stems.

- [ ] **Step 6: Commit.** `git commit -m "test(visual): chart-canvas-spike scenario — one scene, two framework hosts, one golden"`

---

### Task 5: docs — the corrected claims

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (chart section — locate the equities-chart subsection added by the interactivity/backfill workstreams), `docs/STATUS.md`

**Interfaces:** none produced; consumes the spec's §1/§7 language.

- [ ] **Step 1: Architecture subsection.** Add under the chart section (adjust the heading level to match siblings):

```markdown
### The renderer seam (`ChartScene` → substrate)

Every chart vm computes a pure-numeric scene first — `chartScene` /
`volumeScene` / `crosshairScene` / `navigatorWindowScene` in
`@rtc/motion-core` — and the CSS-custom-property records the DOM shells
consume (`chartVm` et al.) are a *projection* of that scene
(`chartCssVars.ts`), applied at the edge. The scene is the renderer
contract: percent (0–100) plot-box coordinates, `number`/`boolean`/label-
text fields only, no CSS syntax (a neutrality walker and a type-level
check in motion-core enforce this). `drawChartScene`
(`@rtc/ui-contract`) proves the seam: a framework-free Canvas-2D engine
renders the same scene both clients' DOM shells consume, pinned by the
`equities/chart-canvas-spike` golden driven by hosts in both clients'
visual trees.

**What "prerequisite for the TradingView tier" means.** The TradingView
tier (drawing tools, indicator panes, thousands of bars) is achievable on
DOM/SVG at modest scale — but its features must be built against
`ChartScene`, never against DOM shapes, so the substrate stays swappable.
Retained-mode costs scale with node count (three DOM nodes per candle
today) while canvas scales with pixels drawn; under this repo's
performance doctrine the combination of deep history × indicator panes ×
per-mousemove crosshair × permanent ambient animation eventually exceeds
what retained DOM affords. Canvas is the escape hatch to pull when
node-count costs actually bite — not a precondition for starting the
tier. See
[the renderer-seam spec](../superpowers/specs/2026-08-02-pluggable-chart-renderer-design.md).
```

- [ ] **Step 2: STATUS.md.** Delete the "Pluggable chart renderer exploration" bullet; add in `## ⚪ Optional / next step`:

```markdown
- **Canvas chart renderer productionization + TradingView tier** — the seam is formalized and proven (numeric `ChartScene` + `chartCssVars` projection in motion-core; `drawChartScene` spike golden): [spec](superpowers/specs/2026-08-02-pluggable-chart-renderer-design.md). TradingView-tier features (drawing tools, indicator panes, log scale, comparison series) are achievable on DOM/SVG at modest scale but MUST be built against `ChartScene`, never DOM shapes; a production canvas renderer (palette port, text rendering, hit-testing model) is the escape hatch when node-count costs bite, not the entry ticket. See `docs/architecture/17-web-client-up-close.md` §"The renderer seam".
```

Bump the `**Last updated:**` line to today.

- [ ] **Step 3: Verify + commit.** `pnpm check:doc-links` green (anchor slugs verified). `git commit -m "docs: renderer seam — corrected neutrality + TradingView-prerequisite claims"`

---

## Self-review notes (already applied)

- Spec §3/§4/§6 map to Tasks 1–2; §5 to Tasks 3–4; §7 to Task 5; §8/§9 are the PR/constraint envelope.
- Type names consistent across tasks (`ChartScene`, `SceneCandle`, `VolumeSceneBar`, `CrosshairScene`, `NavigatorWindowScene`, `ChartPalette`, `spikeScene`, `SPIKE_PALETTE`).
- The one open mechanical judgment left to implementers is flagged inline where it occurs (Step 5 of Task 1: type-only import vs. moving the projected interfaces; both endpoints specified).
