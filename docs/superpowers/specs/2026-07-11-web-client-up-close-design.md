# §17 — The Web Client, Up Close

- **Date:** 2026-07-11
- **Status:** Approved (user-validated design, this session)
- **Phase:** 3 of the architecture-docs workstream. Phase 1 split the doc
  (PR #148); phase 2 added the Codebase Atlas §13–§16 + package READMEs
  (PR #151) and its enforcement follow-ups (PRs #154/#155).
- **Related:** [`docs/architecture.md`](../../architecture.md) (hub),
  [`docs/architecture/14-composition-and-wiring.md`](../../architecture/14-composition-and-wiring.md)
  (§14.1 already traces web boot wiring at composition level),
  [`docs/performance.md`](../../performance.md) (compositor rules — link,
  don't restate).

## 1. Problem

The Atlas (§13–§16) orients at package/module zoom. But the web client's
*shell* — the layout engine, the animation machinery, the boot splash, the
session lock — is where the genuinely non-obvious engineering lives, and
none of it is documented beyond one folder map in
`packages/client-react/README.md` and the §14.1 boot trace. The user's
driving questions, verbatim in scope:

- The architecture/hierarchy/wiring/mapping of the React components (at
  least the high-level ones, to the individual panels), contexts,
  providers — how they map to the visible UI.
- How `InhouseLayoutEngine`, `appPanelRegistry`, `appHeadRegistry`,
  `createDefaultLayoutPort`, `createLayoutMachine` work together.
- How the captivating/smooth animations are achieved (isotope/masonry-style
  grid glides, maximize/restore transitions).
- How the boot splash sequence works, what technology it uses, how it
  transitions to the live screen.
- How the session lock overlay works.
- The narrative thread: these things were nearly impossible in
  transactional-store architectures (redux) with business logic embedded in
  UI components — continuous animation caused render storms, and exit
  transitions fought component lifecycles. Separation of concerns is
  exactly what makes this shell possible; the doc must make that argument
  explicitly.

## 2. Goals / Non-goals

**Goals**

1. One new Atlas section, `docs/architecture/17-web-client-up-close.md`
   (user chose Option A: single file, five subsections), telling each
   subsystem as a **two-package story** — state machine/presenter in
   `client-core`, dumb renderer in `client-react`.
2. One new §10 decision narrative: *"Continuous UI without fighting the
   framework"* (Problem → Choice → Alternatives → Cost), carrying the
   redux contrast.
3. Wiring: hub TOC + reading-guide entry paths, §16 nav `next ▶`, pointer
   links from `packages/client-react/README.md` (additions-only).
4. Liberal diagrams incl. two new animated SMIL SVGs; all vertically
   composed per the CLAUDE.md "Markdown Diagrams" rules.
5. Every code claim verified against source with `file:line` refs.

**Non-goals**

- No code changes of any kind (docs-only PR; no golden churn possible).
- No restatement of `docs/performance.md` — §17.3 links to it.
- No RN coverage (its shell is already in §14.2; this section is the *web*
  deep dive) and no API-reference-style exhaustive prop tables — this is
  narrative mechanism documentation with verified pointers, in the Atlas
  voice.
- No duplication of §14.1: §17.1/§17.4 link to it for the composition-time
  wiring and stay at component/render level themselves.

## 3. Deliverables

### 3.1 `docs/architecture/17-web-client-up-close.md`

Heading: `# 17. The Web Client, Up Close`. Standard Atlas nav line
(`[◀ 16 — Trailheads](16-trailheads.md) · [Architecture Document](../architecture.md)`),
anchors verified with the real `github-slugger`.

**17.0 Framing intro (~2 paragraphs).** The shell is a permanently-animated,
continuous surface over a live stream. It is achievable because no business
or lifecycle state lives in React: machines and presenters own state
outside the framework; components are replaceable renderers. Each
subsection below ends with a one-line "payoff" cashing this out ("the strip
keeps existing while it glides shut because…"). Points to §10 narrative #11
as the long-form argument.

**17.1 The component tree and the provider stack.**
- `index.html` → `main.tsx` → `AppRoot`
  (`packages/client-react/src/AppRoot.tsx`): the lazy-`useRef` one-shot
  build — `createApp(buildBrowserPorts())` → `createViewModel(presenters,
  createMachineFactories(presenters), commands)` — and *why* a ref, not
  `useState`/`useMemo` (StrictMode double-invokes render bodies and
  initializers; a ref cell survives both invocations so `createApp` runs
  exactly once).
- Provider stack `ViewModelProvider > ThemeProvider > BootGate` and the
  reason for that nesting (ThemeProvider reads the theme preference through
  the ViewModel seam).
- `App.tsx`: six children — `AmbientBackground`, `HeaderChrome`,
  `WorkspaceEngine` (keyed by `activeTab`), `StatusBar`,
  `ConnectionOverlay`, `LockScreen` — and the observation that **the only
  shell-level `useState` is `activeTab`**; everything else arrives through
  the ViewModel seam.
- `WorkspaceEngine`: `useLayout(tab)` → `InhouseLayoutEngine` with
  `appPanelRegistry`/`appHeadRegistry`; the `key={activeTab}` remount
  semantics.
- Secondary contexts `FxViewProvider`/`CreditViewProvider` and a table:
  *provider → what it supplies → who consumes it*.
- Diagram: one tall Mermaid component tree, each box annotated with the
  screen region it owns (against the actual FX-tab layout).
- Cross-links: §14.1 for the composition sequence; the package README for
  the folder map.

**17.2 The layout system.** Told in data-flow order, the deep subsection:
- State model (`client-core/src/layout/`): `LayoutState` (`root` tree /
  `maximized` / `collapsed`), `LayoutNode` split-vs-panel recursion,
  `PANEL_SPECS` (titles; `maximizeScope: "nearest-column"` rail semantics;
  `maximizable: false` for the credit New RFQ head; the dormant `pinned`
  machinery — "unused by any default tree today"), `createDefaultLayoutPort`
  per-tab initial trees (`WorkspaceTab = fx | credit | admin | equities`),
  ratio `sizes` vs `fixedPx` vs `initialPx` design widths.
- `createLayoutMachine` (`client-core/src/presenters/LayoutMachine.ts`):
  five intents (`maximize/restore/collapse/expand/resize`) as Subjects →
  `merge` → `scan` over a pure immutable reducer → `@rx-state/core`
  `state()` with a warm subscription, disposed by completing the subjects.
  Framed explicitly as the "redux-shaped core, stream-shaped surface"
  exhibit: the reducer is transactional, but consumers get a stream, so
  *render granularity is the renderer's choice, not the store's*.
- `InhouseLayoutEngine`
  (`client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx`): the
  deliberately dumb recursive renderer and the app's **one
  framework-coupled spot** (its own header comment); `SplitNode` cells +
  `<hr>` handles vs hook-free `renderPanel` leaves; `appPanelRegistry`
  (PanelId → module root) and `appHeadRegistry` (per-panel head-slot
  overrides, e.g. the Live Rates tabs) as the UI↔engine seam;
  `PanelErrorBoundary` as the per-panel blast-radius wall.
- The smooth-animation mechanics, each with its payoff line:
  - Maximize as *render-time policy*: `maximizeBoundaryPath` +
    `strippedByMaximize` recomputed per render — root scope strips the
    whole dock, `nearest-column` strips only column siblings (rail
    semantics); nothing is stored but `maximized: PanelId`.
  - Strip orientation propagation (`stripDir` inheritance,
    `data-strip-fill`) — why a collapsed rail's strips stack correctly.
  - Geometry as CSS custom properties (`--split-size`/`--split-fixed` →
    `flex-grow`), state as semantic `data-*` — so maximize/restore/collapse
    glides are **pure CSS transitions on attribute flips; no JS animation**.
  - The pointer-drag resize: pointer capture, measured-fraction baselines
    (`measuredFractions`) for `initialPx` splits, and the reducer clearing
    `initialPx` on first resize (a design-width rail becomes a plain ratio
    split forever after).
  - The imperative `container.dataset.dragging` suppression — why it must
    bypass React state (a mid-drag re-render would clobber it and re-enable
    the glide transition, which animates the same `flex-grow` property the
    drag continuously retargets).
- Diagrams: a layout-tree → DOM/cells mapping (Mermaid, vertical), plus
  **animated SVG #1**: a miniature 3-panel dock cycling
  maximize → strips → restore.
- Cross-links: interfaces doc §5 (the framework-coupled spot),
  `maximizeBoundary.test.ts` / `LayoutMachine.test.ts` as executable spec.

**17.3 Motion & animation — the toolbox.** Organized as *four techniques
and when each is chosen*:
1. CSS transitions on `data-*` flips (layout glides, most state effects) —
   the default, and why (compositor-friendly, interruptible for free).
2. `useFlipGrid` (`client-react/src/ui/shell/motion/useFlipGrid.ts`): FLIP
   (First-Last-Invert-Play) over **raw WAAPI** (`Element.animate`) for
   keyed-grid reorders — the Live Rates "masonry" glide and credit RFQ
   cards; register/measure/invert/play flow; the ResizeObserver
   origin-refresh; the mid-glide re-snapshot guard
   (`getBoundingClientRect` includes in-flight transforms); why raw WAAPI
   beats the Motion One wrapper here (per-item, per-layout frequency).
   `useRankGlide` (equities watchlist) as the 1-D sibling.
3. The `animateOnce` Motion One wrapper
   (`client-react/src/ui/shell/motion/index.ts:10`) for one-shot
   entrances.
4. `AnimationDirector` (`client-core/src/presenters/AnimationDirector.ts`):
   choreography as a *presenter* sourced from sibling presenters' streams
   (§14.1 step 3) — animation triggers are business events, not component
   effects.
- Cross-cutting: the shared `prefers-reduced-motion` seam (useFlipGrid,
  BootGate/BootSequence) and a link to `docs/performance.md` for the
  compositor rules all of this obeys. A short pointer to §15's flows for
  where these animations sit in the user journeys. Diagram: a FLIP timeline
  (measure → invert → play) — static SVG or Mermaid, vertical.

**17.4 The boot splash.** Pipeline order:
- `shouldPlayBootSplash()` (`client-react/src/bootSplashGate.ts`):
  suppressed under `navigator.webdriver` (Playwright/Cypress) and
  `?nosplash`; lives in the composition layer because it reads
  `navigator`/`window.location` (dumb-UI constraints).
- The port seed → `BootGatePresenter` one-shot
  (`ports.bootSplash?.shouldPlay()` evaluated once at composition,
  §14.1) → `BootGate` (`ui/shell/boot/BootGate.tsx`): **always mounts its
  children** — the real `<App/>` mounts warm underneath, streams already
  flowing — and only overlays the splash while `visible` is true. The
  payoff: dismissal reveals an already-live app; no pop-in.
- `BootSequence` (`ui/shell/boot/BootSequence.tsx`) + machine
  (`machineFactories.boot`): the answer to "what technology?" — a **plain
  2D-canvas `requestAnimationFrame` loop**; pure per-frame draw functions in
  `bootCanvas.ts` (globe → laser-drawn panels → docking rects,
  `BOOT_DURATION_MS = 4200`, ported verbatim from the prototype), theme
  accents read from CSS custom properties at start; SKIP control; the
  reduced-motion and no-2d-context (jsdom) early-outs.
- Dismissal: `onTransitionEnd`/reduced-motion path → `dismiss()`; the
  AccountMenu "⟳ Reboot HUD" row re-raises the gate.
- **Animated SVG #2**: boot-phase timeline over the warm app (overlay
  dismissing to reveal live panels).
- Cross-link: §14.1 steps 5–7 (this subsection zooms into the same events
  at render level).

**17.5 The session lock.** Shortest subsection; closes the overlay-pattern
loop:
- `SessionPresenter` (`client-core/src/presenters/SessionPresenter.ts`)
  owns locked/user state (`BehaviorSubject<boolean>` + static operator
  identity; `unlock()` "re-authenticates" — no real auth, it clears the
  lock). Lock is triggered from the AccountMenu's lock row through the
  `useSession` seam (`ui/shell/chrome/AccountMenu.tsx:27`).
- `LockScreen` (`ui/shell/lock/LockScreen.tsx`): renders `null` unless
  locked — a render-nothing-unless overlay, dumb, all state through
  `useSession`; the `BiometricChannel`/`BiometricDots` theatrics and the
  AUTHENTICATE → `unlock` intent flow; `HudLogo` reuse.
- Payoff line: same shape as BootGate — state outside, dumb overlay inside;
  a third client (SolidJS) reimplements only the JSX.

### 3.2 §10 narrative #11 — `docs/architecture/10-key-design-decisions.md`

*"Continuous UI without fighting the framework"*, in the established
Problem → Choice → Alternatives → Cost format (match the existing
narrative numbering/heading style in the file):

- **Problem:** a permanently-animated HUD needs (a) per-frame values that
  can't afford render storms, and (b) components that outlive their logical
  removal — a panel must keep existing while it transitions out, a strip
  must stay interactive while it glides shut. Transactional-store
  architectures with business logic embedded in components (the redux
  experience the team remembers) make both miserable: every continuous
  value becomes dispatched state, and exit transitions fight the component
  lifecycle.
- **Choice:** machines/presenters outside the framework (rxjs `scan`
  reducers exposed as streams), dumb renderers, compositor-only CSS for
  steady-state motion, registries as the UI↔engine seam. The store may be
  redux-*shaped* (LayoutMachine's reducer) but the *surface* is a stream,
  so render granularity belongs to the renderer.
- **Alternatives:** redux + logic-in-components (rejected on the memory
  above); animation libraries driving React state per frame (render
  storms); keeping layout in component state (exit transitions impossible
  without ghost-component hacks).
- **Cost:** indirection (two packages to touch per feature), the one
  honestly-named framework-coupled file (`InhouseLayoutEngine`), and the
  discipline taxes the gates enforce (§12, gates 26–33).
- May reference the "rethinking best practices" irony the user named: the
  talk argued for colocating everything in components; this shell's power
  comes from the opposite discipline. Keep it to a sentence, wry not
  polemical.

### 3.3 Wiring

- Hub `docs/architecture.md`: TOC entry for §17; "How to read this" entry
  paths updated where §17 is a natural stop (e.g. the "New here" path gains
  "…then §17 if you work on the web shell").
- `docs/architecture/16-trailheads.md`: nav line gains a forward link to
  `17-web-client-up-close.md`; §17's nav points back.
- `packages/client-react/README.md`: additions-only pointer(s) to §17 from
  the relevant folder-map rows (shell/layout/engine, shell/motion,
  shell/boot, shell/lock) or a single "deep dive" line — writer's choice,
  **zero deletions** (verify with `git diff --stat`).
- New SVGs live in `docs/architecture/` next to the existing ones
  (`tick-journey.svg` precedent), named `17-layout-maximize.svg` and
  `17-boot-sequence.svg`.

## 4. Conventions (binding on every writer/reviewer — quote these in briefs)

1. **Diagram width** — from CLAUDE.md, verbatim: "GitHub (and most md
   viewers) scale every diagram down to column width, so **horizontal space
   is the scarce resource — vertical scroll is free**. Compose diagrams
   tall, not wide: ≤4–5 sibling boxes per rank, split anything wider, stack
   parallel lanes vertically. Mermaid trap: **edge-less subgraphs tile
   side-by-side** — connect them with real edges or force vertical stacking
   with invisible links (`laneA ~~~ laneB`). Sequence diagrams get wide
   fast: keep participants ≤6 or split the scenario."
2. **Anchors** — verify every heading slug with the real `github-slugger`
   (ESM-only: `import S from 'github-slugger'`); ` -- ` slugs to FOUR
   dashes, ` & ` to two. `pnpm check:doc-links` gates every relative link +
   anchor.
3. **Animated SVGs** — committed SMIL SVGs render/play inline on GitHub;
   loop with `dur` + `repeatCount="indefinite"` + `keyPoints`/`keyTimes`
   (absolute `begin` times fire only once). Render-test frames headlessly
   with the primary checkout's `playwright-core`. Dark-theme-safe
   self-contained colors.
4. **Code claims** — every factual claim about code carries a `file:line`
   ref verified against THIS worktree's source at writing time. No
   fictionalized counts, names, or signatures. Task reviewers independently
   re-verify 5–30 claims per task.
5. **Terminology** — ViewModel seam vocabulary (`useViewModel`,
   `createViewModel`, ViewModelProvider), never the retired
   hooks-era names (`useHooks`/`AppHooks`/`HooksProvider`).
6. **Mermaid validation** — every block through the Mermaid MCP validator;
   pipe labels containing `()` must be quoted; prefer flowcharts with
   `classDef` + saturated self-contained fills readable on BOTH GitHub
   themes.
7. **Atlas voice** — narrative mechanism documentation with pointers, not
   API reference; anti-drift: no exhaustive per-file inventories.

## 5. Execution shape

SDD (subagent-driven) in this worktree, as the Atlas round, with its
recorded lessons applied:

- **Serialized content tasks** on the single §17 file (same-file contention
  ban): T1 scaffold + 17.0/17.1 → T2 17.2 → T3 17.3 → T4 17.4 + 17.5.
- **Parallel-safe side tasks** (distinct files): T5 SVG #1 (layout), T6
  SVG #2 (boot), T7 §10 narrative #11. May run alongside the content chain.
- **T8 wiring + link pass** last: hub TOC, §16 nav, README pointers,
  `check:doc-links`, full gauntlet.
- Implementers do NOT run git (no commit, **no `git stash`**); the
  controller commits path-scoped per task. Absolute target paths in every
  dispatch; controller checks the primary checkout's `git status` after
  haiku tasks.
- Per-task adversarial reviewers verify code claims against source; final
  whole-branch opus review; one fix-wave subagent for all findings.
- PR for user review before merge (user-live-review policy for doc rounds).

## 6. Acceptance criteria

1. `pnpm check:doc-links` green (baseline: 327 links / 110 files, will grow).
2. Full local gauntlet green: `check:deps`, gates, `biome ci`, both ESLint
   configs, actionlint, `check:scripts`, knip, typecheck, test.
3. All Mermaid blocks validate; both SMIL SVGs loop and render-test clean
   on light + dark.
4. Every code claim spot-checkable: reviewer re-verification finds zero
   fictionalized facts at final review.
5. `packages/client-react/README.md` diff shows insertions only.
6. No changes outside `docs/` + that README (docs-only PR; zero golden
   churn by construction).
7. §17 answers, in prose a newcomer can follow, each of the user's driving
   questions in §1 of this spec.
