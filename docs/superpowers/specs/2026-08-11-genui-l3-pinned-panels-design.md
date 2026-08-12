# GenUI L3 — Pinned Panels + Workspace Persistence (Design)

**Date:** 2026-08-11
**Workstream:** Jarvis generative UI, L3 (docking + persistence) — the third
rung of the round-1 ladder (L1–L2 shipped 2026-08-05, PR #488). Delivered on
the **in-house layout engine**, not Dockview: a 2026-08-11 exploration
established that ADR-002's "Dockview first" gate was stale — the ADR predates
the shipped split-tree engine, whose thin-port migration would *lose* six
bespoke capabilities while L3 needs none of Dockview's unique value
(user drag-rearrange/tabs/pop-out). This round also rewrites ADR-002 to match
reality (§8).

## 1. Goal

A Jarvis-generated panel can be **pinned into the workspace** — it stops
floating, becomes an ordinary tile beside Live Rates and the blotter, and
**survives reload**: per-tab layout state and pinned panels persist across
sessions and rehydrate their live streams from their declarative specs.

## 2. Decisions (settled during brainstorm, 2026-08-11)

- **Host: the in-house engine.** No new dependency; every bespoke capability
  (nearest-column maximize, collapse strips, px rails, drive semantics,
  static roster gate) is kept. Dockview remains a recorded alternative-engine
  option (§8), not a prerequisite.
- **Dock target: the active tab's rightmost pinned column.** Pinning inserts
  into (or creates) a dedicated rightmost column in the active tab's tree —
  where the floating layer already visually lives. Multiple pins stack in
  that column. No placement UI this round.
- **Persistence: full workspace + pinned panels.** Per-tab `LayoutState`
  (splits, resizes, collapse, rails) AND pinned panels' `PanelSpecV1`s
  persist; a "Reset workspace layout" preference row restores defaults.
- **Unpin → floats again; close → gone.** Pinning is reversible: unpin
  returns the panel to the floating layer (under its existing 4-panel
  cap/evict policy); close removes it entirely.
- **Drive vocabulary grows: `dockPanel` / `undockPanel`.** "Pin that
  volatility panel" works end-to-end; the persona learns the ops.

## 3. Panel location is a property (`JarvisPanelsMachine`)

Each live panel gains `docked: boolean` (default false):

- **`pinPanel(panelId)`** — sets `docked`; the panel leaves the floating
  layer and stops counting toward `MAX_LIVE_PANELS`; the layout machine is
  told to insert it (§4).
- **`unpinPanel(panelId)`** — clears `docked`; the panel rejoins the
  floating layer subject to the existing cap policy (cap full → the existing
  oldest-evict rule applies to the floating set); the layout machine removes
  its leaf.
- **`dismissPanel(panelId)`** — unchanged contract, works in either state;
  when docked it also removes the leaf.
- Restyle-by-id (`targetPanelId` edits) keeps working in either state — the
  spec updates in place, the host doesn't care.

Both intents are idempotent no-ops on unknown ids or same-state calls.

## 4. Two tree mutations (`LayoutMachine`)

- **`insertPanel(panelId, title)`** — if the active tree already has the
  pinned column (identified structurally: the rightmost root-row child that
  this feature created — tracked by a `pinnedColumn` marker in serialized
  state, not by magic ids), stack the new leaf into it (column split, equal
  fractions). Otherwise create the column as a new rightmost root child with
  `initialPx` ≈ 360 (consistent with the design rails: px-fixed until first
  drag, then fractional). If the root is not a row split, wrap it in one.
- **`removePanel(panelId)`** — remove the leaf; prune degenerate splits (a
  single-child split collapses into its parent; an empty pinned column
  disappears; `sizes` renormalize). Restores the exact pre-insert tree when
  the last pinned panel leaves.
- Pinned leaves are ordinary leaves afterwards: maximize (default `"root"`
  scope), collapse-to-strip, resize all inherit with zero new code.
- The static world is untouched: `LAYOUT_PANEL_IDS`, `DESK_PANEL_ROSTER`,
  the roster-conformance test, and the persona's static roster stay exactly
  as shipped — pinned ids form a separate **live** set exposed as an
  observable for the drive layer's membership checks (§6).

## 5. Dynamic content + header resolution

- The engine's `panelId → renderer` lookup gains a fallback: ids not in the
  static registry resolve through a **dynamic registry** fed by the panels
  machine — rendering the same `composePanelStream` interpreter output as
  the floating layer (one renderer, two hosts).
- Head slots likewise: a shared `JarvisPanelHead` provides the docked
  header controls — **unpin** and **close** (testids
  `jarvis-panel-unpin` / `jarvis-panel-close`); floating panel chrome gains
  the **pin** control (`jarvis-panel-pin`).
- `PanelSpec` (layout vocabulary) for a pinned leaf derives `{id, title}`
  from the generated `PanelSpecV1`'s title.

## 6. Drive vocabulary: `dockPanel` / `undockPanel`

- Additive `DriveCommandV1` kinds: `{kind: "dockPanel", panelId}` and
  `{kind: "undockPanel", panelId}` — enums/schema derive from the same
  const arrays as the existing ten kinds.
- `JarvisDriverMachine` routes them to `jarvisPanels.pinPanel/unpinPanel`,
  membership-checked against the **live minted-id set** (the same check
  `dismissPanel` informally relies on becomes explicit) — a hallucinated id
  yields a `skipped` outcome with reason, partially addressing the ledgered
  GenUI-R1 `targetPanelId` correction-signal finding at the client side.
  (The wire-side gap — outcomes never reach the model — remains open and
  ledgered; unchanged by this round.)
- The persona gains one sentence + one worked example ("pin that panel" →
  `dockPanel` with the panel's id); example-count pins update (drive
  examples 3→4, total 5→6); the 3600 length guard is re-measured and raised
  only if genuinely needed (same deliberate-raise rule as the last round).
- The `layout` command's membership gate widens: `maximize`/`collapse`/etc.
  on a *pinned* panel id is legal (checked against static ∪ live ids).

## 7. Persistence

- **One new domain preference:** `workspaceLayoutV1?: string` — deliberately
  an **opaque string**; `@rtc/domain` learns no layout types. Known blast
  radius of a preference addition (~10 sites: adapters × clients, contract,
  presenter, both bindings, ui-contract fixtures) is planned into the tasks.
- **Payload** (client-core owns the schema):
  `{v: 1, tabs: Record<WorkspaceTab, {layout: LayoutState, pinned: readonly {panelId: string, spec: PanelSpecV1}[]}>}`.
  Serialized on a debounced write when layout or pinned state changes;
  validated on load by a hand-rolled structural walk (the
  `parseDriveBatch`/`parsePanelSpec` precedent). **Any** validation failure
  → silent fall back to defaults (no error surface, no partial application).
- **Rehydration at boot:** pinned specs re-enter the panels machine as
  docked panels and re-run `composePanelStream` against live ports — a
  restored panel is immediately live, not a snapshot. A spec referencing
  symbols that no longer exist degrades exactly as a fresh panel would
  (interpreter's existing total-function guarantees).
- **Reset:** a "Reset workspace layout" row in the Preferences modal clears
  the preference and resets all four tab machines + docked panels to
  defaults (testid `pref-reset-workspace-layout`).

## 8. ADR-002 rewrite (in-round docs task)

Status → **Superseded in part (2026-08-11)**. The rewrite records: the
in-house split-tree engine IS the layout system (the ADR's `Workspace.tsx`
world no longer exists); the real swap seam is the machine + engine-view
pair, not a thin opaque-blob port; persistence landed as an opaque
preference (this spec), satisfying the ADR's persistence goal without the
blob port; Dockview remains a recorded **alternative engine** whose honest
adoption cost is the six capability mappings + the full `app/*` golden fork
(citing the 2026-08-11 exploration); the custom free-float engine remains a
future experiment against the same machine seam. The replaceability-matrix
row updates accordingly.

## 9. Testing (no Anthropic API calls in CI, as ever)

- **Unit (client-core):** insert/remove table tests (column creation,
  stacking, pruning, renormalization, exact pre-insert restoration,
  idempotence); persistence round-trip + corrupt/truncated/version-mismatch
  fallback; docked-flag transitions incl. floating-cap interplay (pin frees
  a slot; unpin under full cap evicts per existing policy); driver
  dock/undock routing + live-membership skip reasons.
- **Contract (`@rtc/ui-contract`, swap-trio, both clients):** pin →
  panel appears docked with unpin/close head controls and leaves the
  floating layer; unpin → floats again; close → gone; drive `dockPanel` /
  `undockPanel` end-to-end; persistence round-trip through the world's fake
  preferences (mount → pin → unmount → remount → rehydrated); reset row.
- **Visual:** one new scenario — fx with one pinned panel docked in the
  right column — both golden sets regenerated by the usual dispatch.
- **E2e (jarvis suite, both clients):** author a panel → pin →
  `page.reload()` → the panel rehydrates docked and live — the strongest
  persistence witness; unpin → returns to floating layer.
- **Persona:** example-count and (if raised) length-guard pins update.

## 10. Out of scope (recorded)

- User drag-rearrange of panels (next round — in-house extension or
  Dockview adoption per §8's honest costing).
- Dockview itself; L4 multi-panel linked dashboards; pop-out OS windows.
- RN surfaces (joins the RN Jarvis backlog).
- Cross-device layout sync (needs Auth Phase 2 per-user accounts).
- The drive correction-signal **wire** change (client-side membership skips
  only; still ledgered).

## Implementation addendum (2026-08-11)

Shipped: T1–T10 complete, reviewed, gates green; ADR-002 rewritten (§8,
`docs/adr/ADR-002-layout-management-port.md`). This addendum records what
shipped **differently** than this spec's original text, and why — plan-time
deviations first, then rulings made during the round.

**Plan-time deviations (ruled before implementation, from the fact-sheet audit):**

1. **Vocabulary is `docked`/`dock`, never `pinned`/`pin`,** in all code and
   testids (`jarvis-panel-dock`/`-undock`) — `PanelSpec.pinned` already meant
   "fixed bottom strip." Human-facing copy may still say "Pin"/📌.
2. **Docked panels get their own global cap, `MAX_DOCKED_PANELS = 4`** — the
   presenter holds one uncapped warm subscription per live panel; a dock at
   cap is a UI-disabled no-op (drive op → `skipped`, reason `"dock full"`).
3. **The floating evict rule needed an explicit rewrite**, not reuse —
   `applyPanelEvent` now filters on `!docked` before counting/evicting.
4. **`specs`/`headRegistry` became threaded props**, not module defaults —
   both clients pass merged static+dynamic registry/specs/headRegistry; the
   engine itself stayed untouched.
5. **The persistence writer is lazy by construction** — no eager
   `combineLatest` over all four tabs; `layoutFor` registers each machine's
   `state$` as it's created, and a never-opened tab keeps its stored value.
6. **Contract-tier rehydration is witnessed on a fresh `World`**, not a
   same-world remount (which reuses WeakMap-cached machines and proves
   nothing) — a new `World` field + 23rd `createWorld` param.
7. **`workspaceLayoutV1` is the repo's first optional string preference** —
   `workspaceLayout$(): Observable<string | null>` /
   `setWorkspaceLayout(value: string | null)`, storage-guarded to
   `typeof value === "string"`, real validation left to the client-core
   parser; all adapters + simulator + port contract follow the pattern.
8. **The persona guard was raised 3600 → 3800** (measured 3695, not the
   ~3650–3700 estimated at plan time).
9. **A new `PrefAction` row component** was added to both clients — no
   action-row precedent existed in the Preferences modal.
10. **Reset semantics**: clear the preference, reset every *created* layout
    machine to its default (new `reset()` intent), and dismiss all docked
    panels; floating panels are untouched.

**In-round rulings (from the SDD ledger, `.superpowers/sdd/2026-08-11-genui-l3-pinned-panels/progress.md`):**

- **`insertDockedLeaf` takes a `staticIds` param** — ruled justified: the
  FX/equities rails are structurally identical to the dock column, so the
  insert path needed to know which leaves are static vs. dynamic.
- **`staticIds`/`reset()` derive from `port.initial`, not the persisted
  seed** — the persistence task keeps the machine's default-tree identity
  separate from any rehydrated state, so a restored docked leaf is never
  misclassified as static and `reset()` never returns the saved layout.
- **The dismiss bridge detaches the leaf directly**, rather than routing
  through undock-first — undocking would incorrectly evict an unrelated
  floating panel.
- **The persistence parser reconciles the tree against the docked list**,
  enforcing the global `MAX_DOCKED_PANELS` cap and a tree depth bound, and
  falls back to defaults on anything corrupt, truncated, or
  version-mismatched.
- **The composition dock bridge guards against a wire `panelId` shadowing a
  static panel** via the registry merge (which would otherwise null the
  persistence payload). Residual, ledgered for a future round: driver
  `dockPanel` still reports `"applied"` for that same static-id collision
  while composition silently no-ops — a 5th skip reason is needed; this
  round's `DriveCommand` result type pinned exactly 4.
- **Solid's registry memos are keyed by an id-set with a custom equals**,
  not a plain object/string key — fixes a Critical where merged
  registry/headRegistry object churn remounted every Solid workspace panel
  on any panels-machine emission (React was immune; Solid has no VDOM
  reconciliation over that shape). A genuine dock/undock still remounts
  every mounted leaf in the tab (membership change re-keys by design) —
  disclosed and accepted.
- **Docked-body contract witnesses** were added after review found the
  contract tier only ever asserted a docked panel's *head* controls — a
  dead body stream would have passed the gate; both the drive-op spec and
  the fresh-world rehydration spec now assert the live body too.
