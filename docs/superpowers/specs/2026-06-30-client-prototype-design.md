# `@rtc/client-prototype` — Readable Port of the v2 Design Prototype

**Date:** 2026-06-30
**Status:** Design — awaiting approval
**Author:** Claude (brainstormed with @nasantsogt)

## 1. Purpose

`docs/design/v2` contains a beautiful, high-fidelity design prototype of the Reactive
Trader HUD redesign, but it is effectively unreadable: a single `class Component`
(~700 lines) plus a 724-line inline-styled HTML template, rendered by a bespoke
runtime (`support.js`, "dc-runtime"). This makes it hard to understand *how the design
works*.

This project creates a new monorepo package, **`packages/client-prototype`
(`@rtc/client-prototype`)**, that reproduces the **same v2 prototype** — same look,
motion, layout, and behavior — but as **readable, modular, fully tooling-compliant
code**: split into per-feature folders of small components, co-located mock hooks, and
CSS Modules.

It is a **design-reference artifact**, not a production client. Its value is
comprehension: a developer should be able to read one folder at a time and understand
how each piece of the prototype works.

### What the v2 prototype actually is (for context)

- **Two source files** in `docs/design/v2/dev-handoff/prototype/source/`:
  - `Reactive Trader.dc.html` — a `<x-dc>` HTML template (all inline styles) + one
    `class Component extends DCLogic` holding all state, logic, and mock data.
  - `support.js` — a generated custom runtime ("dc-runtime") that compiles the
    template's `{{ expr }}` / `<sc-if>` / `<sc-for>` / `<helmet>` into
    `React.createElement` builders and drives the class like a `React.Component`.
- **Libraries used by the prototype:** React + ReactDOM (as `window` globals), the
  native **Web Animations API** (FLIP glides), native **Canvas 2D** (boot sequence),
  Google Fonts. No RxJS, styled-components, dockview, or state library.
- **Feature areas (8):** FX (live tiles + exec + RFQ-on-tile + blotter), Credit
  (new-RFQ + streaming quotes + blotter), Equities (watchlist + candle chart + tabs +
  order ticket + blotter), Admin (observability dashboard), boot sequence, 5×2 theme
  system, status bar, preferences + lock screen.

Because dc-runtime *is* React underneath, this is a structural translation into
idiomatic React, not a behavioral rewrite.

## 2. Goals & Non-Goals

### Goals
- **Full faithful port** of all 8 feature areas — behaves like the standalone HTML.
- **Readable**: one 700-line class → many small, single-purpose modules/components.
- **Full CSS Modules** — zero inline `style={{}}`, matching the repo's completed
  CSS-modules migration (static class / semantic `data-*` state / `--custom-property`
  geometry). Passes the same lint gate as `client-react`.
- **Comprehension-first, self-contained** internals: per-feature folders with dumb
  components + co-located mock hooks + seed data. No production indirection.
- **Tooling-compliant**: rides the repo's existing tooling — Vite, TypeScript (strict),
  Vitest, Biome, ESLint (flat, incl. the inline-style ban), stylelint, `#/` subpath
  imports. Auto-joins pnpm-workspace + Turborepo.

### Non-Goals
- **No `@rtc/domain` / `@rtc/shared` dependency.** Mock data lives in the package.
- **No production architecture** — no RxJS machines, no app-layer ports, no `ViewModel`
  DI seam. (That indirection would make the prototype *harder* to follow, which defeats
  the purpose.)
- **No visual-golden / UI-contract / e2e test tiers.** Those are the real client's
  framework-portability contract; they would be noise here.
- **No replacement of `docs/design/v2`.** The standalone HTML stays as the canonical
  visual reference; this package is the readable companion.

## 3. Architecture

### 3.1 Stack
React 19 + Vite (app build + dev server) + TypeScript strict. Native Web Animations API
for FLIP motion and native Canvas 2D for the boot sequence — **no new runtime
dependencies** (the repo's `motion` lib is available but native keeps the port 1:1 with
the prototype). State is plain React hooks + context; no global store.

### 3.2 Directory layout

```
packages/client-prototype/
  package.json                  # @rtc/client-prototype, mirrors client-react scripts/config
  index.html                    # Vite entry
  vite.config.ts  tsconfig*.json  vitest.config.ts  eslint/biome/stylelint wiring
  src/
    main.tsx                    # ReactDOM root
    App.tsx                     # boot-gate → Shell → active tab
    theme/
      tokens.ts                 # 5 skins × dark/light, typed as ThemeTokens
      ThemeProvider.tsx         # applies tokens as --vars on root; skin/mode context
      useTheme.ts
    motion/
      useFlip.ts                # measure→invert→play FLIP glide (WAAPI)
      flash.ts                  # row-insert flash / accept pulse helpers
    mock/
      types.ts                  # typed shapes: Rate, Rfq, Trade, Candle, Metric, ...
      rng.ts                    # random-walk / series helpers
      useClock.ts               # tick + now timers as hooks
    styles/
      global.css                # keyframes + scrollbar + reset (the <helmet> block)
    shell/
      Header/                   # Header + Nav, ThemePicker, Notifications,
                                #   AccountMenu, LangMenu, ModeToggle, EnvBadge
      StatusBar/                # latency, FPS, connection, session, clock, build
      Preferences/              # settings modal (animated-bg toggle is "real")
      LockScreen/               # sign-out → lock overlay → re-auth
      Boot/                     # BootSequence + globeBoot/laserBoot/dockingBoot
                                #   draw fns + useBootSequence (rAF loop)
      layout/                   # SplitPane, Panel, maximize/collapse (hand-rolled dock)
    fx/
      LiveRates/ (RateTile, ExecOverlay, RfqOnTile)
      Blotter/   (TradesBlotter + sort/filter/export)
      useFxRates.ts  useFxBlotter.ts  fxData.ts
    credit/
      NewRfqForm  QuoteList  RfqCard  CreditBlotter
      useCredit.ts  creditData.ts
    equities/
      Watchlist  CandleChart  InstrumentTabs  OrderTicket  OrdersBlotter
      useEquities.ts  eqData.ts
    admin/
      MetricChart  {Throughput,Latency,ErrorRate,Sessions}Card  EventLog
      useMetrics.ts
  tests/                        # light Vitest smoke layer
```

Each feature folder is the unit of comprehension: **dumb components + one co-located
mock hook (its "stream") + seed data + co-located `*.module.css`**.

### 3.3 State strategy
The prototype's single `this.state` blob splits along feature lines. Each feature owns a
hook that reproduces the *faithful* mock behavior:
- `useFxRates` — the `setInterval` rate walk, dir flags, flash, tiles, exec state.
- `useFxBlotter` — sort/filter/query/export over seeded + new trades.
- `useCredit` — new-RFQ submit, staggered dealer-quote timers, accept/expire, blotter.
- `useEquities` — candle generation per timeframe, watchlist sort, order ticket.
- `useMetrics` — rolling throughput/latency/error/session series + event log.

Only genuinely shared state lifts to `App`: active tab, theme skin + mode, preferences,
boot status. Cross-cutting timers (`tick`, `now`, expiry checks) live in `mock/useClock`
and feature hooks subscribe.

### 3.4 Theming
`tokens.ts` holds `themes` (dark) and `themesLight` as a typed `Record<Skin,
ThemeTokens>`. `ThemeProvider` writes the active set as `--var`s on a root element
(exactly as the prototype does) and exposes `{ skin, mode, setSkin, toggleMode }` via
context. CSS Modules read `var(--accent)`, `var(--panel)`, etc. Skin, mode, and boot
variant persist to `localStorage` like the original.

### 3.5 Motion & boot
- **FLIP**: `useFlip(selector, key)` snapshots positions before a reorder, then plays an
  inverted WAAPI animation after — used by Live Rates (filter), watchlists (re-rank),
  RFQ cards (reorder). Honors `prefers-reduced-motion` and the Preferences
  `reduceMotion` toggle.
- **Boot**: the three canvas draw functions (`globeBoot`, `laserBoot`, `dockingBoot`)
  become pure functions driven by a `requestAnimationFrame` loop inside
  `useBootSequence`, which also persists the sequential variant choice and exposes a
  SKIP control + cross-fade to the app.

### 3.6 Motion/feedback principle (preserved)
The app is calm until something happens: ambient motion minimal, animated background
**off by default**, and flashes/pulses fire only on mock "events" (price ticks, fills,
expiries) — driven from the mock hooks, mirroring the prototype's intent.

## 4. Tooling & Compliance

The package mirrors `client-react`'s configuration so it passes the **same gates**:

| Gate | Requirement |
|---|---|
| `pnpm --filter @rtc/client-prototype build` | Vite build succeeds |
| `typecheck` | `tsc --noEmit` strict, clean |
| Biome | format + lint clean (preset `recommended`, no disables policy) |
| ESLint (flat) | clean, incl. `no-restricted-syntax` inline-style ban → **zero** `style={{}}` |
| stylelint | clean over all `*.module.css` |
| `#/` imports | subpath alias configured in `package.json` `imports` + tsconfig `paths` |

Runtime-dynamic styling (theme tokens, FLIP geometry, live buy/sell colors) uses the
repo-sanctioned escape hatch — `--custom-property` set inline with a scoped
`eslint-disable`, exactly as `client-react` handles its ~7 runtime cases — not arbitrary
inline styles.

The package auto-joins `pnpm-workspace.yaml` (`packages/*`) and Turborepo's
framework-blind `build` / `typecheck` / `test` / `lint` tasks.

## 5. Testing

**Smoke-only** Vitest layer (jsdom), guarding behavior at a high level:
- App mounts and reaches the post-boot shell (boot can be skipped/forced in test).
- Theme skin switch + dark/light mode toggle apply the expected `--var`s.
- Tab switch renders the correct feature panel.
- One FX tick updates a rate / sets a direction flag.

Explicitly **out of scope**: visual goldens (dual-set), UI-contract tier, e2e/Cypress.
The jsdom localStorage shim already used by `client-react` tests applies here too.

## 6. Build Order (phased; each phase is runnable and green)

Full port is large, so it ships in reviewable phases. After each phase the app runs and
all compliance gates pass.

| Phase | Deliverable |
|---|---|
| **P0 — Scaffold** | Package + all config (Vite/TS/Vitest/Biome/ESLint/stylelint/`#/`), `App` shell, `ThemeProvider`, `global.css`, boot sequence. Runnable themed shell with working theme/mode switch. |
| **P1 — Shell chrome** | Header (nav, theme picker, notifications, account, language, mode, env badge), StatusBar, Preferences modal, LockScreen, and the hand-rolled dock layout (SplitPane / maximize / collapse). |
| **P2 — FX** | Live Rates tiles (editable notional, exec overlay, RFQ-on-tile), Trades blotter (sort/filter/export), FLIP glide + flashes. (Largest feature.) |
| **P3 — Credit** | New-RFQ form, streaming dealer quotes, accept/expire, credit blotter. |
| **P4 — Equities** | Watchlist, candlestick chart, instrument tabs, order ticket, orders/positions blotter. |
| **P5 — Admin** | Observability dashboard: throughput / latency / error-rate / sessions charts + event log. |
| **P6 — Parity pass** | Side-by-side review vs the standalone HTML; close visual/behavior gaps; final compliance sweep. |

Each phase is isolated on its own branch/worktree, proven green on CI, and merged as a
merge commit per the repo's shipping rules.

## 7. Risks & Mitigations

- **Inline-style → CSS Modules volume** is the dominant cost. Mitigation: the
  static/`data-*`/`--prop` taxonomy is already proven in `client-react`; apply it
  mechanically per component.
- **FLIP / canvas fidelity** can drift from the original. Mitigation: port the math
  verbatim into pure functions; the P6 parity pass is a dedicated gate.
- **Scope creep toward production architecture.** Mitigation: the Non-Goals are
  explicit — mock hooks stay co-located; no ports/machines/domain deps.
- **Mock RNG nondeterminism** could make smoke tests flaky. Mitigation: feature hooks
  accept a seedable RNG so tests can pin values; default keeps the prototype's lively
  feel.

## 8. Open Questions

None blocking. Phasing granularity (§6) may be adjusted during planning if any phase is
too large for a single implementation plan.
