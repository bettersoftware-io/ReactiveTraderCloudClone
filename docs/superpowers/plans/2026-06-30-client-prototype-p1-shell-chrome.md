# `@rtc/client-prototype` P1 — Shell Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v2 prototype's global shell chrome (Header + menus, StatusBar, Preferences modal, LockScreen, ambient background) into `@rtc/client-prototype` as readable, CSS-Modules, fully-tooling-compliant React — with placeholder tab bodies and no dock layout.

**Architecture:** Plain React hooks + two contexts (P0's `ThemeProvider`, new `PreferencesProvider`). `AppShell` hosts `AmbientBackground` + `Header` + placeholder body + `StatusBar`, and overlays `LockScreen` / `PreferencesModal`. Leaf components built bottom-up; `App`/`AppShell` integration is the capstone. Faithful translation of the single `class Component` — no machines, ports, or domain deps.

**Tech Stack:** React 19, Vite 8, TypeScript 6 (strict), Vitest 4 (jsdom), Biome 2.5, ESLint flat (incl. inline-style ban), stylelint. `#/` subpath imports.

**Spec:** `docs/superpowers/specs/2026-06-30-client-prototype-p1-shell-chrome.md`
**Parent spec:** `docs/superpowers/specs/2026-06-30-client-prototype-design.md`

## Source of truth for verbatim markup/styles

The prototype is **`docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html`**
(referred to below as **PROTO**). Each task cites the exact PROTO line ranges that hold
the verbatim markup + inline styles to reproduce. **Read those lines directly** — they are
the authoritative visual spec; do not invent styling. Convert each inline `style="…"` to a
co-located `*.module.css` class per the rules below.

### CSS-Modules conversion rules (apply to every component — from the completed client-react migration)

1. **Static styling → a `.module.css` class.** No `style={{}}` (ESLint `no-restricted-syntax`
   bans it; the `client-prototype/src/**/*.tsx` glob is already active).
2. **Boolean/enum UI state → `data-*` attribute + CSS attribute selector.** The prototype's
   `class="rtSw" data-on="{{ … }}"` is exactly this pattern — keep `data-on` /
   `data-active` and select with `.sw[data-on="true"]`.
3. **Runtime geometry/color that can't be a static class → a `--custom-property` set inline
   with a scoped `// eslint-disable-next-line no-restricted-syntax`** (the only sanctioned
   inline case). For P1 this is needed only for the theme-swatch colors (per-skin
   `accent`/`accent2`) in `ThemePicker` and the notification tag color — set e.g.
   `style={{ "--sw-color": skinAccent } as CSSProperties}`.
4. **Colors/tokens** come from the themed `--var`s already on `:root` (`var(--accent)`,
   `var(--border)`, …). stylelint forbids raw color literals in `.module.css` — use the vars.
5. **camelCase class names** (stylelint `selector-class-pattern`); **kebab custom props**
   (`--amb-play`, `--sw-color`).
6. Components return `ReactElement` (not `JSX.Element`); functions are `function`
   declarations with explicit return types (Biome `useExplicitType`); props via a named
   `interface`.

## Global Constraints

- **No `@rtc/domain` / `@rtc/shared` / RxJS / machines / ViewModel seam.** Self-contained.
- **Zero `style={{}}`** except the rule-3 `--custom-property` escape hatch with scoped disable.
- **Prefs are session state — NOT persisted** (faithful: PROTO persists only `rt_bootSeq`).
  Do not add `localStorage` for prefs or language.
- **Only `animatedBg` (gated by `reduceMotion`) drives rendering**, via `--amb-play`
  (`running` when `animatedBg && !reduceMotion`, else `paused`). All other ~22 prefs are
  working controls bound to state with **no** render effect (document this in
  `PreferencesModal`'s top doc-comment).
- **Faithful values** (copy verbatim from PROTO): user = `Anthony Stark / AS / Senior FX
  Trader / a.stark@reactivetrader.io / G10 Spot · London / TRD-0042`; languages =
  `EN, 中文, 日本, DE, FR, ES`; theme display names = `holo→"Holo HUD", holo3d→"Holo HUD 3D",
  terminal→"Terminal", terminal3d→"Terminal 3D", neon→"Neon Grid"`; mode glyph =
  `light→"☾", dark→"☀"`; env badge = `LIVE` + `PROD`; status bar = `CONNECTED · GW eu-west-1
  · …statusItems… · BUILD v4.0.1 · {clock} UTC`.
- **Accessibility labels are required on interactive controls** (the smoke tests query by
  role/label): give buttons `aria-label`s as specified per task.
- Tests use `@testing-library/react` `fireEvent.*` + explicit `cleanup()` in `afterEach`
  (Vitest `globals` are off; React 19 createRoot needs `act()` flush — P0 lesson). jsdom
  setup (localStorage + canvas shims) is already in `tests/setup/jsdom.ts`.
- After every task: `pnpm --filter @rtc/client-prototype typecheck && biome check && eslint
  && stylelint && test` must be green (commands in Task 0 below).

## File Structure

```
packages/client-prototype/src/
  App.tsx                                  (MODIFY — Task 8)
  mock/
    types.ts                               (MODIFY — Task 1: + User/Language/Notif/StatusItem)
    shellData.ts                           (CREATE — Task 1)
    useClock.ts                            (CREATE — Task 5)
  shell/
    AppShell.tsx / .module.css             (MODIFY — Task 2 + Task 8)
    ThemeControls.tsx                      (DELETE — Task 8)
    ambient/AmbientBackground.tsx / .module.css        (CREATE — Task 2)
    Preferences/
      prefs.ts                             (CREATE — Task 1)
      PreferencesProvider.tsx              (CREATE — Task 1)
      usePreferences.ts                    (CREATE — Task 1)
      PreferencesModal.tsx / .module.css   (CREATE — Task 6)
      ToggleRow.tsx / .module.css          (CREATE — Task 6)
      SegmentedControl.tsx / .module.css   (CREATE — Task 6)
    Header/
      Header.tsx / .module.css             (CREATE — Task 3, extend Task 4)
      Logo.tsx                             (CREATE — Task 3)
      Nav.tsx / .module.css                (CREATE — Task 3)
      StatusPills.tsx / .module.css        (CREATE — Task 3)
      ModeToggle.tsx / .module.css         (CREATE — Task 3)
      ThemePicker.tsx / .module.css        (CREATE — Task 3)
      Notifications.tsx / .module.css      (CREATE — Task 4)
      LanguageMenu.tsx / .module.css       (CREATE — Task 4)
      AccountMenu.tsx / .module.css        (CREATE — Task 4)
      useMenus.ts                          (CREATE — Task 3, used Task 4)
    StatusBar/StatusBar.tsx / .module.css  (CREATE — Task 5)
    LockScreen/LockScreen.tsx / .module.css(CREATE — Task 7)
  tests/
    preferences.test.tsx                   (CREATE — Task 1)
    header.test.tsx                        (CREATE — Task 3/4)
    shell.test.tsx                         (CREATE — Task 8)
    app.test.tsx                           (MODIFY — Task 8: rewrite skin/mode tests)
```

---

## Task 0: Verification commands (reference — not a step)

From repo root, the per-task green-gate for this package:

```bash
pnpm --filter @rtc/client-prototype typecheck
pnpm --filter @rtc/client-prototype test
pnpm exec biome check packages/client-prototype/src
pnpm exec eslint packages/client-prototype/src
pnpm exec stylelint "packages/client-prototype/src/**/*.module.css"
pnpm --filter @rtc/client-prototype build   # capstone (Task 8)
```

(Run eslint/stylelint from repo root so the flat config + ignores resolve. If an eslint run
appears to flag sibling `.claude/worktrees/*` files, that's the known primary-repo glob
pollution — in-worktree runs are clean.)

---

## Task 1: Foundations — mock data + Preferences context

**Files:**
- Modify: `packages/client-prototype/src/mock/types.ts`
- Create: `packages/client-prototype/src/mock/shellData.ts`
- Create: `packages/client-prototype/src/shell/Preferences/prefs.ts`
- Create: `packages/client-prototype/src/shell/Preferences/PreferencesProvider.tsx`
- Create: `packages/client-prototype/src/shell/Preferences/usePreferences.ts`
- Test: `packages/client-prototype/tests/preferences.test.tsx`

**Interfaces:**
- Produces: `Prefs`, `DEFAULT_PREFS`, `SEGMENT_DEFS`, `SegmentKey` (prefs.ts);
  `PreferencesProvider`, `usePreferences(): { prefs, setPref, togglePref, ambPlay }`
  (context); `user`, `languages`, `notifSeed`, `statusItems`, `themeNames`, and types
  `User`, `Language`, `Notif`, `StatusItem` (shellData.ts/types.ts).
- Consumes: P0 `Skin` type from `#/mock/types`.

**Source refs (PROTO):** prefs shape = line 815; pref render keys & segment defs = lines
1412–1417; `setPref`/`togglePref` = lines 1119–1120; `--ambPlay` rule = line 1200; user =
789; languages = 790; notifSeed = 791–795; themeNames = 1406; statusItems (static values
for P1) = 1393–1401.

- [ ] **Step 1: Add shell data types to `mock/types.ts`** (append):

```ts
export interface User {
  name: string;
  initials: string;
  role: string;
  email: string;
  desk: string;
  id: string;
}

export interface Language {
  code: string;
  label: string;
}

export interface Notif {
  t: string;
  tag: string;
  msg: string;
  color: string;
}

export interface StatusItem {
  label: string;
  value: string;
  color: string;
}
```

- [ ] **Step 2: Create `mock/shellData.ts`** — verbatim seed (PROTO 789–795, 1393–1401, 1406):

```ts
import type { Language, Notif, Skin, StatusItem, User } from "#/mock/types";

export const user: User = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  id: "TRD-0042",
};

export const languages: Language[] = [
  { code: "EN", label: "English" },
  { code: "中文", label: "中文 (简体)" },
  { code: "日本", label: "日本語" },
  { code: "DE", label: "Deutsch" },
  { code: "FR", label: "Français" },
  { code: "ES", label: "Español" },
];

export const notifSeed: Notif[] = [
  { t: "09:46", tag: "LIMIT", msg: "EURUSD position at 80% of desk limit", color: "var(--accent)" },
  { t: "09:41", tag: "NEWS", msg: "ECB rate decision in 25 minutes", color: "var(--accent2)" },
  { t: "09:38", tag: "SETTLE", msg: "2 trades settle today · value 25-Jun", color: "var(--buy)" },
];

// Static representative values for P1; live wiring arrives with Admin metrics (P5).
export const statusItems: StatusItem[] = [
  { label: "LAT", value: "42ms", color: "var(--text)" },
  { label: "TPUT", value: "1.2k/s", color: "var(--text)" },
  { label: "FPS", value: "60", color: "var(--text)" },
  { label: "MEM", value: "284MB", color: "var(--text)" },
  { label: "POS", value: "2", color: "var(--text)" },
  { label: "P&L", value: "+$17,120", color: "var(--buy)" },
  { label: "SES", value: "1280", color: "var(--text)" },
];

export const themeNames: Record<Skin, string> = {
  holo: "Holo HUD",
  holo3d: "Holo HUD 3D",
  terminal: "Terminal",
  terminal3d: "Terminal 3D",
  neon: "Neon Grid",
};
```

- [ ] **Step 3: Create `shell/Preferences/prefs.ts`** (PROTO 815 = defaults; 1413 toggle
  keys; 1414–1415 segment defs):

```ts
export interface Prefs {
  animatedBg: boolean;
  reduceMotion: boolean;
  glassBlur: boolean;
  showGrid: boolean;
  scanlines: boolean;
  density: string;
  fontFace: string;
  uiScale: number;
  confirmExec: boolean;
  oneClick: boolean;
  execSound: boolean;
  precision: string;
  desktopAlerts: boolean;
  priceAlerts: boolean;
  marketNews: boolean;
  refreshRate: string;
  timezone: string;
  heartbeat: boolean;
  telemetry: boolean;
  crashReports: boolean;
  betaModules: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  animatedBg: false,
  reduceMotion: false,
  glassBlur: true,
  showGrid: true,
  scanlines: true,
  density: "Comfortable",
  fontFace: "Orbitron",
  uiScale: 100,
  confirmExec: true,
  oneClick: false,
  execSound: true,
  precision: "5 dp",
  desktopAlerts: true,
  priceAlerts: false,
  marketNews: true,
  refreshRate: "250 ms",
  timezone: "UTC",
  heartbeat: true,
  telemetry: false,
  crashReports: true,
  betaModules: false,
};

export type SegmentKey = "density" | "fontFace" | "precision" | "refreshRate" | "timezone";

// label groups (PROTO 1414) keyed by the Prefs field they set (PROTO 1415 segKey).
export const SEGMENT_DEFS: Record<SegmentKey, string[]> = {
  density: ["Comfortable", "Compact"],
  fontFace: ["Orbitron", "Rajdhani", "Mono"],
  precision: ["3 dp", "5 dp", "Pips"],
  refreshRate: ["100 ms", "250 ms", "500 ms", "1 s"],
  timezone: ["UTC", "Local", "EST", "LON"],
};
```

- [ ] **Step 4: Create `usePreferences.ts`** (context hook):

```ts
import { createContext, useContext } from "react";

import type { Prefs, SegmentKey } from "#/shell/Preferences/prefs";

export interface PreferencesContextValue {
  prefs: Prefs;
  setPref(key: SegmentKey | "uiScale", value: string | number): void;
  togglePref(key: keyof Prefs): void;
  ambPlay: "running" | "paused";
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error("usePreferences must be used within <PreferencesProvider>");
  }
  return value;
}
```

- [ ] **Step 5: Create `PreferencesProvider.tsx`** — owns prefs state; writes `--amb-play`
  to `:root` in an effect (PROTO 1200 rule):

```tsx
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Prefs, SegmentKey } from "#/shell/Preferences/prefs";
import { DEFAULT_PREFS } from "#/shell/Preferences/prefs";
import { PreferencesContext } from "#/shell/Preferences/usePreferences";

export interface PreferencesProviderProps {
  children: ReactNode;
}

export function PreferencesProvider(props: PreferencesProviderProps): ReactElement {
  const { children } = props;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  const ambPlay = prefs.animatedBg && !prefs.reduceMotion ? "running" : "paused";

  useEffect(() => {
    document.documentElement.style.setProperty("--amb-play", ambPlay);
  }, [ambPlay]);

  const setPref = useCallback((key: SegmentKey | "uiScale", value: string | number) => {
    setPrefs((prev) => {
      return { ...prev, [key]: value };
    });
  }, []);

  const togglePref = useCallback((key: keyof Prefs) => {
    setPrefs((prev) => {
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const value = useMemo(() => {
    return { prefs, setPref, togglePref, ambPlay };
  }, [prefs, setPref, togglePref, ambPlay]);

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}
```

- [ ] **Step 6: Write the failing test `tests/preferences.test.tsx`:**

```tsx
import { act, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup } from "@testing-library/react";

import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { usePreferences } from "#/shell/Preferences/usePreferences";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--amb-play");
});

function wrapper(props: { children: ReactNode }): ReactElement {
  return <PreferencesProvider>{props.children}</PreferencesProvider>;
}

test("defaults: animatedBg off → --amb-play paused", () => {
  renderHook(() => usePreferences(), { wrapper });
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe("paused");
});

test("toggling animatedBg flips --amb-play to running", () => {
  const { result } = renderHook(() => usePreferences(), { wrapper });
  act(() => {
    result.current.togglePref("animatedBg");
  });
  expect(result.current.prefs.animatedBg).toBe(true);
  expect(result.current.ambPlay).toBe("running");
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe("running");
});

test("reduceMotion forces paused even when animatedBg on", () => {
  const { result } = renderHook(() => usePreferences(), { wrapper });
  act(() => {
    result.current.togglePref("animatedBg");
    result.current.togglePref("reduceMotion");
  });
  expect(result.current.ambPlay).toBe("paused");
});

test("setPref updates a segment value", () => {
  const { result } = renderHook(() => usePreferences(), { wrapper });
  act(() => {
    result.current.setPref("density", "Compact");
  });
  expect(result.current.prefs.density).toBe("Compact");
});
```

- [ ] **Step 7: Run tests → expect PASS** (`pnpm --filter @rtc/client-prototype test preferences`).
- [ ] **Step 8: Run the full per-task gate (Task 0). Commit.**

```bash
git add packages/client-prototype/src/mock packages/client-prototype/src/shell/Preferences packages/client-prototype/tests/preferences.test.tsx
git commit -m "feat(client-prototype): P1 foundations — shell data + Preferences context"
```

---

## Task 2: AmbientBackground + AppShell integration

**Files:**
- Create: `packages/client-prototype/src/shell/ambient/AmbientBackground.tsx` + `.module.css`
- Modify: `packages/client-prototype/src/shell/AppShell.tsx` + `.module.css`

**Interfaces:**
- Produces: `AmbientBackground` (no props). Renders the aurora/sweep/grid/particle/vignette
  layers; all ambient animations use `animation-play-state: var(--amb-play, paused)`.
- Consumes: keyframes already in `src/styles/global.css` (P0 ported all 20 — `auroraA`,
  `auroraB`, `sweepRot`, `gridDrift`; verify names before referencing).

**Source refs (PROTO):** ambient layer markup + per-layer inline styles = lines 101–111
(the `booted` wrapper's first child `<div … z-index:0 …>` through the vignette div). Reproduce
each layer's gradients/sizes/opacities/animations verbatim as CSS classes. `--ambPlay`
binding rule = PROTO 105–110 (`animation-play-state:var(--ambPlay,paused)`), renamed here to
**`--amb-play`** (kebab).

- [ ] **Step 1: Verify keyframe names** exist in `src/styles/global.css`:
  `grep -oE "@keyframes [a-zA-Z]+" packages/client-prototype/src/styles/global.css`.
  Expected to include `auroraA auroraB sweepRot gridDrift`. If a referenced keyframe is
  missing, port it verbatim from PROTO's `<helmet>` `<style>` block (search PROTO for
  `@keyframes auroraA`).
- [ ] **Step 2: Write failing test** — add to a new `tests/ambient.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { cleanup } from "@testing-library/react";

import { AmbientBackground } from "#/shell/ambient/AmbientBackground";

afterEach(cleanup);

test("renders an aria-hidden ambient layer", () => {
  const { container } = render(<AmbientBackground />);
  const layer = container.querySelector('[data-testid="ambient"]');
  expect(layer).not.toBeNull();
  expect(layer?.getAttribute("aria-hidden")).toBe("true");
});
```

- [ ] **Step 3: Create `AmbientBackground.tsx`** — structure (translate PROTO 101–111 layers
  to classes; `aria-hidden` + `data-testid="ambient"` on the root, `pointer-events:none`):

```tsx
import type { ReactElement } from "react";

import styles from "#/shell/ambient/AmbientBackground.module.css";

export function AmbientBackground(): ReactElement {
  return (
    <div className={styles.ambient} aria-hidden="true" data-testid="ambient">
      <div className={styles.aurora}>
        <div className={styles.auroraA} />
        <div className={styles.auroraB} />
      </div>
      <div className={styles.sweep} />
      <div className={styles.grid} />
      <div className={styles.particles} />
      <div className={styles.vignette} />
    </div>
  );
}
```

- [ ] **Step 4: Create `AmbientBackground.module.css`** — one class per layer, reproducing
  PROTO 101–111 inline styles verbatim (positions, gradients, blur, opacity, animation). Every
  animated layer ends with `animation-play-state: var(--amb-play, paused);`. Use `var(--grid)`,
  `var(--accent)`, `var(--accent2)`, `var(--buy)`, `var(--aurora-op)` (note: P0's `themeVars`
  maps `auroraOp`→`--aurora-op`; confirm and use that). Example shape (fill the rest from PROTO):

```css
.ambient {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.auroraA {
  position: absolute;
  inset: -25%;
  background: radial-gradient(38% 38% at 28% 32%, var(--accent) 0%, transparent 62%),
    radial-gradient(34% 34% at 78% 64%, var(--accent2) 0%, transparent 62%);
  opacity: 0.18;
  filter: blur(46px);
  animation: auroraA 52s ease-in-out infinite;
  animation-play-state: var(--amb-play, paused);
  will-change: transform;
}
/* …auroraB, sweep, grid, particles, vignette — verbatim from PROTO 104–111… */
```

- [ ] **Step 5: Integrate into `AppShell.tsx`** — render `AmbientBackground` as the first
  child (behind everything), keep existing `body`. The vignette/overlay stays in
  `AmbientBackground`. (Header/StatusBar wiring is Task 8; for now just add the background so
  the shell still renders children.)

```tsx
import type { ReactElement, ReactNode } from "react";

import { AmbientBackground } from "#/shell/ambient/AmbientBackground";
import styles from "#/shell/AppShell.module.css";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell(props: AppShellProps): ReactElement {
  const { children } = props;
  return (
    <div className={styles.shell}>
      <AmbientBackground />
      <div className={styles.body}>{props.children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Run `tests/ambient.test.tsx` → PASS. Run full per-task gate. Commit.**

---

## Task 3: Header frame + Logo/Nav/StatusPills/ModeToggle/ThemePicker + useMenus

**Files:**
- Create: `Header/Header.tsx` + `.module.css`, `Header/Logo.tsx`, `Header/Nav.tsx` + `.module.css`,
  `Header/StatusPills.tsx` + `.module.css`, `Header/ModeToggle.tsx` + `.module.css`,
  `Header/ThemePicker.tsx` + `.module.css`, `Header/useMenus.ts`
- Test: `packages/client-prototype/tests/header.test.tsx`

**Interfaces:**
- Produces:
  - `type Tab = "fx" | "credit" | "equities" | "admin"`
  - `type MenuName = "theme" | "notif" | "lang" | "user"`
  - `useMenus(): { open: MenuName | null; toggle(name): void; close(): void }`
  - `Header` props (full set; Task 4 adds notif/lang/account — declare the whole interface now,
    pass placeholders for Task-4 parts until then OR scope Header to what exists and extend in
    Task 4). Recommended: define `HeaderProps` with `tab`, `onSelectTab(tab)` only in Task 3;
    Task 4 extends it. Keep `Tab`/`MenuName` exported from `Header/useMenus.ts`.
- Consumes: P0 `useTheme()` → `{ skin, mode, setSkin, toggleMode }`; `themeNames`,
  `themesDark` (for swatch colors) from `#/mock/shellData` / `#/theme/tokens`; `Skin`.

**Source refs (PROTO):** header frame = 114; logo SVG = 116–140 (reproduce the `<svg>`
verbatim inside `Logo.tsx`, colors via `var(--accent)`/`var(--accent2)`); wordmark = 137–139;
nav = 141–146 + `navStyle` 1188; LIVE/PROD pills = 148–153; mode toggle = 154 + glyph/title
1423; theme picker trigger = 156–161 + menu 162–165; `themeList`/swatches = 1407;
`langItemStyle` (shared menu-item look) = 1126; `toggleMenu`/`closeMenu` = 1115–1116;
`setTheme`=`setSkin` = 1122.

- [ ] **Step 1: Create `useMenus.ts`:**

```ts
import { useCallback, useState } from "react";

export type Tab = "fx" | "credit" | "equities" | "admin";
export type MenuName = "theme" | "notif" | "lang" | "user";

export interface MenusApi {
  open: MenuName | null;
  toggle(name: MenuName): void;
  close(): void;
}

export function useMenus(): MenusApi {
  const [open, setOpen] = useState<MenuName | null>(null);
  const toggle = useCallback((name: MenuName) => {
    setOpen((prev) => {
      return prev === name ? null : name;
    });
  }, []);
  const close = useCallback(() => {
    setOpen(null);
  }, []);
  return { open, toggle, close };
}
```

- [ ] **Step 2: Create `Logo.tsx`** — the hexagon/rings SVG (PROTO 116–136) as a pure
  component returning `ReactElement`; all `stroke`/`fill` use `var(--accent)`/`var(--accent2)`;
  `aria-hidden="true"`. (SVG presentational attributes are allowed — they are not `style={{}}`.)
- [ ] **Step 3: Create `Nav.tsx` (+ css)** — four nav items (PROTO 141–146). Props:
  `{ tab: Tab; onSelect(tab: Tab): void }`. Each item is a `<button>` with
  `data-active={tab === key}` (semantic state → `.item[data-active="true"]` styles from
  `navStyle` PROTO 1188). Labels `FX/CREDIT/EQUITIES/ADMIN`. Give the `<nav>` `aria-label="Primary"`.
- [ ] **Step 4: Create `StatusPills.tsx` (+ css)** — LIVE indicator (pulsing dot + `LIVE`) +
  `PROD` badge (PROTO 148–153). Static, `aria-hidden` not needed but no interactivity.
- [ ] **Step 5: Create `ModeToggle.tsx` (+ css)** — `<button>` calling `useTheme().toggleMode`,
  glyph `mode === "light" ? "☾" : "☀"`, `aria-label={`Switch to ${mode === "light" ? "dark" :
  "light"} mode`}` and matching `title`. (PROTO 154, 1423.)
- [ ] **Step 6: Create `ThemePicker.tsx` (+ css)** — trigger button (swatch + `themeNames[skin]`
  + ▾) calling `menus.toggle("theme")`; dropdown (when `menus.open === "theme"`) listing all 5
  skins. Each row: two swatches colored by that skin's `accent`/`accent2`, the display name,
  and a ✓ when active; clicking calls `setSkin(skin)` then `menus.close()`. **Swatch colors are
  per-skin runtime values → rule-3 escape hatch:**

```tsx
const swatch = { "--sw-a": themesDark[s].accent, "--sw-b": themesDark[s].accent2 } as CSSProperties;
// eslint-disable-next-line no-restricted-syntax -- runtime per-skin swatch colors
<span className={styles.row} style={swatch}> … </span>
```
  with `.swatchA { background: var(--sw-a); } .swatchB { background: var(--sw-b); }`. Props:
  `{ menus: MenusApi }` (reads `useTheme()` internally). Active-row uses `data-active`.
  Give the trigger `aria-label="Theme picker"` and each option an accessible name (the skin
  display label as text content is sufficient).
- [ ] **Step 7: Create `Header.tsx` (+ css)** — the `<header>` frame (PROTO 114 styling):
  Logo + wordmark, `Nav`, spacer, then the right cluster: `StatusPills`, `ModeToggle`,
  `ThemePicker`. `HeaderProps = { tab: Tab; onSelectTab(tab: Tab): void }`; create `useMenus()`
  inside Header and pass to `ThemePicker`. (Notifications/Language/Account added in Task 4.)
- [ ] **Step 8: Write `tests/header.test.tsx`** (wrap in `ThemeProvider`):

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { Header } from "#/shell/Header/Header";
import { ThemeProvider } from "#/theme/ThemeProvider";

afterEach(cleanup);

function renderHeader(tab: "fx" | "credit" | "equities" | "admin" = "fx") {
  const onSelectTab = vi.fn();
  render(
    <ThemeProvider>
      <Header tab={tab} onSelectTab={onSelectTab} />
    </ThemeProvider>,
  );
  return { onSelectTab };
}

test("nav click selects a tab", () => {
  const { onSelectTab } = renderHeader();
  fireEvent.click(screen.getByText("CREDIT"));
  expect(onSelectTab).toHaveBeenCalledWith("credit");
});

test("theme picker opens and switching skin updates --accent", () => {
  renderHeader();
  fireEvent.click(screen.getByLabelText("Theme picker"));
  fireEvent.click(screen.getByText("Neon Grid"));
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff2bd6");
});

test("mode toggle flips the themed background", () => {
  renderHeader();
  const before = document.documentElement.style.background;
  fireEvent.click(screen.getByLabelText(/Switch to (dark|light) mode/));
  expect(document.documentElement.style.background).not.toBe(before);
});
```

- [ ] **Step 9: Run `header.test.tsx` → PASS. Full per-task gate. Commit.**

---

## Task 4: Header dropdowns — Notifications, LanguageMenu, AccountMenu + menu backdrop

**Files:**
- Create: `Header/Notifications.tsx` + `.module.css`, `Header/LanguageMenu.tsx` + `.module.css`,
  `Header/AccountMenu.tsx` + `.module.css`
- Modify: `Header/Header.tsx` (+ `.module.css`), `tests/header.test.tsx`

**Interfaces:**
- Extends `HeaderProps` to:
  `{ tab; onSelectTab; lang: string; onSelectLang(code): void; onOpenPrefs(): void;
     onLogout(): void; onReboot(): void }`. (Header creates `useMenus()` and renders the
  click-outside **backdrop** — a fixed `div` at `z-index:15` covering the viewport, shown when
  `menus.open !== null`, `onClick={menus.close}` — PROTO 224.)
- Consumes: `languages`, `notifSeed`, `user`, `themeNames` from `#/mock/shellData`; `MenusApi`.

**Source refs (PROTO):** notifications trigger+badge = 168–172, menu = 173–183 (count =
`notifSeed.length`; in P1 the live `activity` prefix is empty, so show `notifSeed` only);
language trigger = 186–189, menu = 190–195 (`langs` mark/active = 1404, `langItemStyle` 1126);
account avatar = 200–204, menu = 205–219 (`user` fields, Preferences/Reboot/Sign Out rows);
menu backdrop = 224; handlers `setLang` 1121, `logout` 1124, `openPrefs` 1117, `reboot` 1114.

- [ ] **Step 1: Create `Notifications.tsx` (+ css)** — bell button with count badge
  (`notifSeed.length`); dropdown (when `menus.open === "notif"`) lists `notifSeed` rows (tag
  chip colored via rule-3 `--tag-color`, msg, time) + a "MARK ALL READ" footer calling
  `menus.close()`. Trigger `aria-label="Notifications"`. Props `{ menus: MenusApi }`.
- [ ] **Step 2: Create `LanguageMenu.tsx` (+ css)** — globe + current `lang` + ▾ trigger;
  dropdown lists `languages` with ✓ on the active code; click calls `onSelectLang(code)` +
  `menus.close()`. Trigger `aria-label="Language"`. Props
  `{ menus: MenusApi; lang: string; onSelectLang(code: string): void }`. Active row uses
  `data-active`; menu-item look ported from `langItemStyle` (PROTO 1126).
- [ ] **Step 3: Create `AccountMenu.tsx` (+ css)** — hexagon avatar (`user.initials`) + ▾
  trigger; dropdown (PROTO 205–219): identity header (name/email), the TRADER ID/DESK/CLEARANCE
  rows, then `⚙ Preferences` (→ `onOpenPrefs()` + close), `⟳ Reboot HUD` (→ `onReboot()` + close),
  `⏻ Sign Out` (→ `onLogout()` + close, colored `var(--sell)`). Trigger `aria-label="Account"`.
  Props `{ menus: MenusApi; onOpenPrefs(): void; onReboot(): void; onLogout(): void }`.
- [ ] **Step 4: Extend `Header.tsx`** — add a divider, then `Notifications`, `LanguageMenu`,
  `AccountMenu` to the right cluster (after `ThemePicker`); render the backdrop `div` when
  `menus.open !== null`; thread the new props through. Update `HeaderProps`.
- [ ] **Step 5: Extend `tests/header.test.tsx`:**

```tsx
test("account menu Sign Out fires onLogout", () => {
  const onLogout = vi.fn();
  render(
    <ThemeProvider>
      <Header tab="fx" onSelectTab={vi.fn()} lang="EN" onSelectLang={vi.fn()}
        onOpenPrefs={vi.fn()} onReboot={vi.fn()} onLogout={onLogout} />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByLabelText("Account"));
  fireEvent.click(screen.getByText(/Sign Out/));
  expect(onLogout).toHaveBeenCalledOnce();
});

test("language menu opens then closes on backdrop click", () => {
  render(
    <ThemeProvider>
      <Header tab="fx" onSelectTab={vi.fn()} lang="EN" onSelectLang={vi.fn()}
        onOpenPrefs={vi.fn()} onReboot={vi.fn()} onLogout={vi.fn()} />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByLabelText("Language"));
  expect(screen.getByText("Français")).toBeDefined();
  fireEvent.click(screen.getByTestId("menu-backdrop"));
  expect(screen.queryByText("Français")).toBeNull();
});
```
  (Give the backdrop `data-testid="menu-backdrop"`. Update the Task-3 render helper to pass the
  new required props, or keep a single helper used by all tests.)
- [ ] **Step 6: Run `header.test.tsx` → PASS. Full per-task gate. Commit.**

---

## Task 5: StatusBar footer

**Files:**
- Create: `mock/useClock.ts`, `StatusBar/StatusBar.tsx` + `.module.css`
- Test: add to `tests/shell.test.tsx` (or a focused `tests/statusbar.test.tsx`)

**Interfaces:**
- Produces: `useClock(): string` (HH:MM:SS, updates each second); `StatusBar` (no props,
  reads `statusItems` from `#/mock/shellData`).

**Source refs (PROTO):** footer = 728–737 (connection dot + CONNECTED, GW region, statusItems,
spacer, BUILD v4.0.1, clock + UTC); clock format `_hhmm` = `toTimeString().slice(0,8)`.

- [ ] **Step 1: Create `useClock.ts`:**

```ts
import { useEffect, useState } from "react";

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function useClock(): string {
  const [clock, setClock] = useState<string>(now);
  useEffect(() => {
    const id = setInterval(() => {
      setClock(now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);
  return clock;
}
```

- [ ] **Step 2: Write failing test** (in `tests/statusbar.test.tsx`):

```tsx
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { StatusBar } from "#/shell/StatusBar/StatusBar";

afterEach(cleanup);

test("renders connection state, a status item, build and clock", () => {
  render(<StatusBar />);
  expect(screen.getByText("CONNECTED")).toBeDefined();
  expect(screen.getByText("BUILD v4.0.1")).toBeDefined();
  expect(screen.getByText(/UTC/)).toBeDefined();
  expect(screen.getByText("LAT")).toBeDefined();
});
```

- [ ] **Step 3: Create `StatusBar.tsx` (+ css)** — translate PROTO 728–737: pulsing dot,
  `CONNECTED` (color `var(--buy)`), `│` separators, `GW eu-west-1`, map `statusItems`
  (`{label} {value}` with value colored via rule-3 `--item-color` when non-default — P&L uses
  `var(--buy)`), spacer, `BUILD v4.0.1`, `{useClock()} UTC`. Footer is a `<footer>`.
- [ ] **Step 4: Run test → PASS. Full per-task gate. Commit.**

---

## Task 6: PreferencesModal + ToggleRow + SegmentedControl

**Files:**
- Create: `Preferences/ToggleRow.tsx` + `.module.css`, `Preferences/SegmentedControl.tsx` +
  `.module.css`, `Preferences/PreferencesModal.tsx` + `.module.css`
- Test: `tests/preferences-modal.test.tsx`

**Interfaces:**
- Produces:
  - `ToggleRow` props `{ label: string; hint?: string; on: boolean; onToggle(): void }` —
    the `.rtSw` switch (PROTO css 51–54) using `data-on` + a `<button role="switch"
    aria-checked={on} aria-label={label}>`.
  - `SegmentedControl` props `{ label: string; options: string[]; value: string;
    onSelect(opt): void }` — `.rtSeg` buttons (PROTO css 55–57), active via `data-on`.
  - `PreferencesModal` props `{ onClose(): void }` — reads `usePreferences()`.
- Consumes: `usePreferences()`, `SEGMENT_DEFS`, `SegmentKey`.

**Source refs (PROTO):** modal shell + overlay = 226–236 + footer 335–340; DISPLAY section =
237–270; TRADING = 272–290; NOTIFICATIONS = 293–305; DATA & PRIVACY = 307–333; switch/seg/range
css = 51–60; `seg` build + keys = 1414–1417; uiScale slider = 269 (`min 80 max 120 step 5`,
label `uiScale + "%"`).

- [ ] **Step 1: Top-of-file doc comment in `PreferencesModal.tsx`** stating the fidelity note:
  only `animatedBg`/`reduceMotion` affect rendering (via `--amb-play`); all other controls are
  faithful-but-cosmetic, matching the prototype.
- [ ] **Step 2: Create `ToggleRow.tsx` (+ css)** — label (+ optional hint) on the left, the
  switch on the right. Switch = `<button type="button" role="switch" aria-checked={on}
  aria-label={label} data-on={on} onClick={onToggle} className={styles.sw} />`. Port `.rtSw`
  css (PROTO 51–54) to `.sw` + `.sw[data-on="true"]` (+ `::after` thumb). Uses `color-mix` +
  `var(--buy)`/`var(--border)` — keep verbatim.
- [ ] **Step 3: Create `SegmentedControl.tsx` (+ css)** — `options.map` → `<button data-on=
  {opt === value} onClick={() => onSelect(opt)}>`. Port `.rtSeg` css (PROTO 55–57).
- [ ] **Step 4: Create `PreferencesModal.tsx` (+ css)** — fixed overlay (`onClick={onClose}`),
  inner panel (`onClick` stops propagation), header (title + `DISPLAY · TRADING ·
  NOTIFICATIONS · DATA` + ✕ button `aria-label="Close preferences"`), the two-column grid of
  sections built from `usePreferences()`:
  - DISPLAY: `ToggleRow` for animatedBg/reduceMotion/glassBlur/showGrid/scanlines;
    `SegmentedControl` for density (`SEGMENT_DEFS.density`) and fontFace; the uiScale
    `<input type="range" min={80} max={120} step={5} value={prefs.uiScale}
    onChange={(e) => setPref("uiScale", Number.parseInt(e.target.value, 10))}
    aria-label="Interface scale" className={styles.range} />` + `{prefs.uiScale}%`.
  - TRADING: oneClick/confirmExec/execSound toggles; precision segmented.
  - NOTIFICATIONS: desktopAlerts/priceAlerts/marketNews toggles.
  - DATA & PRIVACY: refreshRate + timezone segmented; heartbeat/telemetry/crashReports/
    betaModules toggles.
  - footer: hint text + `DONE` button (`onClick={onClose}`, `aria-label="Close preferences"` or
    text "DONE"). Map switch fields to `togglePref(key)`; segments to `setPref(segKey, opt)`.
- [ ] **Step 5: Write `tests/preferences-modal.test.tsx`** (wrap in `PreferencesProvider`):

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { PreferencesModal } from "#/shell/Preferences/PreferencesModal";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--amb-play");
});

function renderModal(): { onClose: () => void } {
  const onClose = vi.fn();
  render(
    <PreferencesProvider>
      <PreferencesModal onClose={onClose} />
    </PreferencesProvider>,
  );
  return { onClose };
}

test("toggling Animated background switch flips --amb-play to running", () => {
  renderModal();
  fireEvent.click(screen.getByRole("switch", { name: "Animated background" }));
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe("running");
});

test("DONE closes the modal", () => {
  const { onClose } = renderModal();
  fireEvent.click(screen.getByText("DONE"));
  expect(onClose).toHaveBeenCalledOnce();
});

test("selecting a density segment updates the active state", () => {
  renderModal();
  const compact = screen.getByText("Compact");
  fireEvent.click(compact);
  expect(compact.getAttribute("data-on")).toBe("true");
});
```

- [ ] **Step 6: Run tests → PASS. Full per-task gate. Commit.**

---

## Task 7: LockScreen

**Files:**
- Create: `LockScreen/LockScreen.tsx` + `.module.css`
- Test: `tests/lockscreen.test.tsx`

**Interfaces:**
- Produces: `LockScreen` props `{ onAuthenticate(): void }` — reads `user` from
  `#/mock/shellData` and a `sessionId` (pass a constant or accept as prop; PROTO derives a
  random `RT-XXXXX` once — use a module constant `const SESSION_ID = "RT-7F3A2"` to stay
  deterministic for tests, noting the original randomizes).
- Consumes: `user`.

**Source refs (PROTO):** lockscreen = 83–101 (logo SVG, `SESSION LOCKED`, sessionId, user
hexagon + initials/name/role, the 4-of-6 dot row, AUTHENTICATE button, `BIOMETRIC · ENCRYPTED
CHANNEL`). `onLogin` handler = 1125.

- [ ] **Step 1: Write failing test:**

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { LockScreen } from "#/shell/LockScreen/LockScreen";

afterEach(cleanup);

test("shows the locked identity and authenticates", () => {
  const onAuthenticate = vi.fn();
  render(<LockScreen onAuthenticate={onAuthenticate} />);
  expect(screen.getByText("SESSION LOCKED")).toBeDefined();
  expect(screen.getByText("Anthony Stark")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /Authenticate/i }));
  expect(onAuthenticate).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Create `LockScreen.tsx` (+ css)** — translate PROTO 83–101; full-screen
  overlay; AUTHENTICATE is a `<button>` calling `onAuthenticate`, `aria-label="Authenticate"`.
  SVGs `aria-hidden`. Background grid layer via CSS.
- [ ] **Step 3: Run test → PASS. Full per-task gate. Commit.**

---

## Task 8: App / AppShell integration — assemble the shell, remove ThemeControls, rewrite P0 tests

**Files:**
- Modify: `src/App.tsx`, `src/shell/AppShell.tsx` (+ `.module.css`), `tests/app.test.tsx`
- Delete: `src/shell/ThemeControls.tsx`, `src/shell/ThemeControls.module.css`
- Create: `tests/shell.test.tsx`

**Interfaces:**
- `AppShell` becomes the full chrome host. Recommended new `AppShell` API:
  `{ tab; onSelectTab; lang; onSelectLang; onOpenPrefs; onReboot; onLogout; children }` — i.e.
  it renders `AmbientBackground` + `Header` (passing the header props) + `<main>{children}</main>`
  (the placeholder body) + `StatusBar`. `App` owns the state and the LockScreen/Preferences
  overlays. (Alternatively keep `AppShell` presentational and assemble in `App`; pick one and
  keep Header/StatusBar inside `AppShell` for cohesion.)
- `App` owns: `tab` (`useState<Tab>("fx")`), `loggedOut` (`useState(false)`),
  `prefsOpen` (`useState(false)`), `lang` (`useState("EN")`). Wraps booted shell in
  `PreferencesProvider`. Reboot → re-trigger boot (set `booted` false again).

**Source refs (PROTO):** main wrapper + placeholder body region = 343+ (`<main … flex:1 …>`);
nav tab→`setState({tab})` = 1254; logout/login = 1124–1125; openPrefs/closePrefs = 1117–1118;
reboot = 1114; menu backdrop already in Header (Task 4).

- [ ] **Step 1: Create placeholder body** — a small inline `PlaceholderPanel` (in `App.tsx` or
  `shell/PlaceholderPanel.tsx`) that renders, per `tab`, a centered panel: e.g.
  `FX · live rates, exec & blotter — coming in P2`, similarly Credit (P3), Equities (P4),
  Admin (P5). One CSS-module class; `data-testid={`panel-${tab}`}`.
- [ ] **Step 2: Update `AppShell.tsx`** — render `AmbientBackground`, `Header` (with all
  props), `<main className={styles.body}>{children}</main>`, `StatusBar`. Keep
  `data-testid="app-shell"` on the root. Update `.module.css` so the shell is a column flex
  (header / main / footer) over the ambient layer (z-index per PROTO).
- [ ] **Step 3: Rewrite `App.tsx`:**

```tsx
import type { ReactElement } from "react";
import { useState } from "react";

import { AppShell } from "#/shell/AppShell";
import { BootSequence } from "#/shell/Boot/BootSequence";
import { LockScreen } from "#/shell/LockScreen/LockScreen";
import { PreferencesModal } from "#/shell/Preferences/PreferencesModal";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import type { Tab } from "#/shell/Header/useMenus";
import { ThemeProvider } from "#/theme/ThemeProvider";

export function App(): ReactElement {
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<Tab>("fx");
  const [lang, setLang] = useState("EN");
  const [loggedOut, setLoggedOut] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  if (!booted) {
    return (
      <ThemeProvider>
        <BootSequence onDone={() => setBooted(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <PreferencesProvider>
        {loggedOut ? (
          <LockScreen onAuthenticate={() => setLoggedOut(false)} />
        ) : (
          <AppShell
            tab={tab}
            onSelectTab={setTab}
            lang={lang}
            onSelectLang={setLang}
            onOpenPrefs={() => setPrefsOpen(true)}
            onReboot={() => setBooted(false)}
            onLogout={() => setLoggedOut(true)}
          />
        )}
        {prefsOpen ? <PreferencesModal onClose={() => setPrefsOpen(false)} /> : null}
      </PreferencesProvider>
    </ThemeProvider>
  );
}
```
  (AppShell renders the placeholder body itself from `tab`, so no `children` needed; adjust
  AppShell to render `PlaceholderPanel` internally. Keep PreferencesModal outside AppShell so it
  overlays even the lock screen-free shell.)
- [ ] **Step 4: Delete `ThemeControls.tsx` + `.module.css`** (`git rm`). Confirm nothing else
  imports it: `grep -rn ThemeControls packages/client-prototype/src` → empty.
- [ ] **Step 5: Rewrite `tests/app.test.tsx`** — replace the two P0 tests that drove
  `ThemeControls` (`getByLabelText("Theme skin")` / `"Toggle dark or light mode"`) with Header-
  driven equivalents; keep the boot-skip helper:

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { App } from "#/App";

afterEach(cleanup);

function bootToApp(): void {
  render(<App />);
  fireEvent.click(screen.getByTestId("boot-skip"));
}

test("reaches the themed shell after boot", () => {
  bootToApp();
  expect(screen.getByTestId("app-shell")).toBeDefined();
});

test("theme picker switches skin (--accent → neon)", () => {
  bootToApp();
  fireEvent.click(screen.getByLabelText("Theme picker"));
  fireEvent.click(screen.getByText("Neon Grid"));
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff2bd6");
});

test("mode toggle flips dark↔light", () => {
  bootToApp();
  const before = document.documentElement.style.background;
  fireEvent.click(screen.getByLabelText(/Switch to (dark|light) mode/));
  expect(document.documentElement.style.background).not.toBe(before);
});
```

- [ ] **Step 6: Create `tests/shell.test.tsx`** — the integration smokes from spec §6:

```tsx
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { App } from "#/App";

afterEach(cleanup);

function boot(): void {
  render(<App />);
  fireEvent.click(screen.getByTestId("boot-skip"));
}

test("nav switches the active placeholder panel", () => {
  boot();
  fireEvent.click(screen.getByText("EQUITIES"));
  expect(screen.getByTestId("panel-equities")).toBeDefined();
});

test("Preferences toggling animatedBg flips --amb-play", () => {
  boot();
  fireEvent.click(screen.getByLabelText("Account"));
  fireEvent.click(screen.getByText(/Preferences/));
  fireEvent.click(screen.getByRole("switch", { name: "Animated background" }));
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe("running");
});

test("Sign Out shows LockScreen, AUTHENTICATE returns to shell", () => {
  boot();
  fireEvent.click(screen.getByLabelText("Account"));
  fireEvent.click(screen.getByText(/Sign Out/));
  expect(screen.getByText("SESSION LOCKED")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /Authenticate/i }));
  expect(screen.getByTestId("app-shell")).toBeDefined();
});

test("a header menu opens and closes on backdrop click", () => {
  boot();
  fireEvent.click(screen.getByLabelText("Language"));
  expect(screen.getByText("Français")).toBeDefined();
  fireEvent.click(screen.getByTestId("menu-backdrop"));
  expect(screen.queryByText("Français")).toBeNull();
});
```

- [ ] **Step 7: Run the FULL gauntlet** (Task 0 incl. `build`). Fix any findings.
- [ ] **Step 8: Commit.**

```bash
git add -A packages/client-prototype
git commit -m "feat(client-prototype): P1 shell chrome — Header, StatusBar, Preferences, LockScreen"
```

---

## Final review & ship

After Task 8, dispatch the whole-branch review (most-capable model) over the full P1 diff
(`git merge-base main HEAD` … HEAD), per subagent-driven-development. Priorities for the
reviewer (constraints copied from §Global Constraints): zero `style={{}}` outside the rule-3
escape hatch; prefs NOT persisted; only `animatedBg`/`reduceMotion` wired; faithful values
verbatim; render-purity (P0 lesson — no impure calls during render; the package's own lint
can't catch rules-of-react violations). Then ship via **shipping-repo-changes** (PR → CI green
on `gh run list --workflow CI` → `--merge` commit → confirm ancestor → remove worktree).

## Self-Review (author)

- **Spec coverage:** Header+6 menus (T3/T4), StatusBar (T5), Preferences modal (T6), LockScreen
  (T7), ambient bg (T2), placeholder bodies + assembly (T8), fidelity notes (T1 prefs cosmetic /
  no-persist; T5 static statusItems; T8 ThemeControls removal). ✓
- **Type consistency:** `Tab`/`MenuName`/`MenusApi` from `useMenus.ts`; `Prefs`/`SegmentKey`/
  `SEGMENT_DEFS` from `prefs.ts`; `usePreferences` shape stable across T1/T6/T8. `setPref`
  signature `(SegmentKey|"uiScale", string|number)` used consistently. ✓
- **No placeholders:** every task has source line refs + exact target API + complete test code.
  Verbatim markup/CSS is delegated to cited PROTO ranges (in-repo authoritative source) rather
  than lossy re-transcription. ✓
- **Right-sizing:** 8 tasks, each independently testable and reviewable; Header split into
  frame+theme (T3) and dropdowns (T4) to keep each reviewable. ✓
