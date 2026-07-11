# §17 Web Client, Up Close — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `docs/architecture/17-web-client-up-close.md` — the deep dive into the web client's shell (component tree, layout engine, motion toolbox, boot splash, session lock) — plus §10 narrative 10.11, two animated SVGs, and the hub/README wiring.

**Architecture:** Docs-only PR extending the Codebase Atlas. One new section file with five subsections written serially (same-file contention ban), two animated SMIL SVGs and the §10 narrative as parallel-safe side tasks (distinct files), wiring + verification last. Spec: `docs/superpowers/specs/2026-07-11-web-client-up-close-design.md`.

**Tech Stack:** GitHub-flavored markdown, Mermaid (validated via the Mermaid MCP tool), animated SMIL SVG, `github-slugger` anchors gated by `pnpm check:doc-links`.

## Global Constraints

Copied verbatim from the spec (§4) — every task's requirements include these:

1. **Diagram width** — "GitHub (and most md viewers) scale every diagram down to column width, so **horizontal space is the scarce resource — vertical scroll is free**. Compose diagrams tall, not wide: ≤4–5 sibling boxes per rank, split anything wider, stack parallel lanes vertically. Mermaid trap: **edge-less subgraphs tile side-by-side** — connect them with real edges or force vertical stacking with invisible links (`laneA ~~~ laneB`). Sequence diagrams get wide fast: keep participants ≤6 or split the scenario."
2. **Anchors** — verify heading slugs against the Anchor Contract below; ` -- ` slugs to FOUR dashes, ` & ` to two; `pnpm check:doc-links` gates every relative link + anchor. Do not invent headings outside the contract without re-deriving their slug (run from the worktree root after `pnpm install`: `node --input-type=module -e "import S from 'github-slugger'; console.log(new S().slug('YOUR HEADING'))"`).
3. **Animated SVGs** — committed SMIL SVGs render/play inline on GitHub; loop with `dur` + `repeatCount="indefinite"` + `keyPoints`/`keyTimes` (absolute `begin` times fire only once). Render-test frames headlessly (recipe in Tasks 5/6). Self-contained saturated colors readable on BOTH GitHub themes (no `currentColor`, no external refs).
4. **Code claims** — every factual claim about code carries a `file:line` ref verified against THIS worktree's source at writing time. No fictionalized counts, names, or signatures. Reviewers independently re-verify 5–30 claims per task.
5. **Terminology** — ViewModel seam vocabulary (`useViewModel`, `createViewModel`, `ViewModelProvider`); never the retired hooks-era names (`useHooks`/`AppHooks`/`HooksProvider`).
6. **Mermaid validation** — every block through the Mermaid MCP validator; pipe labels containing `()` MUST be quoted (`-->|"createApp(ports)"|`); flowcharts with `classDef` + saturated self-contained fills readable on both GitHub themes.
7. **Atlas voice** — narrative mechanism documentation with verified pointers, not API reference; no exhaustive per-file inventories; link to `docs/performance.md` and §14.1 rather than restating them.
8. **Process** — implementers do NOT run git (no commit, **no `git stash`** — the stash stack is shared across sessions); the controller commits path-scoped per task. All file paths below are relative to the worktree root `/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/web-client-up-close/` — never touch the primary checkout.
9. **Docs-only** — no changes outside `docs/` + `packages/client-react/README.md` (additions-only there; verify with `git diff --stat` showing 0 deletions).

### Anchor Contract (frozen — tasks and cross-links depend on these exact headings)

| File | Heading (exact text) | Slug |
|---|---|---|
| `17-web-client-up-close.md` | `## 17. The Web Client, Up Close` | `#17-the-web-client-up-close` |
| ″ | `### 17.1 The Component Tree and the Provider Stack` | `#171-the-component-tree-and-the-provider-stack` |
| ″ | `### 17.2 The Layout System` | `#172-the-layout-system` |
| ″ | `### 17.3 The Motion Toolbox` | `#173-the-motion-toolbox` |
| ″ | `### 17.4 The Boot Splash` | `#174-the-boot-splash` |
| ″ | `### 17.5 The Session Lock` | `#175-the-session-lock` |
| `10-key-design-decisions.md` | `### 10.11 Continuous UI without fighting the framework` | `#1011-continuous-ui-without-fighting-the-framework` |

The 17.0 framing intro is **unheaded lead prose** directly under the `## 17.` heading (no `17.0` heading — matches how other sections open).

New SVGs: `docs/architecture/17-layout-maximize.svg`, `docs/architecture/17-boot-sequence.svg` (flat next to `15-rfq-quote-race.svg` etc.).

### Task ordering

Content tasks 1→2→3→4 are **strictly serial** (same file). Tasks 5, 6, 7 touch distinct files and may run in parallel with the content chain, but Task 5 must land before Task 2's link-check meaningfully passes (17.2 embeds the SVG) and Task 6 before Task 4's — if the SVG isn't on disk yet, note it in the task report and rely on Task 8's full `check:doc-links`. Task 8 is last.

---

### Task 1: Scaffold §17 + framing intro + 17.1 component tree

**Files:**
- Create: `docs/architecture/17-web-client-up-close.md`
- Modify: `docs/architecture/16-trailheads.md` (line 1 nav only: append ` · [17. The Web Client, Up Close ▶](17-web-client-up-close.md)`)

**Interfaces:**
- Consumes: Anchor Contract; existing anchors `14-composition-and-wiring.md#141-the-composition-root`, `../../packages/client-react/README.md`.
- Produces: the file with ALL SIX contract headings in place (17.2–17.5 as heading + one-line `*Written in a later task.*` placeholder each, so Tasks 2–4 fill bodies without renumbering) and 17.1's finished body.

- [ ] **Step 0: Setup.** Run `pnpm install` at the worktree root (fresh worktree has no `node_modules`; `check:doc-links` and the slugger need it). Expected: install completes; `pnpm check:doc-links` then reports `327 links OK across 110 files` (baseline before your changes... run it once to confirm the tooling works).
- [ ] **Step 1: Research (verify every claim from these sources).** Read in full: `packages/client-react/index.html`, `src/main.tsx`, `src/AppRoot.tsx`, `src/ui/App.tsx`, `packages/react-bindings/src/` (ViewModelProvider + useViewModel), `src/ui/shell/theme/ThemeProvider.tsx`, `src/ui/fx/FxViewProvider.tsx` + `useFxView.ts`, `src/ui/credit/CreditViewProvider.tsx` + `useCreditView.ts`, `src/ui/shell/chrome/HeaderChrome.tsx` (WorkspaceTab type), and skim `docs/architecture/14-composition-and-wiring.md` §14.1 (to link, not duplicate).
- [ ] **Step 2: Write the file.** Nav line 1: `[◀ 16. Trailheads](16-trailheads.md) · [Architecture Document](../architecture.md)`. Then `## 17. The Web Client, Up Close`, then the framing intro (~2 paragraphs): the shell is a permanently-animated, continuous surface over a live stream; it is achievable because no business or lifecycle state lives in React — machines and presenters own state outside the framework, components are replaceable renderers. State that each subsection ends with a one-line *payoff* cashing this out, and point to §10.11 (link `10-key-design-decisions.md#1011-continuous-ui-without-fighting-the-framework`) as the long-form argument. Then `### 17.1 …` covering:
  - `index.html` → `main.tsx` → `AppRoot` (`src/AppRoot.tsx`): the lazy-`useRef` one-shot build — `createApp(buildBrowserPorts())` → `createViewModel(presenters, createMachineFactories(presenters), commands)` — and WHY a ref, not `useState`/`useMemo` (StrictMode double-invokes render bodies and initializers; the ref cell is shared across both invocations so `createApp` runs exactly once — quote the file's own comment sparingly).
  - Provider stack `ViewModelProvider > ThemeProvider > BootGate` and why that nesting (ThemeProvider reads the theme preference through the ViewModel seam — verified in the AppRoot doc comment).
  - `App.tsx`: the six children (`AmbientBackground`, `HeaderChrome`, `WorkspaceEngine` keyed by `activeTab`, `StatusBar`, `ConnectionOverlay`, `LockScreen`) and the observation that **the only shell-level `useState` is `activeTab`** — everything else arrives through the ViewModel seam.
  - `WorkspaceEngine` (`App.tsx`): `useLayout(tab)` → `InhouseLayoutEngine` with `appPanelRegistry`/`appHeadRegistry`; what `key={activeTab}` remount semantics mean for panel lifetimes. Forward-link 17.2 for the engine itself.
  - Secondary contexts `FxViewProvider`/`CreditViewProvider`, plus a table: *provider → what it supplies → who consumes it* (rows verified by grepping consumers, e.g. `grep -rln "useFxView" packages/client-react/src`).
  - Diagram: ONE tall Mermaid component tree (`flowchart TB`), each box annotated with the screen region it owns on the FX tab (e.g. `HeaderChrome — top bar`, `fx-rates panel — main grid`). Respect Global Constraint 1: ≤4–5 siblings per rank; stack with invisible `~~~` links where needed.
  - Payoff line, e.g.: *a tab switch throws away every React component under `WorkspaceEngine`, and nothing of value is lost — prices, orders, and layout all live upstream of the render tree.* (Verify layout survival semantics against how `useLayout(tab)` sources its machine before claiming layout survives remount — write what the code actually does.)
  - End the file (this task only) with the five remaining contract headings, each followed by `*Written in a later task.*`.
- [ ] **Step 3: Validate** the Mermaid block via the Mermaid MCP tool; fix until it passes.
- [ ] **Step 4: Link-check.** `pnpm check:doc-links` — expected green (placeholder headings satisfy inbound anchors).
- [ ] **Step 5: Report** (controller commits): `docs(web-client): scaffold §17 + component tree/provider stack (17.1)`.

---

### Task 2: 17.2 The Layout System

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (replace the `### 17.2` placeholder body only)

**Interfaces:**
- Consumes: contract headings from Task 1; `17-layout-maximize.svg` from Task 5 (embed as `![Maximize / strip / restore cycle](17-layout-maximize.svg)`; if not on disk yet, note in report — Task 8 re-checks).
- Produces: the finished 17.2 body; anchor `#172-the-layout-system` becomes citable.

- [ ] **Step 1: Research (all claims from source).** Read in full: `packages/client-core/src/layout/layoutPort.ts`, `layout/defaultLayoutPort.ts`, `layout/` maximize-boundary module (find via `grep -rn "maximizeBoundaryPath" packages/client-core/src/layout/`), `presenters/LayoutMachine.ts`, `layout/__tests__/maximizeBoundary.test.ts` + `defaultLayoutPort.test.ts`, `presenters/__tests__/LayoutMachine.test.ts`; `packages/client-react/src/ui/shell/layout/engine/` — every file (`InhouseLayoutEngine.tsx`, `InhouseLayoutEngine.module.css`, `appPanelRegistry.tsx`, `appHeadRegistry.tsx`, `panelRegistry.ts`, `PanelErrorBoundary.tsx`); how `useLayout` reaches the machine (grep `useLayout` in `packages/react-bindings/src` and `client-core/src/composition.ts`).
- [ ] **Step 2: Write 17.2** in data-flow order:
  - **State model** (client-core): `LayoutState` (`root` tree / `maximized` / `collapsed`), `LayoutNode` split-vs-panel recursion, `PANEL_SPECS` (titles; `maximizeScope: "nearest-column"` rail semantics for fx-analytics/fx-positions and the equities rail; `maximizable: false` for credit-new-rfq; the dormant `pinned` machinery — quote its own "unused by any default tree today" comment), `createDefaultLayoutPort` per-tab initial trees (`WorkspaceTab = "fx" | "credit" | "admin" | "equities"`, `defaultLayoutPort.ts:9`), ratio `sizes` vs `fixedPx` vs `initialPx` design widths.
  - **`createLayoutMachine`** (`LayoutMachine.ts:98`): five intents (`maximize/restore/collapse/expand/resize`) as Subjects → `merge` → `scan` over the pure immutable reducer (`reduce`, `:69`) → `@rx-state/core` `state()` with a warm subscription released in `dispose()`. Frame explicitly as the **"redux-shaped core, stream-shaped surface"** exhibit: the reducer is transactional, but consumers get a stream, so render granularity is the renderer's choice, not the store's.
  - **`InhouseLayoutEngine`**: the deliberately dumb recursive renderer and the app's **one framework-coupled spot** (quote its header comment, `InhouseLayoutEngine.tsx:26-31`); `SplitNode` cells + `<hr>` handles vs the hook-free `renderPanel` leaves (and why that split exists — rules-of-hooks); `appPanelRegistry` (PanelId → module root) and `appHeadRegistry` (per-panel head-slot overrides, e.g. Live Rates tabs) as the UI↔engine seam; `PanelErrorBoundary` as the per-panel blast-radius wall.
  - **The smooth-animation mechanics**, each with its payoff line:
    - Maximize as *render-time policy*: `maximizeBoundaryPath` + `strippedByMaximize` recomputed per render — root scope strips the whole dock, `nearest-column` strips only column siblings; the stored state is just `maximized: PanelId`.
    - Strip orientation propagation (`stripDir` inheritance, `data-strip-fill`, `isStripSubtree` and the cell-vs-panel shrink regression its comment records).
    - Geometry as CSS custom properties (`--split-size`/`--split-fixed` → `flex-grow` in the module CSS), state as semantic `data-*` — so maximize/restore/collapse glides are **pure CSS transitions on attribute flips; no JS animation**. Embed `![Maximize / strip / restore cycle](17-layout-maximize.svg)` here.
    - The pointer-drag resize: pointer capture as progressive enhancement, `measuredFractions` baselines for `initialPx` splits, the reducer clearing `initialPx` on first resize (`resizeAt`, `LayoutMachine.ts:37-67` — a design-width rail becomes a plain ratio split forever after).
    - The imperative `container.dataset.dragging = "true"` suppression (`InhouseLayoutEngine.tsx:301-309`) — why it must bypass React state: a mid-drag re-render (every `onResize` causes one) would clobber it and re-enable the glide transition, which animates the same `flex-grow` the drag continuously retargets.
  - Diagram: one Mermaid mapping an example layout tree to its rendered DOM (`flowchart TB`, split → cells → panel sections), vertical.
  - Cross-links: interfaces doc §5 reference from the engine's own comment; `maximizeBoundary.test.ts` / `LayoutMachine.test.ts` named as the executable spec.
- [ ] **Step 3: Validate** all Mermaid via MCP.
- [ ] **Step 4: Link-check.** `pnpm check:doc-links` (expect green if Task 5's SVG landed; otherwise note the one pending image).
- [ ] **Step 5: Report** for commit: `docs(web-client): §17.2 the layout system`.

---

### Task 3: 17.3 The Motion Toolbox

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (replace the `### 17.3` placeholder body only)

**Interfaces:**
- Consumes: contract headings; `docs/performance.md` (link only); §15 flows anchors (verify with grep before citing).
- Produces: finished 17.3; anchor `#173-the-motion-toolbox`.

- [ ] **Step 1: Research.** Read in full: `packages/client-react/src/ui/shell/motion/index.ts` (`animateOnce` at `:10`), `useFlipGrid.ts`, `animations.module.css`, `motion.test.ts`, `useFlipGrid.test.ts`; consumers: `grep -rn "useFlipGrid\|animateOnce" packages/client-react/src` (Live Rates panel, credit RfqsPanel, others); `src/ui/equities/watchlist/useRankGlide.ts`; `packages/client-core/src/presenters/AnimationDirector.ts` + its wiring in `composition.ts` (§14.1 step 3 already documents the stream-sourced construction — link it); skim `docs/performance.md` headings to link accurately.
- [ ] **Step 2: Write 17.3** as *four techniques and when each is chosen*:
  1. **CSS transitions on `data-*` flips** (layout glides, most state effects) — the default; why: compositor-friendly, interruptible for free, zero JS per frame.
  2. **`useFlipGrid`** — FLIP (First-Last-Invert-Play) over **raw WAAPI** (`Element.animate`) for keyed-grid reorders — the Live Rates "masonry" glide and credit RFQ cards. Cover: register/measure/invert/play flow; the ResizeObserver origin-refresh (window resizes and dock drags refresh origins WITHOUT animating); the mid-glide re-snapshot guard (`getBoundingClientRect` includes in-flight transforms — a refresh landing mid-glide would store a transformed rect and read as a jump-cut; skipped refreshes self-heal); why raw WAAPI beats the Motion One wrapper here (fires per-item on every layout — quote the hook's own comment). `useRankGlide` as the 1-D sibling (equities watchlist rank moves).
  3. **`animateOnce`** (Motion One wrapper, `motion/index.ts:10`) for one-shot entrances — what it wraps and where it's used (from the Step 1 grep).
  4. **`AnimationDirector`** (`client-core/src/presenters/AnimationDirector.ts`): choreography as a *presenter* sourced from sibling presenters' streams — animation triggers are business events, not component effects; link §14.1's construction note rather than restating it.
  - Cross-cutting paragraph: the shared `prefers-reduced-motion` seam (`useFlipGrid`, `BootGate`/`BootSequence` — same `matchMedia` query) and the `docs/performance.md` compositor rules all of this obeys (LINK, don't restate; one sentence on what the reader will find there). Pointer to §15 for where these animations sit in user journeys.
  - Diagram: a FLIP timeline (First/Last/Invert/Play as stacked phases) — Mermaid or small static SVG, author's choice, vertical composition.
  - Payoff line, e.g.: *the grid can reorder on every price tick without a single React re-render of the moving tiles — measurement and motion live entirely below the framework.* (Verify the actual re-render behaviour from the hook's usage before phrasing.)
- [ ] **Step 3: Validate** Mermaid via MCP (if a static SVG was drawn instead, view a rendered frame).
- [ ] **Step 4: Link-check.** `pnpm check:doc-links`.
- [ ] **Step 5: Report** for commit: `docs(web-client): §17.3 the motion toolbox`.

---

### Task 4: 17.4 The Boot Splash + 17.5 The Session Lock

**Files:**
- Modify: `docs/architecture/17-web-client-up-close.md` (replace the `### 17.4` and `### 17.5` placeholder bodies)

**Interfaces:**
- Consumes: contract headings; `17-boot-sequence.svg` from Task 6 (embed in 17.4; if not on disk yet, note in report); §14.1 steps 5–7 anchors.
- Produces: finished 17.4 + 17.5; the §17 file is content-complete.

- [ ] **Step 1: Research.** Read in full: `packages/client-react/src/bootSplashGate.ts` (+ its test), `src/app/buildBrowserPorts.ts` (bootSplash port wiring), `packages/client-core/src/presenters/BootGatePresenter.ts` (+ test), the boot machine (`grep -rn "BootSequenceMachine\|machineFactories" packages/client-core/src/composition.ts` — §14.1 cites `composition.ts:369-377`), `src/ui/shell/boot/BootGate.tsx` + `BootGate.module.css`, `BootSequence.tsx` + `BootSequence.test.tsx` + `bootCanvas.ts` (phases: globe/laser/docking; `BOOT_DURATION_MS = 4200`), the AccountMenu reboot row (`grep -n "Reboot" src/ui/shell/chrome/AccountMenu.tsx`); then `src/ui/shell/lock/LockScreen.tsx`, `BiometricChannel.tsx`, `BiometricDots.tsx`, `LockScreen.module.css`, `packages/client-core/src/presenters/SessionPresenter.ts` (+ test), and the lock trigger (`AccountMenu.tsx:27` — `const { state, lock } = useSession()`).
- [ ] **Step 2: Write 17.4** in pipeline order:
  - `shouldPlayBootSplash()` (`src/bootSplashGate.ts`): suppressed under `navigator.webdriver` (every Playwright/Cypress load) and `?nosplash`; lives in the composition layer because it reads `navigator`/`window.location` (dumb-UI constraints keep it out of `src/ui`).
  - The port seed → `BootGatePresenter` **one-shot** (`ports.bootSplash?.shouldPlay()` evaluated once at composition time — link §14.1 step 3) → `BootGate` (`ui/shell/boot/BootGate.tsx`): **always mounts its children** — the real `<App/>` mounts warm underneath, streams already flowing — and only overlays the splash while `visible` is true. Payoff: dismissal reveals an already-live app; no pop-in.
  - `BootSequence` + machine (`machineFactories.boot`): the "what technology?" answer — a **plain 2D-canvas `requestAnimationFrame` loop**; pure per-frame draw functions in `bootCanvas.ts` (globe → laser-drawn panels → docking rects, ported verbatim from the prototype — quote its header comment), theme accents read from CSS custom properties at start (`--accent-primary`), the SKIP control, and the reduced-motion + no-2d-context (jsdom) early-outs.
  - Dismissal: the `onTransitionEnd`/reduced-motion path calling `dismiss()`; the AccountMenu "⟳ Reboot HUD" row re-raising the gate.
  - Embed `![Boot sequence over the warm app](17-boot-sequence.svg)`.
  - Cross-link §14.1 steps 5–7 ("this subsection zooms into the same events at render level").
- [ ] **Step 3: Write 17.5** (shortest; closes the overlay-pattern loop):
  - `SessionPresenter` (`client-core/src/presenters/SessionPresenter.ts`): owns locked/user state (`BehaviorSubject<boolean>` + static operator identity); `unlock()` "re-authenticates" — there is no real auth, it clears the lock (quote its own doc comment: the lock/unlock transition is genuinely wired, only the biometric readout is decorative).
  - `LockScreen` (`ui/shell/lock/LockScreen.tsx`): renders `null` unless locked — a render-nothing-unless overlay, dumb, all state through the `useSession` seam; the `BiometricChannel`/`BiometricDots` theatrics; the AUTHENTICATE → `unlock` intent flow; `HudLogo` reuse. Lock triggered from the AccountMenu lock row (`AccountMenu.tsx:27`).
  - Payoff: same shape as BootGate — state outside, dumb overlay inside; a third client (SolidJS) reimplements only the JSX (link §8.1).
- [ ] **Step 4: Link-check.** `pnpm check:doc-links`.
- [ ] **Step 5: Report** for commit: `docs(web-client): §17.4 boot splash + §17.5 session lock`.

---

### Task 5: Animated SVG — layout maximize/strip/restore

**Files:**
- Create: `docs/architecture/17-layout-maximize.svg`

**Interfaces:**
- Consumes: nothing (standalone asset; read `InhouseLayoutEngine.module.css` + `defaultLayoutPort.ts` FX tree only to get proportions/feel right).
- Produces: the SVG Task 2 embeds by exactly this filename.

- [ ] **Step 1: Author the SVG.** A miniature FX-like dock (one main panel + a right rail of two panels + a bottom blotter — 4 rects with header strips) cycling: **normal → maximize main (others glide to thin strips) → hold → restore → hold**, looping forever. Requirements:
  - Root `<svg viewBox="0 0 720 460" xmlns="http://www.w3.org/2000/svg">`, self-contained `<style>` block, saturated fills + white/near-white text readable on BOTH GitHub themes (dark-safe: no pure black text, no transparent-on-white assumptions).
  - SMIL only: `<animate>`/`<animateTransform>` on rect `x/y/width/height` (or transforms), every animation `dur="12s" repeatCount="indefinite"` with `keyTimes` (and `keyPoints` where motion-path-like retiming is needed); NO absolute `begin` times (they fire once and never loop).
  - Label the phases in-SVG (small text: "maximize", "strips", "restore") so the loop reads without a caption.
- [ ] **Step 2: Render-test headlessly.** From the worktree root after `pnpm install` (playwright browsers already provisioned for this repo):

```bash
node --input-type=module -e "
import { chromium } from 'playwright-core';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + process.cwd() + '/docs/architecture/17-layout-maximize.svg');
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/svg-frame-early.png' });
await p.waitForTimeout(6000);
await p.screenshot({ path: '/tmp/svg-frame-mid.png' });
await b.close();
console.log('frames written');
"
```

  (If `playwright-core` doesn't resolve from the worktree, resolve it from the primary checkout's store: `node_modules/.pnpm/node_modules/playwright-core` under `/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone`.) View both PNGs: early ≠ mid frame proves animation runs; both frames must be legible.
- [ ] **Step 3: Report** for commit: `docs(web-client): animated layout maximize/strip/restore SVG`.

---

### Task 6: Animated SVG — boot sequence over the warm app

**Files:**
- Create: `docs/architecture/17-boot-sequence.svg`

**Interfaces:**
- Consumes: `bootCanvas.ts` phase order (globe → laser panels → docking, 4.2s) and `BootGate.tsx` dismissal — read both to get the story right.
- Produces: the SVG Task 4 embeds by exactly this filename.

- [ ] **Step 1: Author the SVG.** Two stacked layers in one scene: (bottom) a simplified live app — 3–4 panels with a subtly pulsing "price" line to read as *already running*; (top) the boot overlay running its phases — wireframe globe (a few animated circles/ellipses), laser-drawn panel outlines (`stroke-dasharray`/`stroke-dashoffset` animation), docking rectangles converging — then the overlay's opacity fades to 0 revealing the live app, holds, and loops. Same technical requirements as Task 5 Step 1 (viewBox ~`0 0 720 460`, SMIL, `dur="12s" repeatCount="indefinite"`, `keyTimes`, no absolute `begin`, both-themes-readable, in-SVG phase labels: "globe", "laser draw", "docking", "reveal").
- [ ] **Step 2: Render-test headlessly.** Same recipe as Task 5 Step 2 with the filename swapped; verify an early frame (overlay visible) differs from a mid/late frame (app revealed).
- [ ] **Step 3: Report** for commit: `docs(web-client): animated boot-sequence SVG`.

---

### Task 7: §10.11 narrative

**Files:**
- Modify: `docs/architecture/10-key-design-decisions.md` (append after `### 10.10 …` — additions only)

**Interfaces:**
- Consumes: the existing 10.x Problem → Choice → Alternatives → Cost house style (read 10.3 and 10.4 as models); anchors `#172-the-layout-system` etc. from the contract (§17 may still be in-flight — link anyway, Task 8 verifies).
- Produces: `### 10.11 Continuous UI without fighting the framework` (exact contract heading) that §17's intro links to.

- [ ] **Step 1: Research.** Read `docs/architecture/10-key-design-decisions.md` in full (match voice, length ~10 lines per narrative section, heading style); skim `LayoutMachine.ts`, `useFlipGrid.ts`, and `InhouseLayoutEngine.tsx`'s header comment for the three concrete exhibits to cite.
- [ ] **Step 2: Write 10.11** in the established format:
  - **Problem:** a permanently-animated HUD needs (a) per-frame values that can't afford render storms and (b) components that outlive their logical removal — a panel must keep existing while it transitions out, a strip must stay interactive while it glides shut. Transactional-store architectures with business logic embedded in components make both miserable: every continuous value becomes dispatched state; exit transitions fight the component lifecycle.
  - **Choice:** machines/presenters outside the framework (rxjs `scan` reducers exposed as streams — `createLayoutMachine`), dumb renderers (`InhouseLayoutEngine`), compositor-only CSS for steady-state motion (`docs/performance.md`), registries as the UI↔engine seam. The store may be redux-*shaped* (LayoutMachine's reducer) but the *surface* is a stream, so render granularity belongs to the renderer.
  - **Alternatives considered:** redux with logic-in-components; animation libraries driving React state per frame; layout kept in component state (exit transitions then need ghost-component hacks).
  - **Cost:** indirection (two packages to touch per shell feature), one honestly-named framework-coupled file (`InhouseLayoutEngine.tsx:26-31`), and the discipline taxes §12's gates 26–33 enforce.
  - One wry sentence maximum on the "rethinking best practices" irony (the colocate-everything argument): this shell's power comes from the opposite discipline. Not polemical.
  - Cross-link §17 (`17-web-client-up-close.md#17-the-web-client-up-close`) as the mechanism-level evidence.
- [ ] **Step 3: Link-check.** `pnpm check:doc-links` — if §17 subsection anchors are still placeholders from Task 1, they resolve already (headings exist from the scaffold).
- [ ] **Step 4: Report** for commit: `docs(web-client): §10.11 continuous-UI decision narrative`.

---

### Task 8: Wiring + full verification

**Files:**
- Modify: `docs/architecture.md` (TOC + "How to read this")
- Modify: `packages/client-react/README.md` (additions only)
- Verify: everything

**Interfaces:**
- Consumes: the complete §17 file, both SVGs, 10.11 — all contract anchors live.
- Produces: the PR-ready branch.

- [ ] **Step 1: Hub TOC.** In `docs/architecture.md`, after the `16. [Trailheads]` entry add:

```markdown
17. [The Web Client, Up Close](architecture/17-web-client-up-close.md)
   - [17.1 The Component Tree and the Provider Stack](architecture/17-web-client-up-close.md#171-the-component-tree-and-the-provider-stack)
   - [17.2 The Layout System](architecture/17-web-client-up-close.md#172-the-layout-system)
   - [17.3 The Motion Toolbox](architecture/17-web-client-up-close.md#173-the-motion-toolbox)
   - [17.4 The Boot Splash](architecture/17-web-client-up-close.md#174-the-boot-splash)
   - [17.5 The Session Lock](architecture/17-web-client-up-close.md#175-the-session-lock)
```

- [ ] **Step 2: Reading guide.** In the same file's "How to read this": extend the **New here?** path's final sentence with a pointer — after the package-README sentence, append: `If you work on the web client's shell — layout, animation, boot, lock — finish with [The Web Client, Up Close](architecture/17-web-client-up-close.md).` (One sentence; do not restructure the paths.)
- [ ] **Step 3: README pointers.** In `packages/client-react/README.md`, additions ONLY (verify afterwards: `git diff --stat packages/client-react/README.md` shows `0 deletions(-)`): add a "deep dive" pointer line to §17 where the folder map or See-also section makes it natural — at minimum one entry in the See-also list (`- [§17. The Web Client, Up Close](../../docs/architecture/17-web-client-up-close.md) — layout engine, motion toolbox, boot splash, session lock, up close`), plus (writer's judgment) per-row pointers from the `shell/layout`/`motion`/`boot`/`lock` folder-map rows to the matching 17.x anchors.
- [ ] **Step 4: Confirm §16 nav** (added in Task 1) links forward to §17 and §17's nav line links back — fix if either is missing.
- [ ] **Step 5: Full verification.**
  - `pnpm check:doc-links` → expected: green, link count grown from the 327 baseline.
  - `git diff --stat origin/main -- 'packages/client-react/README.md'` → 0 deletions.
  - `git diff --name-only origin/main` → ONLY `docs/...` paths + `packages/client-react/README.md` (+ the spec/plan files committed earlier).
  - Full local gauntlet from the worktree root: `pnpm check:deps && pnpm --filter tests gates && pnpm exec biome ci . && pnpm eslint . && pnpm eslint . --config eslint.config.typed.mjs && pnpm check:scripts && pnpm knip && pnpm typecheck && pnpm test` (read results from the LOG, not `|| echo` exit codes). Docs-only changes should leave all green; actionlint is unaffected (no workflow changes).
- [ ] **Step 6: Report** for commit: `docs(web-client): hub TOC + reading guide + README pointers for §17`.

---

## Self-review notes (completed)

- **Spec coverage:** spec §3.1 (17.0→17.5) → Tasks 1–4; §3.2 (10.11) → Task 7; §3.3 wiring → Task 1 (§16 nav, moved earlier deliberately — the Atlas precedent puts the prev-file nav edit in the task that creates the target) + Task 8 (hub, README); SVGs → Tasks 5–6; spec §4 conventions → Global Constraints 1–7 verbatim; spec §5 ordering → "Task ordering" block; spec §6 acceptance → Task 8 Step 5 + per-task link-checks.
- **Placeholder scan:** the `*Written in a later task.*` placeholders are Task 1 deliverables consumed by Tasks 2–4, not plan gaps; no TBDs remain.
- **Consistency:** heading texts/slugs match the Anchor Contract everywhere they are cited (Tasks 1, 7, 8); SVG filenames identical in Tasks 2/4/5/6; commit prefixes uniform (`docs(web-client):`).
