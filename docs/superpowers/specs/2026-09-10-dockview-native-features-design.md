# Dockview-Native Features — Design

**Date:** 2026-09-10
**Status:** Approved (scope confirmed by the user 2026-09-10)
**Prerequisite state:** Dockview↔in-house parity complete — PRs #534→#676, all
recorded engine residuals retired (ADR-002). Engine parity p50 0.0003 on the
shared layout subset.

## 1. Intent

Introduce and use each of Dockview's native capabilities that the in-house
layout engine structurally cannot express — drag-and-drop rearrangement, tab
stacks, panel close/reopen, dynamic panel instances, pop-out windows, floating
groups, and layout presets — **while keeping the in-house engine**, and
**accepting the resulting feature disparity** between the two engines.

Two motivations, in order:

1. **Product**: pop-out tear-out tiles are the reference ReactiveTraderCloud's
   signature multi-monitor capability, and DnD/stacks/dynamic panels are the
   standard trading-desk workspace vocabulary. This closes the last capability
   gap with the reference app.
2. **Architecture showcase**: the parity workstream proved Dockview can emulate
   in-house semantics over machine intents (collapse/maximize as strips). This
   workstream proves the mirror image — the in-house engine *projecting away*
   what only Dockview can express — and demonstrates that the layered
   state/persistence architecture absorbs a hard asymmetric-capability problem
   without restructuring.

If the Dockview-native experience proves out, the in-house engine is a likely
future retirement candidate — **but not in this workstream**. Nothing here may
degrade the in-house engine's current behaviour.

## 2. The disparity doctrine

Layout state is a three-layer stack; the layers have different owners and
different cross-engine semantics. This doctrine is the whole design — every
phase is an application of it.

| Layer | Owner | Cross-engine behaviour |
|---|---|---|
| 1. Seed tree | code, per tab | both engines render it (baseline) |
| 2. Semantic layout state | client-core machine, persisted app state | **round-trips by construction** — both engines replay the same intents; today: `collapsed`/`maximized` panelIds |
| 3. Geometry + arrangement | Dockview's opaque blob (+ sidecars), engine-private | **projected, never converted** — invisible under in-house, untouched on switch, restored intact on switch-back |

Rules:

- **Lift the semantic core of a feature into layer 2 only where the machine
  already has the shape** (a set of closed panelIds, an open-instances list, a
  popped-out flag). The arrangement *tree* itself (which slot holds which
  panel, stack membership) stays in layer 3 — Dockview-private — because
  lifting it would force the in-house engine to grow dynamic-tree rendering,
  which contradicts "accept the disparity, don't grow in-house".
- **Conversion is a projection, not a migration.** Switching Dockview →
  in-house shows the seed tree + layer-2 state; the blob is not rewritten.
  Switching back restores the rich layout. Lossy on screen, lossless on disk.
- **In-house projection rules** per feature are defined in §4. Any blob
  construct with no projection rule degrades that region to seed — the
  existing fall-back-to-seed net generalises; a blob never bricks anything.
- **The parity gate's scope freezes at the shared subset.** The
  `visual:engine-parity` twins keep asserting seed-derived layout states only;
  user-shaped (dragged/stacked/popped) layouts are deliberately outside the
  golden matrix. Disparity in *capabilities* is accepted; regression in the
  *shared subset* is not.
- **Both web clients move together.** Every UI addition ships in React and
  Solid with the usual trios (contract specs via the swap-trio, visual
  scenarios for resting UI states, e2e where interaction warrants it).

## 3. Feature phases

Phases are dependency-ordered; each is a separate plan
(`docs/superpowers/plans/`) written when the phase starts, executed under the
usual worktree/PR/CI discipline. Phase 1 begins with a measured audit — its
plan is written from the audit's findings, not before.

### Phase 1 — Drag-and-drop rearrangement (audit → bless)

Dockview's tab is natively a drag surface and nothing in `createDockEngine`
disables DnD, so dragging likely half-works today — unaudited. This phase
makes it a supported feature.

- **Audit first (measured, not assumed):** what happens today when a tab is
  dragged — allowed drop zones, interplay with design pins (#656 already
  tests group-membership dissolution), strips (#629/#648 records keyed by
  panelId), maximize policy, the `preStripWorlds` ledger (#673), the
  `rtcStripGeometry` sidecar (#670), glide transitions (#602), and blob
  persistence of the rearranged tree. Both clients; StrictMode rebuild path
  included.
- **Bless:** decide allowed drops (split left/right/up/down + centre-stack),
  fix what the audit breaks, add engine jsdom tests per interplay, and an e2e
  drag scenario per client.
- **Persistence:** the blob already serialises arbitrary trees; sidecar keys
  are panelIds, which survive moves. Migration risk is zero (no format
  change).
- **In-house projection:** none needed — arrangement is layer 3; in-house
  keeps rendering the seed.

### Phase 2 — Tab stacks

Centre-drop stacking from Phase 1, made first-class.

- The engine already tolerates multi-tab groups (collapse ejects the named
  panel into its own group precisely because groups hold several tabs);
  `mountTab` portals the shared `PanelHead` per tab.
- Work: per-tab head styling in `dockview-hud.css` for the stacked case
  (active vs inactive tab chrome per skin), collapse/maximize semantics for a
  stacked group (collapse names a PANEL — the eject rule already encodes
  this), tests.
- **In-house projection:** none — stacks are layer-3 arrangement.

### Phase 3 — Panel close / reopen

The first layer-2 lift, and the first feature BOTH engines honour.

- client-core layout machine gains a persisted `closedPanelIds` set +
  close/reopen intents.
- Dockview: close = `removePanel` (blob follows); reopen = re-add at the
  seed-home position.
- **In-house projection: honours it natively** — renders the seed tree
  without the closed leaves (expressible today; siblings absorb the space by
  flex).
- Shell UI: a "View" menu in the app head listing closable panels with
  checkmarks — both clients, contract + visual scenarios (resting states with
  a panel closed join the golden matrix as twins, since both engines express
  them — the shared subset grows here).

### Phase 4 — Dynamic panel instances

Multiple live instances of one panel kind (e.g. several order tickets or
per-pair chart panels).

- client-core gains an open-instances list (instanceId → panel kind +
  params) in layer 2; the panel registries learn instance-keyed mounting.
- Dockview: `addPanel` at a chosen position.
- **In-house projection:** extra instances fold into a fallback stack region
  (or the phase's mini-spec decides in-house simply caps at the seed set —
  disparity accepted).
- **Gated on a product mini-spec:** which panel kinds may multiply, with what
  parameters, and where new instances land. Written at phase start.

### Phase 5 — Pop-out windows (flagship)

Tear a group out into a separate browser window (`addPopoutGroup`) — the
reference app's signature feature.

- Hard parts, called out now: theme/skin CSS injection into the child
  document; the bridges portal client content into engine-owned DOM and that
  machinery must survive a document boundary (React `createPortal` into
  another document works; the Solid portal equivalent needs a spike);
  devtools/BroadcastChannel and power-saver gates in the child window;
  window lifecycle (close → dock home).
- Layer 2 lift: a `poppedOutPanelIds` flag set — **session-scoped, not
  persisted** (a reload does not reopen windows; the panels restore docked at
  home). This dodges the whole popout-persistence problem deliberately.
- **In-house projection:** popped-out panels render docked at their home
  slot (i.e. the flag is ignored — it is session state Dockview alone acts
  on).
- Begins with a feasibility spike (one panel, one skin) before its plan.

### Phase 6 — Floating groups + layout presets

- Floating groups: `addFloatingGroup` — cheap once Phase 5's chrome work
  exists; layer 3 only (the blob serialises floats).
- Presets: named save/restore of the Dockview blob ("Save layout" /
  "Restore" / "Reset to default" in the View menu). Reset = clear blob →
  seed. Layer 3 by definition; in-house's "Reset" is a no-op beyond layer 2.

## 4. Projection rules (Dockview → in-house), consolidated

| Construct | In-house shows | Mechanism |
|---|---|---|
| Rearranged splits | seed arrangement | layer 3 invisible; blob untouched |
| Tab stacks | seed arrangement | same |
| Closed panels | tree without those leaves | layer 2, honoured natively |
| Dynamic instances | fallback region or seed cap (Phase 4 mini-spec) | layer 2 list, projected |
| Popped-out panels | docked at home slot | layer 2 session flag, ignored |
| Floating groups | seed arrangement | layer 3 invisible |
| Presets | only "reset" has an in-house meaning | layer 3 |
| Unknown/unparseable region | seed | existing fall-back net |

Divergence while in-house is active: layer-2 edits (collapse, close,
maximize) flow to both engines; anything layer 3 remains last-writer-wins per
engine — the same already-shipped behaviour sash positions have today.

## 5. Testing & gates

- **Engine tests (jsdom)** per phase in `packages/layout-dockview` — the
  interplay matrix (pins × strips × maximize × new feature) is the core
  deliverable each time.
- **Contract specs** for every machine change, run against both clients via
  the swap-trio.
- **Visual goldens**: only *resting, seed-derivable* states join the matrix
  (e.g. "panel closed" twins in Phase 3, View-menu-open). User-shaped
  layouts stay out. Any scenario addition follows the 5-edit recipe + both
  golden sets, `-g` pattern equal to the workflow pattern.
- **e2e**: one Gherkin/Playwright drag scenario per client (Phase 1), popout
  smoke (Phase 5) if driver support allows — a popout is a real
  `window.open`, so Playwright's multi-page API applies.
- **Engine parity** report stays green on the shared subset throughout; its
  scope statement in ADR-002 is updated by this spec's doctrine.

## 6. Risks

- **DnD × strip machinery interplay** is the deepest unknown — records,
  worlds, sidecars, and pins are all keyed on panelIds inside a geometry that
  drags now mutate. The Phase 1 audit exists to measure this before
  designing.
- **Popout document boundary** for the Solid portal path is unproven — hence
  the Phase 5 spike.
- **Golden-matrix growth**: Phase 3 adds twin scenarios; keep the count
  deliberate (one closed-panel state per app tab, not a combinatorial
  sweep).
- **In-house must not regress**: every phase's PR runs the full in-house
  visual assert locally before merge (the #664 lesson — it is a measurement,
  not a judgement).
