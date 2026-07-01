# `@rtc/client-prototype` P1 — Shell Chrome

**Date:** 2026-06-30
**Status:** Design — approved
**Author:** Claude (brainstormed with @nasantsogt)
**Parent spec:** `docs/superpowers/specs/2026-06-30-client-prototype-design.md`
**Prior phase:** P0 scaffold — merged origin/main, PR #57 (`3d495674`)

## 1. Purpose

P1 ports the **global shell chrome** of the v2 prototype into `@rtc/client-prototype`:
the Header (logo, nav, status/env badges, mode toggle, theme picker, notifications,
language, account menus), the StatusBar footer, the Preferences modal, the LockScreen,
and the ambient animated-background layer. After P1 the app is a fully-themed,
interactive shell: every menu opens, the theme picker and mode toggle drive the live
theme, Preferences edits real state, and Sign Out → lock → re-auth works. Tab bodies are
intentionally empty placeholders — each feature's content and its bespoke dock layout
ship in its own later phase (FX in P2, …).

This is a **faithful port** of the prototype's chrome, translated from the single
`class Component` + inline-styled `<x-dc>` template into small, readable React components
with co-located CSS Modules. No behavior is invented; no production indirection is added.

### Decision that shaped this phase

The prototype's dock layout (draggable splits + maximize + collapse-to-strip) is **not
generic** — each tab hand-wires its own column/stack geometry around feature-specific
panels (`fxAside`/`fxStack`/`fxRight`, `creditAside`/`creditStack`,
`eqCenter`/`eqAside`/`eqRight`), and the maximize groups (`_grp`) and collapse logic are
defined panel-by-panel. Building a generic layout kit in P1 — before any feature panel
exists — would either invent an abstraction the original lacks (violating the parent
spec's "no production indirection" non-goal) or ship throwaway placeholder panels.
**Resolved (user decision): the dock layout is deferred. Each tab's split layout ships
with its feature; the shared split/maximize mechanics get extracted as a small helper
when the second feature (P3) first reuses them.** The parent spec §8 explicitly permits
adjusting phase granularity during planning.

## 2. Scope

### In scope
- **AmbientBackground** — aurora A/B blobs, conic sweep, drifting grid + particle layers,
  vignette. All ambient animations honor `animation-play-state: var(--ambPlay)`.
- **Header** — logo SVG + wordmark; nav (FX / CREDIT / EQUITIES / ADMIN); LIVE indicator +
  PROD env badge; mode toggle (☀/☾); theme picker dropdown (skin swatch list);
  notifications dropdown (seeded list + count); language dropdown (6 languages); account
  dropdown (avatar → Preferences / Sign Out). Single-open-menu behavior with
  click-outside close.
- **StatusBar** (footer) — connection dot + CONNECTED, GW region, `statusItems`
  (latency/fps/etc.), BUILD version, live clock.
- **PreferencesModal** — the four-section settings modal (DISPLAY · TRADING ·
  NOTIFICATIONS · DATA) with toggle rows, segmented controls, and the uiScale slider.
- **LockScreen** — `loggedOut` overlay (locked badge, user identity, AUTHENTICATE).
- **Placeholder tab bodies** — each nav tab renders a minimal "coming in P_n" placeholder
  panel; switching nav switches the placeholder.

### Out of scope (later phases)
- The dock layout (splits, maximize, collapse-to-strip) and all per-tab panel geometry.
- All feature content: FX tiles/blotter, Credit, Equities, Admin (P2–P5).
- FLIP/flash motion (arrives with the features that use it).

## 3. Architecture

### 3.1 Module structure (under `packages/client-prototype/src/`)

```
shell/
  AppShell.tsx                 # (extend P0) hosts AmbientBackground + Header + body
                               #   + StatusBar; renders LockScreen / PreferencesModal
  AppShell.module.css
  ambient/
    AmbientBackground.tsx      # aurora/sweep/grid/particle/vignette
    AmbientBackground.module.css
  Header/
    Header.tsx  Header.module.css
    Logo.tsx                   # the hexagon + spinning-rings SVG mark
    Nav.tsx  Nav.module.css
    ThemePicker.tsx  ThemePicker.module.css   # skin swatch menu
    ModeToggle.tsx
    Notifications.tsx  Notifications.module.css
    LanguageMenu.tsx  LanguageMenu.module.css
    AccountMenu.tsx  AccountMenu.module.css
    StatusPills.tsx            # LIVE indicator + PROD env badge
    useMenus.ts                # single-open-menu state + click-outside close
  StatusBar/
    StatusBar.tsx  StatusBar.module.css
  Preferences/
    PreferencesModal.tsx  PreferencesModal.module.css
    PreferencesProvider.tsx    # context: prefs + setPref/togglePref
    usePreferences.ts          # context hook (throws outside provider)
    prefs.ts                   # Prefs type, DEFAULT_PREFS, segment definitions
    ToggleRow.tsx  ToggleRow.module.css        # shared toggle control
    SegmentedControl.tsx  SegmentedControl.module.css
  LockScreen/
    LockScreen.tsx  LockScreen.module.css
  Boot/                        # (P0, unchanged)
  ThemeControls.tsx            # REMOVED — superseded by Header
mock/
  types.ts                     # (P0) + add User, Language, Notif, StatusItem
  shellData.ts                 # user, languages, notifSeed, statusItems
```

`ThemeControls` (P0's stopgap skin `<select>` + mode button) is **deleted**; the real
Header's `ThemePicker` + `ModeToggle` replace it. P0's `theme/` (`ThemeProvider`,
`useTheme`, `tokens`, `themeVars`) is reused as-is.

### 3.2 State

Plain React hooks — no RxJS, no machines, no `ViewModel` seam (parent-spec non-goals).

- **`App`** keeps the existing boot gate (P0). Inside the booted shell it wraps a
  **`PreferencesProvider`** so both `PreferencesModal` (edits) and `AmbientBackground`
  (reads `animatedBg`/`reduceMotion`) reach prefs without prop-drilling — mirroring the
  existing `ThemeProvider`. (Theme provider stays the outermost so `--ambPlay` and tokens
  coexist on the root.)
- **`AppShell`** owns the shell's transient UI state with `useState`: `tab`
  (`'fx'|'credit'|'equities'|'admin'`), `loggedOut`, `prefsOpen`, and delegates the
  open-menu (`'theme'|'notif'|'lang'|'user'|null`) to `useMenus`.
- **`mock/shellData.ts`** holds the static seed the prototype kept on the class instance:
  `user` (initials/name/role), `languages`, `notifSeed`, `statusItems`.

### 3.3 Theming & ambient play-state

`--ambPlay` is computed exactly as the original:
`animatedBg && !reduceMotion ? 'running' : 'paused'`. It is set on the themed root
(alongside the P0 token `--var`s) and read by every ambient animation via
`animation-play-state: var(--ambPlay, paused)`. The `ThemePicker` calls
`ThemeProvider.setSkin`; `ModeToggle` calls `toggleMode` (both already in P0). The skin
swatch in the picker shows `var(--accent)` per the active skin.

## 4. Fidelity notes (documented, not surprises)

These match the original `Reactive Trader.dc.html` precisely:

1. **Most prefs are decorative.** Only `animatedBg` (gated by `reduceMotion`) is read by
   render logic, via `--ambPlay`. The remaining ~22 prefs (`glassBlur`, `showGrid`,
   `scanlines`, `density`, `uiScale`, `fontFace`, `precision`, `refreshRate`, `timezone`,
   `confirmExec`, `oneClick`, `execSound`, `desktopAlerts`, `priceAlerts`, `marketNews`,
   `heartbeat`, `telemetry`, `crashReports`, `betaModules`, `defaultNotional`) render as
   working controls bound to state but **do not alter rendering** in the prototype — and
   stay that way here. (`reduceMotion`'s other effects are FLIP/feature motion, which
   arrive in later phases.) The `PreferencesModal` doc-comment states this so a reader
   isn't puzzled.
2. **No persistence of prefs.** The original persists only `rt_bootSeq` (boot variant);
   prefs and language are session state. P1 keeps prefs/language as in-memory `useState`,
   **not** localStorage. (P0 already added `rt_skin`/`rt_mode` persistence the original
   lacks; that benign deviation is **not** extended to prefs.)
3. **Static badges.** LIVE / PROD / CONNECTED / GW region / BUILD are static text in the
   original (no live wiring); ported verbatim as static content.
4. **Notifications** are a seeded static list in the chrome (the prototype also prepends
   live FX activity, which does not exist until P2 — so P1 shows `notifSeed` only, and the
   count reflects it).

## 5. Tooling & compliance

Same gates as the rest of the repo (parent spec §4): Vite build, `tsc` strict, Biome
(preset `recommended`, no-disables policy), ESLint flat incl. the **inline-style ban**
(zero `style={{}}`; the `client-prototype/src/**/*.tsx` glob is already in
`eslint.config.mjs` from P0), stylelint over `*.module.css`, `#/` subpath imports.

Runtime-dynamic styling uses the sanctioned escape hatch only where unavoidable — a
`--custom-property` set inline with a scoped `eslint-disable-next-line no-restricted-syntax`,
exactly as `client-react` and P0's `BootSequence` do. Anticipated P1 cases: none expected
beyond what CSS Modules + the themed `--var`s already cover (the ambient layer reads
`--ambPlay`/tokens from CSS, not inline). If any arise (e.g. a per-skin swatch color), use
the documented escape hatch.

## 6. Testing — smoke-only (jsdom + Vitest)

Extends P0's smoke layer (same jsdom localStorage/canvas shims). High-level guards:

- Shell mounts past the boot gate → Header + StatusBar render.
- Nav click switches the active tab and the rendered placeholder.
- Opening Preferences and toggling `animatedBg` flips the root `--ambPlay`
  (`paused` ↔ `running`); toggling `reduceMotion` forces `paused`.
- Account → Sign Out shows the LockScreen; AUTHENTICATE returns to the shell.
- A header menu (e.g. language) opens on click and closes on outside-click / re-click.

Out of scope (parent spec §5): visual goldens, UI-contract, e2e/Cypress.

Tests use `fireEvent.*` + explicit `cleanup()` in `afterEach` (P0 lesson: React 19
createRoot needs `act()` flush; Vitest `globals` not enabled).

## 7. Risks & mitigations

- **Inline-style → CSS Modules volume** (Header + Preferences are style-dense). Mitigation:
  apply P0's proven static-class / `data-*`-state / `--prop`-geometry taxonomy
  mechanically; the inline-style lint gate enforces completeness.
- **Menu open/close correctness** (single-open, click-outside). Mitigation: one
  `useMenus` hook with a document pointerdown listener; covered by a smoke test.
- **Scope creep toward the dock layout.** Mitigation: §2 out-of-scope is explicit; tab
  bodies are placeholders only.

## 8. Open questions

None blocking. If the Header or Preferences task proves too large for a single
implementation task during planning, split it (Header-frame + menus, or modal-frame +
control rows) — a planning-time granularity call, not a design change.
