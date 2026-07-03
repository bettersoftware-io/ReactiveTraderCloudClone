# HUD Redesign — Shared Interface Contracts

> **Reference for all 7 phase plans.** Every plan's "Interfaces" blocks cite the exact names/signatures pinned here, so types never drift across phases. This is not itself a plan — it defines the seams the plans build and consume. Source spec: [`../specs/2026-06-26-hud-redesign-design.md`](../specs/2026-06-26-hud-redesign-design.md).

## Conventions (verbatim from recon)

- **Import alias:** `#/*` → `./src/*`, `#tests/*` → `./tests/*` (client-react). At most one `../` up; deeper uses `#/` (Biome `noRestrictedImports` bans `../../**`).
- **Domain purity:** `@rtc/domain` imports only `rxjs` at runtime; no Node built-ins in production source (dependency-cruiser `domain-no-node-builtins`, `domain-stays-pure`).
- **Ports return `Observable<T>`** (even synchronous reads use `of(value)`; mutations return `Observable<void>`).
- **Simulators** are `class X implements XPort`, BehaviorSubject- or `defer/timer/interval`-based, deterministic under `vi.useFakeTimers()`, optional constructor `seed`.
- **Machines** return `Machine<TState, TIntents>` = `{ state$: StateObservable<TState>; intents: TIntents; dispose(): void }` from `#/app/presenters/machine`; keep a warm `state$.subscribe()` released in `dispose()`; `state(stream$, default)` gives a synchronous default. Read-only = `ReadOnlyMachine<T>` = `Machine<T, Record<string, never>>`.
- **Dumb UI** consumes presenters/machines ONLY via `useHooks()` (destructured); no rxjs/localStorage/fetch/setTimeout in `src/ui` (grep-gates 26–29); styling via CSS Modules + semantic `data-*` + `var(--token)`; only inline style permitted is a computed `--custom-property` geometry value.

---

## 1. Theme axis types — `packages/domain/src/preferences/preferences.ts` (Phase 0)

Current `Theme = "dark" | "light"` is **renamed** to `ThemeMode`; a new `ThemeSkin` axis is added. `Theme` is kept as a deprecated alias of `ThemeMode` for one transition step, then removed.

```typescript
export type ThemeMode = "dark" | "light";
export type ThemeSkin = "classic" | "holo" | "terminal" | "neon";

export const DEFAULT_THEME_MODE: ThemeMode = "dark";
export const DEFAULT_THEME_SKIN: ThemeSkin = "holo"; // showcase default; "classic" preserves the pre-redesign look

export const THEME_SKINS: readonly ThemeSkin[] = ["classic", "holo", "terminal", "neon"];
export const THEME_MODES: readonly ThemeMode[] = ["dark", "light"];
```

## 2. `PreferencesPort` additions — `packages/domain/src/ports/preferencesPort.ts` (Phase 0)

Existing `theme$()/setTheme()` (now typed `ThemeMode`) and `viewMode$()/setViewMode()` are unchanged in shape. Add the skin axis:

```typescript
export interface PreferencesPort {
  themeMode$(): Observable<ThemeMode>;          // renamed from theme$()
  setThemeMode(mode: ThemeMode): void;          // renamed from setTheme()
  themeSkin$(): Observable<ThemeSkin>;          // NEW
  setThemeSkin(skin: ThemeSkin): void;          // NEW
  viewMode$(): Observable<ViewMode>;            // unchanged
  setViewMode(viewMode: ViewMode): void;        // unchanged
  animatedBackground$(): Observable<boolean>;   // NEW (perf toggle; default false)
  setAnimatedBackground(on: boolean): void;     // NEW
}
```

Storage keys (`LocalStoragePreferencesAdapter`): keep `"rtc-theme"` → mode (back-compat); add `"rtc-theme-skin"`, `"rtc-animated-bg"`. `PreferencesSimulator` `PreferencesSeed` gains `themeSkin?`, `animatedBackground?`.

## 3. Extended `ThemeTokens` — `packages/client-react/src/ui/shell/theme/tokens.ts` (Phase 0)

The 22-key interface grows with the prototype's semantic tokens. Full extended interface:

```typescript
export interface ThemeTokens {
  // — existing 22 keys retained verbatim —
  "--bg-primary": string; "--bg-secondary": string; "--bg-header": string;
  "--bg-footer": string; "--bg-tile": string; "--bg-overlay": string;
  "--bg-brand-primary": string;
  "--text-primary": string; "--text-secondary": string; "--text-muted": string;
  "--text-on-accent": string;
  "--accent-positive": string; "--accent-negative": string;
  "--accent-aware": string; "--accent-primary": string;
  "--border-primary": string; "--border-subtle": string;
  "--status-connected": string; "--status-connecting": string;
  "--status-disconnected": string; "--status-error": string;
  // — NEW (prototype semantics) —
  "--accent-2": string;          // secondary accent (holo teal / neon cyan)
  "--border-strong": string;     // hover/active border
  "--panel": string;             // panel fill (translucent in holo/neon, solid in terminal/classic)
  "--panel-head": string;        // panel header fill
  "--panel-blur": string;        // backdrop-filter blur radius, e.g. "14px" or "0"
  "--glow": string;              // box-shadow glow, or "none"
  "--grid": string;              // grid-line colour
  "--chip": string;              // chip/control fill
  "--aurora-a": string;          // aurora blob A colour
  "--aurora-b": string;          // aurora blob B colour
  "--aurora-opacity": string;    // "0".."1"
  "--font-display": string;      // e.g. "'Chakra Petch',sans-serif"
  "--font-mono": string;         // e.g. "'JetBrains Mono',monospace"
}
```

Token store shape: `export const themeTokens: Record<ThemeSkin, Record<ThemeMode, ThemeTokens>>`. `ThemeProvider` applies `themeTokens[skin][mode]` and sets `document.documentElement.dataset.skin` + `.dataset.mode`. Holo/terminal/neon dark values come from `docs/design/v1/dev-handoff/theme-tokens.css`; light variants derived; `classic` = today's `darkTokens`/`lightTokens` plus neutral values for the new keys (`--panel-blur: "0"`, `--glow: "none"`, etc.).

## 4. Animation seam — `packages/client-react/src/app/presenters/AnimationDirector.ts` (Phase 0)

```typescript
export type AnimationKind =
  | "tickUp" | "tickDown"      // price digit flash
  | "fill" | "reject"          // execution outcome
  | "expiry"                   // RFQ/quote expiry pulse
  | "newRow"                   // blotter row-in
  | "connectionChange";        // banner pulse

export interface AnimationIntent {
  readonly target: string;     // stable key, e.g. `tile:EURUSD`, `row:<tradeId>`
  readonly kind: AnimationKind;
}

export class AnimationDirector {
  constructor(deps: AnimationDirectorDeps);     // injected domain streams; NO DOM access
  intentsFor(target: string): Observable<AnimationIntent>;   // filtered, shareReplay(1)
}
```

UI hook: `useAnimationIntents(target: string): AnimationIntent | null` (added to `AppHooks` via `bind`), mapped by dumb components to a `data-anim` attribute that drives CSS keyframes. The Motion One wrapper lives at `#/ui/shell/motion/` and is the ONLY animation dependency import site.

## 5. Layout seam — app layer (Phase 1)

**Placement refinement:** `LayoutPort` lives in `packages/client-react/src/app/layout/` (NOT `domain/`), because layout is presentation infrastructure, not business domain, and `@rtc/domain` is rxjs-only/business-pure.

```typescript
// #/app/layout/layoutPort.ts
export type PanelId = string;
export interface PanelSpec { readonly id: PanelId; readonly title: string; readonly pinned?: boolean; }
export type SplitDir = "row" | "column";
export type LayoutNode =
  | { readonly kind: "split"; readonly dir: SplitDir; readonly children: readonly LayoutNode[]; readonly sizes: readonly number[]; readonly fixedPx?: readonly (number | undefined)[]; }
  | { readonly kind: "panel"; readonly panelId: PanelId; };
// fixedPx (added Task 8, v2-fidelity-data-fx-chrome): per-child fixed size in css px along `dir`.
// A set entry overrides the fractional size, renders flex:0 0 Npx, and suppresses adjacent resize
// handles (like pinned). Additive — existing consumers with no fixedPx are unaffected.
export interface LayoutState {
  readonly root: LayoutNode;
  readonly maximized: PanelId | null;
  readonly collapsed: readonly PanelId[];
}
export interface LayoutPort {                 // the replaceable plugin interface
  readonly initial: LayoutState;
}

// #/app/presenters/LayoutMachine.ts
export interface LayoutIntents {
  maximize(id: PanelId): void;
  restore(): void;
  collapse(id: PanelId): void;
  expand(id: PanelId): void;
  resize(path: readonly number[], sizes: readonly number[]): void;
}
export function createLayoutMachine(port: LayoutPort): Machine<LayoutState, LayoutIntents>;
```

Engine: `#/ui/shell/layout/engine/InhouseLayoutEngine.tsx` renders `LayoutState` + wires resize handles; a future `DockviewLayoutEngine.tsx` satisfies the same consumption contract. The app references panels by `PanelId`; a `PanelRegistry` (`Record<PanelId, () => ReactElement>`) maps ids to module roots.

## 6. Equities domain (Phase 4)

```typescript
// packages/domain/src/equities/*.ts
export interface EquityInstrument { readonly symbol: string; readonly name: string; readonly exchange: string; }
export interface EquityQuote { readonly symbol: string; readonly bid: number; readonly ask: number; readonly last: number; readonly changePct: number; readonly timestamp: number; }
export interface Candle { readonly time: number; readonly open: number; readonly high: number; readonly low: number; readonly close: number; }
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "new" | "working" | "partiallyFilled" | "filled" | "cancelled" | "rejected";
export interface EquityOrder { readonly id: string; readonly symbol: string; readonly side: OrderSide; readonly type: OrderType; readonly qty: number; readonly limitPrice?: number; readonly status: OrderStatus; readonly filledQty: number; readonly avgPrice?: number; readonly createdAt: number; }
export interface EquityPosition { readonly symbol: string; readonly qty: number; readonly avgPrice: number; readonly markPrice: number; readonly unrealisedPnl: number; }
export interface DepthLevel { readonly price: number; readonly size: number; }
export interface DepthBook { readonly symbol: string; readonly bids: readonly DepthLevel[]; readonly asks: readonly DepthLevel[]; }

// packages/domain/src/ports/*.ts
export interface MarketDataPort {
  watchlist(): Observable<readonly EquityInstrument[]>;
  quotes(symbol: string): Observable<EquityQuote>;
  candles(symbol: string): Observable<readonly Candle[]>;
  depth(symbol: string): Observable<DepthBook>;
}
export interface OrderPort {
  place(req: { symbol: string; side: OrderSide; type: OrderType; qty: number; limitPrice?: number }): Observable<EquityOrder>; // emits lifecycle updates
  cancel(orderId: string): Observable<void>;
  orders(): Observable<readonly EquityOrder[]>;
}
export interface PositionPort { positions(): Observable<readonly EquityPosition[]>; }
```

Simulators: `EquityMarketDataSimulator` (GBM walk → quotes + OHLC aggregation + synthetic depth), `EquityOrderSimulator` (`new→working→partiallyFilled→filled`, seedable latency), `EquityPositionSimulator` (derives P&L from fills × marks). Each gets a `*PortContract.ts` + `*Simulator.contract.test.ts`; deterministic helpers (e.g. GBM step) get `*.golden.test.ts`.

## 7. Admin telemetry domain (Phase 5)

Existing `AdminPort`/`ThroughputSimulator` are retained. Add:

```typescript
// packages/domain/src/telemetry/*.ts
export interface MetricSample { readonly t: number; readonly value: number; }
export type ServiceName = "pricing" | "execution" | "blotter" | "analytics" | "credit" | "refdata" | "kernel";
export type ServiceStatus = "ok" | "degraded" | "down";
export interface ServiceNode { readonly name: ServiceName; readonly status: ServiceStatus; readonly throughput: number; readonly latencyMs: number; }
export interface ServiceEdge { readonly from: ServiceName; readonly to: ServiceName; readonly latencyMs: number; }
export interface ServiceTopology { readonly nodes: readonly ServiceNode[]; readonly edges: readonly ServiceEdge[]; }
export type Severity = "info" | "warn" | "error";
export interface LogEvent { readonly t: number; readonly severity: Severity; readonly service: ServiceName; readonly message: string; }
export interface SessionInfo { readonly id: string; readonly user: string; readonly region: string; readonly lat: number; readonly lon: number; }

// packages/domain/src/ports/*.ts
export interface TelemetryPort {
  throughput$(): Observable<MetricSample>;
  latency$(): Observable<MetricSample>;
  errorRate$(): Observable<MetricSample>;
}
export interface ServiceHealthPort { topology$(): Observable<ServiceTopology>; }
export interface EventLogPort { events$(): Observable<LogEvent>; }
export interface SessionsPort { sessions$(): Observable<readonly SessionInfo[]>; }

// Incident injection (drives the live demo). App-layer machine, not a domain port.
// #/app/presenters/IncidentMachine.ts
export type IncidentKind = "latencySpike" | "errorBurst" | "serviceDown";
export interface IncidentIntents { inject(kind: IncidentKind): void; clear(): void; }
export interface IncidentState { readonly active: readonly IncidentKind[]; }
export function createIncidentMachine(deps: IncidentDeps): Machine<IncidentState, IncidentIntents>;
```

The incident machine pushes into the simulators' control inputs so telemetry, topology, AND the existing connection banners react together (incidents route through the existing `connectionEvents` port).

---

## Cross-plan global constraints (every task implicitly includes)

- **Per-task gate gauntlet (run before each commit):** `pnpm check` (Biome) · `pnpm lint:eslint` · `pnpm lint:css` · `pnpm check:versions` · `pnpm typecheck` (all packages incl. server) · `pnpm test` · `pnpm build` · `pnpm lint:dead` (knip) · `pnpm check:deps` (dependency-cruiser) · `pnpm lint:eslint:types` (after build) · `pnpm --filter @rtc/tests gates`. Biome-clean ≠ CI-clean — ESLint/stylelint/gates are mandatory.
- **Dep additions** (Motion One = npm package `motion`; Solid bindings later `solid-motionone`): `pnpm outdated -r` first, respect the 1440-min (`minimumReleaseAge`) cooldown, single syncpack range, `pnpm add --filter @rtc/client-react motion`, then `pnpm install --frozen-lockfile`.
- **Dumb-UI grep-gates 26–29** bind all `src/ui` code: no `rxjs`/`@react-rxjs`/`@rx-state`, no `localStorage`, no `fetch`/`import.meta.env`, no `setTimeout`/`setInterval` (only `src/ui/hooks/` is exempt).
- **CSS:** stylelint `declaration-strict-value` forces `color/fill/stroke` to use `var(--token)`; class names camelCase, custom props kebab-case.
- **Visual goldens (dual set):** regenerate `react-local/<arch>/` locally via the three `:update` scripts; the CI `react/` (x86) set is regenerated by the GitHub Actions workflow at PR time.
- **Commit trailers:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01W4dY5QY4R8xDt7BPCudyTB`.
- **Branch/merge:** all work on `worktree-hud-redesign`; single `git merge --no-ff` to `main` only after spec + all 7 plans are written (implementation follows after merge).
