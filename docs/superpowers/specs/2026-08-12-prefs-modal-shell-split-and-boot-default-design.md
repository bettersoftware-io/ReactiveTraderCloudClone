# Preferences Modal: ModalShell/Content Split + Force-Boot-Animation Default Flip — Design

**Date:** 2026-08-12
**Status:** Approved (design discussion in-session)

## Context

Two related findings about the preferences modal:

1. **`DEFAULT_FORCE_BOOT_ANIMATION` is `false`** (`packages/domain/src/preferences/preferences.ts`).
   The "Always play boot animation" toggle does *not* gate the boot animation
   itself — the splash already plays for every user on every load. It only
   overrides the OS `prefers-reduced-motion` signal (its intended audience:
   VDI / remote desktops that set reduced-motion automatically). The gate in
   both clients' `BootSequence` is
   `if (isFreeze || (prefersReduced && !forced)) return;`.
   Decision: flip the default to `true` — the boot splash is part of the
   product identity (showcase default). Reduced-motion users can opt out via
   the toggle; power-saver **Freeze still unconditionally suppresses** the
   canvas; `navigator.webdriver` / `?nosplash` automation suppression
   (`bootSplashGate.ts`) is untouched, so e2e/visual runs stay splash-free.

2. **The `prefs/modal` golden misses real, wired rows.** The dialog is clamped
   at `max-height: 86vh` with a scrolling body; at the 1920×1080 capture
   viewport the golden clips **Login wait delay** and the entire **JARVIS
   section (Brain / Effort / Narrator + the budget-gate hint)** — all real
   port-wired rows, never pixel-asserted in any theme. Content will keep
   growing; the capture strategy must not re-break each time.

## Part A — Flip `DEFAULT_FORCE_BOOT_ANIMATION` to `true`

- Flip the constant in `packages/domain/src/preferences/preferences.ts` and
  **rewrite its doc comment** — it currently justifies `false` ("honour the
  accessibility signal"); the new comment must state the new rationale: splash
  is a showcase default; reduced-motion users opt out via the preference;
  Freeze remains an absolute suppressor.
- `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`:
  - "empty store emits the default forceBootAnimation=false" → asserts `true`.
  - The seeded-readback test flips its seed to `false` so it still proves a
    **non-default** value survives the round-trip.
- The three storage adapters (react/solid `LocalStoragePreferencesAdapter`,
  RN `AsyncStoragePreferencesAdapter`) read the constant as their fallback —
  no code change; sweep their tests (and any other test/fixture asserting
  default-off) in the same pass.
- Visual goldens: the toggle now renders ON in `prefs/modal` (and the new
  content scenario) — covered by Part B's single golden regen.

## Part B — ModalShell / PreferencesContent split + content-only golden

### Component split (mirrored identically in `client-react` and `client-solid`)

- **`ModalShell`** — new reusable component at `src/ui/shell/modal/` with its
  own `ModalShell.module.css`: overlay, draggable dialog (`useDraggableDialog`),
  header (title / subtitle / ✕ close), scrollable body (the `max-height: 86vh`
  clamp lives HERE), footer (note + DONE button).
  Props: `title`, `subtitle`, `footNote`, `onClose`, `children`, and the
  concrete testids it renders (`rootTestid`, `closeTestid`, `doneTestid`) so
  the prefs instance keeps `prefs-modal` / `prefs-close` / `prefs-done`.
- **`PreferencesContent`** — the two-column DISPLAY/MOTION | TRADING/
  NOTIFICATIONS/DATA/JARVIS grid with all rows, keeping its `useViewModel()`
  wiring exactly as-is, plus `PreferencesContent.module.css` (grid / column /
  sectionHead / gateHint styles).
- **`PreferencesModal`** becomes a thin composition: `open` gate → `ModalShell`
  wrapping `PreferencesContent`.
- **All existing testids are preserved** (`prefs-modal`, `prefs-close`,
  `prefs-done`, `prefs-column`, every row testid) → contract tier and e2e
  suites need zero changes. Rendered DOM structure and computed styles stay
  identical — a pure refactor from the pixel tier's point of view (the
  existing `prefs/modal` golden must not change from the split alone; it
  changes only via Part A's toggle flip).
- **Solid parity risk (the sharpest edge):** goldens are react-authored and
  solid-asserted, so the Solid split must reproduce the React DOM shape
  exactly — same classnames-per-element structure — or the shared goldens
  diverge.

### Visual tier

- **Keep** `prefs/modal` (full-page, 1080p): documents the shell, the clamp,
  and what a real user sees.
- **Add** `prefs/content`: registry entry for `PreferencesContent` in the
  per-framework swap-trio (`ui-contract` `shared/components.ts`), reusing the
  `prefs-open` fixture data, captured as a scenario-root element shot at
  natural (unclamped) height — every row incl. JARVIS Brain/Effort/Narrator
  and Login wait delay gets pixel-asserted, with headroom for future rows.
  Follows the established 5-edit scenario recipe; regen **both** golden sets
  (CI x86 dispatch + local darwin) once, covering Part A's toggle flip too.

## Testing

- Existing contract + e2e suites: unchanged, must stay green (testids stable).
- Port contract: default flipped as above.
- Visual: one regen for both parts; `prefs/modal` diff should show ONLY the
  toggle flip; `prefs/content` is new (10 themes × per-set).
- Reach tier: `PreferencesContent` mount adds reach; no gate changes expected.

## Out of scope (flagged follow-ups, not included)

- A gated-Jarvis fixture variant so the budget-gate **hint row** (conditional
  on an active gate) gets a golden — cheap follow-up if wanted.
- Migrating any other surface (e.g. Jarvis overlay) onto `ModalShell`.
