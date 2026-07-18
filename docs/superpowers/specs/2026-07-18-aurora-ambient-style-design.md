# Selectable ambient background style (Aurora ⇄ Rays) + draggable Preferences dialog

**Date:** 2026-07-18
**Status:** Designed — not yet built
**Depends on:** [ADR-005 — UI logic placement](../../adr/ADR-005-ui-logic-placement.md) (drag math = pure fn in `@rtc/motion-core` + framework shell); [`docs/performance.md`](../../performance.md) (compositor budget — the aurora curtains use blur/mask); the `themeSkin` string-union preference (the end-to-end precedent this feature copies)

**Scope decisions (locked, from brainstorming):**
- **Three clients get the new Aurora style + selector.** `client-react`, `client-solid`, and `client-react-native` all render the new style and an "Ambient style" selector. The preference *plumbing* (domain → port → 4 adapters → contract) is done regardless, since the port contract runs against every adapter.
- **Aurora is the default.** `DEFAULT_AMBIENT_STYLE = "aurora"`, matching the v5 design. The app's current look becomes the opt-in **Rays** style. (The RN client keeps its existing `animatedBackground = false` motion default — orthogonal; style default is still Aurora.)
- **Draggable Preferences dialog is web-only.** Built now, position **resets to centered on close** (no new persisted preference). RN's Appearance UI is a full-bleed sheet, not a floating window, so "drag the dialog" does not map to mobile — RN is untouched by Part B.
- **`ambientStyle` and `animatedBackground` stay orthogonal.** `animatedBackground` is the motion gate (running/paused); `ambientStyle` selects *which* style is drawn. Neither subsumes the other.
- **Legacy opacity token names kept.** `--aurora-opacity` (web) / `t.aurora` (RN) remain the per-skin master ambient-container opacity applied to *whichever* style is active — matching the design's own `--auroraOp`, which gates both styles. Renaming to `--ambient-opacity` would touch every skin in both web clients + the RN theme for no functional gain; the legacy name is documented instead.

---

## 1. Why

The v5 design prototype (`docs/design/web/v5/standalone/`) ships **two** ambient backdrop styles behind a Preferences → Display selector: a new **Aurora** (fixed-palette northern-lights curtains, the default) and the original **Rays** (theme-tinted drifting blobs + a rotating conic sweep). The actual app only ever shipped the Rays style — and, confusingly, names it "aurora" internally. This feature brings the design's Aurora curtains into the app as a *selectable* style, making the app's ambient backdrop match the design's default and giving the user the same Aurora/Rays choice.

The user also asked whether the Preferences dialog could be draggable. It is **not** draggable in the prototype (only the Jarvis floating widgets are), so this is a genuinely new, self-contained enhancement built alongside.

### 1a. The naming trap (read this before touching code)

The app's *current, only* backdrop **is the design's "Rays"**: theme-accent radial blobs (`aurora-a`/`aurora-b` keyframes) + a rotating conic `.sweep` ("the ray") + grid + dots. Internally the code calls it "aurora" (`.aurora`, `--aurora-opacity`, `AnimatedBackgroundPresenter`, `useAnimatedBackground`). Resolution:

| Concept | Name after this change | Rationale |
|---|---|---|
| New preference | `AmbientStyle = "aurora" \| "rays"`, default `"aurora"` | mirrors `ThemeSkin` |
| Motion gate (unchanged) | `animatedBackground` / `useAnimatedBackground` / `AnimatedBackgroundPresenter` | correctly named ("animated vs static") — **do not rename** |
| Per-skin master opacity (unchanged) | `--aurora-opacity` (web) / `t.aurora` (RN) | gates whichever style is active; legacy name kept, documented |
| Web CSS layers | existing `.aurora`/`.layerA`/`.layerB`/`.sweep` → regrouped under the **rays** branch; new **aurora** curtain layers added | internal-only rename |
| New presenter / hook | `AmbientStylePresenter` / `useAmbientStyle` | mirrors `ThemeSkinPreferencePresenter` / `useThemeSkinPreference` |

**Why two orthogonal booleans-and-enums, not one enum with an "off":** motion on/off is a performance/accessibility concern; aurora-vs-rays is aesthetic. Keeping them separate means "reduce motion" and power-saver act on *either* style with no combinatorial special-casing.

---

## 2. Part A — the `ambientStyle` preference (all clients)

A wide-but-mechanical vertical slice, following the `themeSkin` precedent end-to-end. **Every** file below is load-bearing; omitting one breaks the port contract or a binding test.

### 2a. Domain (`@rtc/domain`)

- `packages/domain/src/preferences/preferences.ts`:
  ```ts
  export type AmbientStyle = "aurora" | "rays";
  export const AMBIENT_STYLES = ["aurora", "rays"] as const;
  export const DEFAULT_AMBIENT_STYLE: AmbientStyle = "aurora";
  ```
  Re-export via `packages/domain/src/index.ts`.
- `packages/domain/src/ports/preferencesPort.ts`: add `ambientStyle$(): Observable<AmbientStyle>` and `setAmbientStyle(style: AmbientStyle): void`. (Replay-current, like the other streams.)

### 2b. The four adapters (all implement `PreferencesPort`)

Each seeds a `BehaviorSubject<AmbientStyle>` from `DEFAULT_AMBIENT_STYLE`, hydrates via an `isAmbientStyle` type-guard, writes raw, and exposes `ambientStyle$()` (with `distinctUntilChanged()`) / `setAmbientStyle()`. Storage key `rtc-ambient-style`.

1. `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`
2. `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts`
3. `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts` — `"true"/"false"`-style raw string; add `isAmbientStyle` guard mirroring `isThemeSkin`. Style default stays `"aurora"` (only `animatedBg` has the RN off-override).
4. `packages/domain/src/simulators/PreferencesSimulator.ts` — seed field `ambientStyle?`, `?? DEFAULT_AMBIENT_STYLE`.

### 2c. Port contract

- `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`: seed field `ambientStyle?` + assertions (default is `"aurora"`; `setAmbientStyle` round-trips and is observed by a late subscriber).
- Each adapter's contract test runs it: the react, solid, simulator, and RN adapter contract tests.

### 2d. client-core presenter

- `packages/client-core/src/presenters/AmbientStylePresenter.ts` — wraps `ports.preferences.ambientStyle$()` in `shareReplay({ bufferSize: 1, refCount: true })`; exposes `style$`, `set(style)`. (Mirror `ThemeSkinPreferencePresenter`; no cross-consumer, so it need not be hoisted like `PowerSaverPresenter`.)
- Export from `presenters/index.ts`; instantiate in `composition.ts`; add to the `Presenters` interface. New test `AmbientStylePresenter.test.ts`.

### 2e. Both bindings

- `packages/react-bindings/src/createViewModel.ts`: `UseAmbientStyleResult { style: AmbientStyle; setStyle(style): void }`; `bind(presenters.ambientStyle.style$, DEFAULT_AMBIENT_STYLE)`; hook `useAmbientStyle`. Mirror in `packages/solid-bindings/src/createViewModel.ts`.
- Both bindings' `createViewModel` stream tests (react-bindings `themePreferenceHooks.test.tsx`, solid-bindings `createViewModel.streams.test.tsx`) get an `ambientStyle` case. **These live outside `client-*` — easy to miss.**

---

## 3. Part A2 — Aurora rendering, per client

The **Rays** branch = each client's *current* ambient implementation, unchanged in behaviour (only regrouped/renamed). The **Aurora** branch is new. Grid + dots + vignette (web) / grid (RN) stay shared across both styles. Motion gate (`--amb-play` / `useAmbientEnabled`) and power-saver removal apply to whichever style is active.

### 3a. React (`packages/client-react/src/ui/shell/background/`)

`AmbientBackground.tsx` reads `useAmbientStyle()` and renders the Aurora *or* Rays layer group (both under the existing power-saver / `--amb-play` gating). `AmbientBackground.module.css` gains the Aurora layers, ported from the prototype but **performance-corrected** (see §4):

- **Aurora** (7 layers): two blurred radial-gradient blobs (`auroraA` 52s / `auroraB` 68s), three `repeating-linear-gradient` curtain bands with top→bottom `mask-image` and downward `border-radius` arcs (`auroraC` 44s / `auroraD` 61s / `auroraE` 27s, `skewX`+`scaleY` sway), one static top wash. **Fixed** northern-lights palette: green `rgba(61,255,171)`, teal `rgba(45,212,191)`, sky `rgba(56,189,248)`, purple `rgba(168,85,247)`, magenta `rgba(217,70,239)`.
- **Rays** (today's layers, renamed): two `--accent`/`--accent2`/`--buy`-tinted blobs + the conic `.sweep` (`sweep-rot` 90s).

**Keyframe naming**: the prototype uses camelCase (`auroraA`…`auroraE`); the app's CSS module uses kebab-case (`aurora-a`/`aurora-b` already exist at 52s/68s). Port the two blob keyframes onto the existing `aurora-a`/`aurora-b` (reused by both branches), and add the three curtain keyframes as `aurora-c`/`aurora-d`/`aurora-e` (kebab, matching house convention). Overall container opacity stays `var(--aurora-opacity)`; each layer keeps its own base opacity + `animation-play-state: var(--amb-play, paused)`. OS `prefers-reduced-motion` still forces `animation: none`.

### 3b. Solid (`packages/client-solid/src/ui/shell/background/`)

Verbatim mirror of 3a (Solid client is at full visual parity as of the completed SolidJS port). Same CSS module content, Solid control-flow (`<Show>`/`<Switch>`) for the branch.

### 3c. React Native (`packages/client-react-native/src/ui/ambient/`) — highest risk

`AmbientBackground.tsx` (Skia) branches on `useAmbientStyle()`. Rays branch = today's three drifting blobs + HUD grid. **Aurora branch is a Skia *approximation*** of the CSS curtains (no direct Skia analogue for `repeating-linear-gradient` + `mask-image`):

- Curtain bands = vertical Skia `Rect`/`Path`s filled with a `LinearGradient` shader (the curtain color-stops), softened with `Blur`, faded top→bottom via a gradient mask (`BlendMode.DstIn` layer or a `Mask`).
- Reuse the single existing Reanimated `progress` shared value for sway; keep `BLOB_BASE_OPACITY`-style static opacities scaled by `t.aurora`.
- Gating unchanged: `useAmbientEnabled()` (pref ON && OS reduced-motion OFF) still decides whether the Canvas mounts; `ambientStyle` only selects which layer set to draw.

**Explicitly flagged:** this is a visual approximation, not a pixel-match of the web curtains. It needs the user's iOS simulator + an Opus paint review before merge (the established RN paint-bug net). If a faithful curtain proves impractical in Skia within the workstream, fall back to a documented simplified aurora (e.g. layered blurred gradient bands without the repeating comb) rather than blocking.

### 3d. Selector UI (all clients)

- **React/Solid**: a new "Ambient style" `PrefSegment` row (Aurora | Rays) in Preferences → Display, directly below the existing "Animated background" toggle, wired to `useAmbientStyle().setStyle`. Subtitle: "Northern-lights curtains or the original accent rays."
- **RN**: an "Ambient style" segmented row in `AppearanceScreen`'s Motion section, copying the inline dark/light segmented-control pattern (two `flex:1` `Pressable`s in a bordered row), with `testID`s `appearance-ambient-aurora` / `appearance-ambient-rays`.

---

## 4. Performance doctrine (mandatory — the curtains are a compositor risk)

The prototype's Aurora uses `filter: blur(5–44px)` on large, **transform-animated** layers plus `mask-image`. Per `docs/performance.md`: a present filter (T6) is re-evaluated at composite time on **every** frame produced by anything while any animation runs, and animating a blurred layer compounds it. Porting verbatim would burn GPU. The port therefore applies the doc's fix patterns and gate:

- **Bake blur into gradient softness where possible (P6)** — the two radial *blob* layers can drop `filter: blur()` in favour of larger radii + eased mid-stops (visually indistinguishable on smooth radial gradients). This eliminates their per-frame composite-time filter cost.
- **Curtain bands** genuinely need some blur + mask to read as curtains; keep the blur radius as small as the look allows, ensure **only `transform`/`opacity` animate** (the sway already does), one animation per property per element, and accept the residual as a documented product cost (it is already gated by `animatedBackground` and removed from the DOM by power-saver).
- **Verify zero `compositeFailed`** in a Chrome trace for the Aurora steady state before merge, and run the change through `docs/performance.md` §5 "Checklist for new animated UI".
- Document the residual honestly in `performance.md` (§6).

---

## 5. Part B — draggable Preferences dialog (web only)

Built the ADR-005 way: pure math in `@rtc/motion-core`, thin per-framework shell.

### 5a. `@rtc/motion-core` (pure, framework-free, unit-tested, shared by both web clients)

```ts
export interface DragOffset { x: number; y: number }
export interface Size { width: number; height: number }

// New offset from a pointer delta, clamped so the dialog stays within the
// viewport by at least `margin` px (keeps the drag-handle header grabbable).
export function clampDragOffset(
  next: DragOffset,
  dialog: Size,
  viewport: Size,
  margin: number,
): DragOffset;
```

No DOM; the caller supplies measured rects. Unit tests cover: centered start (0,0), clamping at each edge, dialog larger than viewport (clamp degrades gracefully).

### 5b. React & Solid shells

A small `useDraggable` hook (React `src/ui/shell/prefs/`, Solid primitive) owns the pointer seam:
- `pointerdown` on the dialog header → capture pointer, record start offset + pointer origin.
- `pointermove` → `clampDragOffset(...)` → set offset state → dialog gets `transform: translate(x, y)`.
- `pointerup`/`pointercancel` → release.
- Header gets `cursor: grab`/`grabbing`; the ✕ close button carries `data-nodrag` so clicking it never starts a drag (the prototype's jv-widget pattern).
- **Offset resets to `{0,0}` when the dialog closes** (mount/unmount of the modal, or an effect keyed on `open`). No persisted state.

Modal semantics (focus trap, backdrop click-to-close, Esc, `role="dialog"`) are unchanged — dragging is a pointer-only enhancement layered on top.

---

## 6. Docs (matching how Rays is documented for the *app*)

- `packages/client-react/src/ui/shell/background/README.md` — expand the narrative to describe **both** styles (Aurora curtains vs Rays blobs+sweep), the `ambientStyle` preference, and the retained `--aurora-opacity` naming.
- `docs/performance.md` — add trap/fix-pattern coverage for the Aurora curtains (blur/mask handling per §4); note the P6 blob de-blur.
- `docs/power-saver-mode.md` — the Aurora curtain layers join the existing "removed from the DOM under power saver" table row.
- `docs/design/web/v5/CHANGELOG.md` + `docs/design/web/v5/dev-handoff/HANDOFF.md` — note the app now ships the Aurora/Rays selector (design→app parity).
- `docs/architecture/17-web-client-up-close.md` — update the `AmbientBackground` mention if the layer inventory is cited.
- Re-run `pnpm check:doc-links`.

---

## 7. Testing & gates

- **`@rtc/ui-contract`**: contract specs for the new selector (`PreferencesModal.contract.spec.ts`) and the Aurora/Rays render branch (`AmbientBackground.contract.spec.ts`); page-object accessor for the ambient-style segment; visual scenario-matrix entries (`visual/appData.ts` / `fixtures.ts`) for both styles. Run the **react and solid** contract-coverage gates (both clients render these).
- **Visual goldens**: regenerate for both web clients × 3 tiers × skins × modes. Visual is a post-merge `visual.yml` job, **not** a PR gate — but the contract/coverage gates are.
- **Presenter + binding tests**: `AmbientStylePresenter.test.ts`; both bindings' stream tests.
- **motion-core**: `clampDragOffset` unit tests.
- **RN**: `AmbientBackground.test.tsx` (both branches) + `resolveAmbientEnabled` unchanged; on-device verification + Opus paint review for the Aurora Skia approximation.
- **Full gauntlet** once per phase (build, typecheck, test, Biome, ESLint×2, stylelint, knip, contract-coverage react+solid, `check:doc-links`).

---

## 8. Proposed phasing (for the implementation plan)

1. **Preference plumbing** — domain → 4 adapters → contract → presenter → both bindings (+ all tests). Foundation; nothing renders yet.
2. **Web Aurora + selector** — React first, then Solid mirror; apply the §4 performance pass; contract specs + goldens.
3. **RN Aurora + selector** — Skia approximation + segmented row; on-device + Opus review.
4. **Draggable dialog** — `clampDragOffset` in motion-core + React/Solid shells.
5. **Docs + goldens + full gauntlet** — the four-doc update, golden regen, `check:doc-links`, whole-branch review.

Phases 2 and 4 are disjoint (different files) and can run in parallel per the accelerated-SDD regime; Phase 1 gates 2 and 3.
