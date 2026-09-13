# Dockview Pop-Out Windows (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tear a panel's group out into a separate browser window under the
Dockview engine — the reference ReactiveTraderCloud's signature multi-monitor
capability — with session-scoped semantics (a reload restores everything
docked) and native dock-home on window close.

**Architecture:** Dockview 7.0.4's own popout machinery does the heavy
lifting (measured in the 2026-09-13 feasibility spike: it opens the window,
copies every parent stylesheet into the child, MOVES the engine-owned DOM
nodes so both React and Solid keep painting live data across the document
boundary, and docks home on `beforeunload`). This phase ships the parts
dockview cannot: a real `popout.html` target page per client (today the SPA
fallback boots the whole app in the child), an engine `popoutPanel` intent +
`onPopoutsChange` callback (popped state is ENGINE-OWNED session state, the
strips precedent — it never enters the layout machine or any persistence, so
"session-scoped" holds by construction), a serialize-time `popoutGroups`
scrub (the `withoutLockMarks` precedent, structural this time), a pop-out
head control gated to the dockview engine by the optional-slot idiom, intent
suppression for popped panels, and a react bridge keying fix the spike
surfaced.

**Tech stack:** dockview@7.0.4 (vanilla entry), rolldown-vite multi-page
input, playwright popup API for e2e.

**Spec:** [2026-09-10-dockview-native-features-design.md](../specs/2026-09-10-dockview-native-features-design.md)
§3 Phase 5; spike findings recorded in the workstream session (no separate
doc — this plan encodes every measured fact it relies on).

## Global Constraints

- Both web clients move together (React + Solid, same trios). RN untouched.
- dockview stays pinned at 7.0.4; no new dependencies.
- In-house engine untouched: popped state never reaches the machine, so
  in-house always renders the docked tree (the disparity doctrine's
  projection is the identity here).
- Session-scoped: a reload restores every panel docked. Enforced twice —
  popped state is engine-local (never persisted), AND the blob scrub strips
  any `popoutGroups` a mid-popout save captured.
- Full `pnpm typecheck` (repo-wide) before every push — the Phase 3 lesson;
  package tscs are not enough.
- Never pipe a playwright run through tail/head — full log to a file, grep
  the summary block (recorded lesson).
- Golden drift confined to the DOCKVIEW header-bearing set (the new control
  renders only where the dockview bridge passes the slot): the
  `*-dockview` app scenarios + `shell/layout-dockview{,-stacked}` — NOT
  `chrome/header` or any in-house cell. Task 9 re-pins exactly that set.
- The acceptance strip + merge hold close the phase (new visible UI).

## Verified dockview 7.0.4 facts the tasks rely on

- `api.addPopoutGroup(item: IDockviewPanel | DockviewGroupPanel, options?: DockviewPopoutGroupOptions): Promise<boolean>`
  (component.api.d.ts:580). Options: `{ position?: Box; popoutUrl?: string;
  onDidOpen?; onWillClose? }`. Resolves `false` when `window.open` returns
  null (popup blocked) — jsdom takes this path, so jsdom tests witness the
  blocked branch only; the real witness is e2e.
- Component-level default: `popoutUrl?: string` in the create options
  (options.d.ts:192), falling back to **`/popout.html`**, same-origin
  enforced.
- The popout window waits for the child's `load` event, then appends its own
  container div to `document.body` and copies all parent stylesheets
  (`popoutWindow.js` load handler → `addStyles(externalDocument,
  globalThis.document.styleSheets)`). So the target page needs ONLY a valid
  document with an empty body — any content it renders itself sits beneath
  dockview's appended container (which is why the SPA fallback booting the
  full app is a bug, not a feature).
- While popped, `toJSON()` gains `popoutGroups?: SerializedPopoutGroup[]`
  (`{ data?: GroupPanelViewState; grid?; url?; gridReferenceGroup?: string;
  position? }`, dockviewComponent.d.ts:83-95); the main grid keeps a hidden
  placeholder leaf whose id is `gridReferenceGroup`. `fromJSON` with the
  popup blocked falls back gracefully but docks the panels into an EXTRA
  group with a console.error — hence the scrub.
- Window close fires `beforeunload` → native dock-home (measured: exact
  restoration). Playwright's `page.close()` SKIPS beforeunload — e2e must
  run `window.close()` inside the popup for the dock-home assertion.

---

### Task 1: `popout.html` — a real target page per client, built and served

**Files:**
- Create: `packages/client-react/popout.html`
- Create: `packages/client-solid/popout.html`
- Modify: `packages/client-react/vite.config.ts` (build section, ~line 170)
- Modify: `packages/client-solid/vite.config.ts` (mirror)
- Test: existence + build-output assertions in each client's unit tree (see Step 4)

**Interfaces:**
- Produces: `/popout.html` served in dev (vite serves a real root-level
  `.html` file as-is, bypassing the SPA fallback) and emitted into `dist/`
  by the multi-page build. Vercel's routing is filesystem-first: a real
  `dist/popout.html` is served BEFORE the `vercel.react.json` SPA rewrite
  (`"/((?!api/).*)" → "/index.html"`) applies, so **no vercel config change
  is needed** — the rewrite only catches paths with no matching file.

- [ ] **Step 1: Write the page** (identical in both clients bar the title):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reactive Trader — Panel</title>
    <style>
      /* Dockview appends its container to this body after `load` and copies
       * every parent stylesheet across (popoutWindow.js). This page renders
       * nothing itself — the inline rules below only stop a white flash
       * before the copied theme paints, and remove the UA margin so the
       * moved group fills the window edge to edge. */
      html,
      body {
        margin: 0;
        height: 100%;
        background: #0d1420;
      }
    </style>
  </head>
  <body></body>
</html>
```

- [ ] **Step 2: Wire the multi-page build (react).** In
  `packages/client-react/vite.config.ts`'s `build` section, alongside the
  existing `rolldownOptions.output`:

```ts
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL("index.html", import.meta.url)),
        popout: fileURLToPath(new URL("popout.html", import.meta.url)),
      },
      output: {
```

  (`fileURLToPath`/`URL` are already imported in this config; if not, add
  `import { fileURLToPath, URL } from "node:url"` per the file's idiom.)

- [ ] **Step 3: Mirror in solid's vite config** (same `input` block; that
  config uses the same rolldown-vite).

- [ ] **Step 4: Write the failing build-output test.** Extend each client's
  existing config/build witness suite (client-react has
  `app.config`-style unit tests; place beside the vite config's existing
  tests if present, else a small node test that runs `vite build` is too
  heavy — instead assert the INPUT wiring statically):

```ts
import { readFileSync } from "node:fs";

it("popout.html is a real page and a build input (dockview pop-outs load it)", () => {
  const page = readFileSync(new URL("../../popout.html", import.meta.url), "utf8");
  expect(page).toContain("<body></body>");
  const config = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  expect(config).toContain("popout.html");
});
```

  (Adapt the relative paths to the actual test file location; both clients.)

- [ ] **Step 5: Run the tests, see them fail, add the files/wiring, see
  them pass.** Then `pnpm --filter @rtc/client-react build` once locally and
  assert `dist/popout.html` exists (manual step, recorded in the task
  report; the deploy needs no further change).

- [ ] **Step 6: Commit** — `feat(clients): real popout.html target pages — dockview pop-outs stop booting the SPA in the child window`

---

### Task 2: Engine — `popoutPanel` intent, `popoutUrl` option, `onPopoutsChange`

**Files:**
- Modify: `packages/layout-dockview/src/createDockEngine.ts`
- Test: `packages/layout-dockview/src/createDockEngine.test.ts`

**Interfaces:**
- Consumes: `createDockview(opts.container, { ... })` options object at
  ~line 200 (component-level `popoutUrl` is a valid key); `groupOf(panelId)`;
  the strips precedent `onStripsChange?: (strips: DockStripMap) => void`
  (engine option, ~line 101).
- Produces on `DockEngineOptions`: `popoutUrl?: string` and
  `onPopoutsChange?: (poppedPanelIds: readonly string[]) => void`.
  Produces on `DockEngine`: `popoutPanel(panelId: string): Promise<boolean>`
  (false = blocked/unknown panel). Popped state is ENGINE-LOCAL (a
  `Set<string>` of panelIds per popped group, derived from dockview's
  popout service events) — never serialized, never in the machine.

- [ ] **Step 1: Failing tests** (in a new describe "pop-out windows (session-scoped, the strips precedent)"):

```ts
it("popoutPanel resolves false under a blocked window.open and leaves the grid intact", async () => {
  const engine = createDockEngine(base()); // jsdom: window.open returns null
  const before = engine.groupCount();
  await expect(engine.popoutPanel("fx-analytics")).resolves.toBe(false);
  expect(engine.groupCount()).toBe(before);
  engine.dispose();
});

it("popoutPanel on an unknown panel resolves false without touching dockview", async () => {
  const engine = createDockEngine(base());
  await expect(engine.popoutPanel("nope")).resolves.toBe(false);
  engine.dispose();
});

it("threads popoutUrl into dockview's create options", () => {
  const seen = lastDockviewApi(); // the Phase-3 vi.mock passthrough accessor
  createDockEngine({ ...base(), popoutUrl: "/popout.html" }).dispose();
  // Adapt to the passthrough's captured-options shape in this file: assert
  // the created component received popoutUrl "/popout.html".
});
```

  Be honest in the test names: jsdom can only witness the popup-blocked
  branch (window.open → null → dockview resolves false). The opened-window
  path is Task 7's e2e.

- [ ] **Step 2: Run, watch them fail** (`popoutPanel is not a function`).

- [ ] **Step 3: Implement.** Thread `popoutUrl: opts.popoutUrl` into the
  `createDockview` options (only when defined, keeping the options object's
  existing style). Add to the returned engine:

```ts
    popoutPanel: async (panelId: string): Promise<boolean> => {
      const group = groupOf(panelId);

      if (group === undefined) {
        return false;
      }

      // Dockview owns the whole transaction: window features, stylesheet
      // copying, DOM movement, dock-home on close. `false` = popup blocked
      // (or an edge group) — the grid is untouched in that case.
      return api.addPopoutGroup(group as never);
    },
```

  (Resolve the exact parameter type against `SizableGroup`'s underlying
  dockview group rather than `as never` — the cast here is a plan sketch;
  the implementation must pass the real `DockviewGroupPanel` the api
  already holds. Adapt to how other engine methods reach the group api.)

  Track popped membership: subscribe to the popout service the same way the
  engine watches layout changes — dockview emits group `location` changes
  (`grid` ↔ `popout`); on each relevant event recompute
  `poppedPanelIds = panels of groups whose location.type === "popout"` and
  fire `opts.onPopoutsChange?.(...)` exactly like `onStripsChange` (~line
  809). Find the concrete event at implementation time
  (`api.onDidLayoutChange` already fires on the transaction — recompute
  there; do not invent a new subscription if the existing one suffices).

- [ ] **Step 4: Interplay guards** (same describe): closing/collapsing while
  popped is Task 6's UI suppression, but the ENGINE must stay safe if called
  anyway — add:

```ts
it("collapsePanel on a popped panel is a no-op (guarded, not crashed)", async () => {
  // jsdom cannot pop; simulate by asserting collapsePanel's existing
  // guards tolerate a panel whose group has no grid location — construct
  // via the blocked path (grid intact) and assert plain collapse still
  // works end-to-end, pinning that the guard change breaks nothing.
});
```

  (This is a characterisation-shaped test in jsdom; the real popped-panel
  no-op is asserted in Task 7's e2e.)

- [ ] **Step 5: Run the package suite green; commit** —
  `feat(layout-dockview): popoutPanel + popoutUrl + onPopoutsChange — dockview-native pop-outs behind the engine surface`

---

### Task 3: React bridge — fix the duplicate-portal-key transaction warning

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`
- Test: `packages/client-react/src/ui/shell/layout/dockview/__tests__/` (the StrictMode/bridge suite)

**Root cause (verified in source):** the portal list is keyed
`` `${slot}:${panelId}` `` (~line 335) but `mountInto` APPENDS the new mount
before the old one's dispose filter runs (~lines 124-136), so any dockview
transaction that re-creates a panel's slot — a pop-out, and in principle a
drop that rebuilds a tab — transiently holds TWO entries with the same
(slot, panelId) and React warns about duplicate keys.

**Interfaces:**
- Produces: `MountedSlot` gains `readonly mountId: number` (monotonic,
  assigned in `mountInto` from a `useRef` counter); the portal key becomes
  `` `${slot}:${panelId}:${mountId}` ``. Removal stays element-identity
  based (unchanged).

- [ ] **Step 1: Failing test** — in the bridge suite, mount the engine,
  then simulate a remount of the same panel's slot (call the captured
  `mountTab` hook twice for one panel with two elements before disposing
  the first — the passthrough mock exposes the hooks) and assert via a
  console.error spy that React logs **no** duplicate-key warning:

```ts
it("keys slot portals per mount, so a popout/remount transaction never duplicates keys", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  // drive a double-mount of fx-analytics' tab slot per the suite's idiom
  expect(
    errors.mock.calls.filter(([m]) => String(m).includes("same key")),
  ).toHaveLength(0);
  errors.mockRestore();
});
```

- [ ] **Step 2: Run red** (the warning fires under the current key).
- [ ] **Step 3: Implement the mountId counter key; run green.**
- [ ] **Step 4: Solid check:** the spike measured no Solid warning (its
  `<For>` keys by reference); add nothing there — note it in the commit.
- [ ] **Step 5: Commit** — `fix(client-react): portal keys carry a mount id — popout transactions no longer duplicate keys`

---

### Task 4: Blob scrub — a saved-while-popped layout restores fully docked

**Files:**
- Modify: `packages/layout-dockview/src/dockBlob.ts`
- Modify: `packages/layout-dockview/src/createDockEngine.ts` (serializeLayout calls the scrub)
- Test: `packages/layout-dockview/src/dockBlob.test.ts`

**Interfaces:**
- Consumes: the `withoutLockMarks` walk style in `dockBlob.ts`; the
  measured serialized shape: top-level `popoutGroups: [{ data?, grid?,
  url?, gridReferenceGroup?, position? }]`, panels still present in the
  top-level `panels` record, and the main grid holding a hidden placeholder
  leaf whose id === `gridReferenceGroup` with empty `views`.
- Produces: `export function withoutPopoutGroups(parsed: unknown): unknown`
  — for each popout entry, locate the grid leaf with
  `id === gridReferenceGroup`, set its `views`/`activeView` from the
  popout's `data` (or from `grid`'s leaves, flattened in order, for the
  multi-group form), clear its hidden/visibility mark, then drop the
  top-level `popoutGroups` key. Malformed input passes through untouched
  (the load path's fall-back-to-seed net stays the outer safety).

- [ ] **Step 1: Failing tests, fixture-driven** (jsdom cannot create real
  popout state — the popup is blocked — so the fixtures ENCODE the measured
  shape; keep them minimal):

```ts
it("re-parents a single-group popout onto its hidden reference leaf and drops the key", () => {
  const scrubbed = withoutPopoutGroups(POPPED_BLOB_FIXTURE) as Record<string, unknown>;
  expect(scrubbed).not.toHaveProperty("popoutGroups");
  // the reference leaf holds the popped panel's view again
  expect(JSON.stringify(scrubbed)).toContain('"fx-analytics"');
});

it("a scrubbed blob restores every panel docked in a real dockview (no extra group, no console.error)", () => {
  // round-trip through createDockview().fromJSON per this file's doctrine —
  // a converter test that never feeds dockview proves nothing.
});

it("passes malformed popoutGroups through untouched", () => {
  expect(withoutPopoutGroups({ popoutGroups: 42, grid: null })).toEqual({ popoutGroups: 42, grid: null });
});
```

- [ ] **Step 2: Run red; implement the walk** (named unverified interfaces,
  the file's established cast idiom); `serializeLayout` composes it with the
  existing scrubs (`withoutLockMarks(withoutPopoutGroups(api.toJSON()))` —
  order irrelevant, keep alphabetical-of-concern with a comment).
- [ ] **Step 3: Run green; commit** — `feat(layout-dockview): serialize-time popoutGroups scrub — pop-outs are session-scoped by construction`

---

### Task 5: Head pop-out control — the optional-slot gating idiom

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/PanelHeadControls.tsx` (+ solid twin)
- Modify: `packages/client-react/src/ui/shell/layout/engine/PanelHead.module.css` (+ solid twin) if a glyph style is needed
- Test: contract spec (shared, swap-trio) + the stylesheet pin suite if CSS changes

**Interfaces:**
- Consumes (verified): `PanelHeadControlsProps { panelId, title,
  maximizable, maximizedHere, onCollapse, onMaximize, onRestore }`.
- Produces: optional slots `onPopout?: () => void` and
  `poppedHere?: boolean`. The button renders ONLY when `onPopout` is
  provided — the engine-gating idiom (`mountActions` precedent: only the
  dockview bridge passes the slot; in-house and RN callers change nothing —
  optional props, zero fan-out). While `poppedHere`, the collapse and
  maximize buttons render `disabled` with `aria-disabled` (the suppression
  UI half; the machine never learns about pop-outs).

- [ ] **Step 1: Failing contract spec** (shared spec, runs against both
  clients): a head WITH the slot shows the ⧉ pop-out button (pick the glyph
  at implementation time — distinct from maximize's ⛶; `⇱` or `🗗`-class
  glyph rendered as text, no unicode escapes — literal glyph per the JSX
  lesson); a head WITHOUT the slot renders no such button; `poppedHere`
  disables collapse/maximize.
- [ ] **Step 2: Run red both clients; implement in both `PanelHeadControls`
  twins; run green** (contract 2×).
- [ ] **Step 3: Commit** — `feat(clients): pop-out head control behind the optional-slot gate; popped panels grey collapse/maximize`

---

### Task 6: Bridges thread the slot, the URL, and the popped state

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`
- Modify: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx`
- Test: each client's bridge/StrictMode suite

**Interfaces:**
- Consumes: Task 2's `popoutUrl` / `onPopoutsChange` / `popoutPanel`;
  Task 5's `onPopout` / `poppedHere` slots; the bridges' existing `strips`
  state pattern (`onStripsChange` → `useState` map → per-panel prop).
- Produces: bridge state `popped: readonly string[]` mirroring strips;
  `PanelHeadSlot`/`PanelHeadControls` receive `onPopout={() => engine.popoutPanel(panelId)}`
  and `poppedHere={popped.includes(panelId)}`; engine created with
  `popoutUrl: "/popout.html"` (a literal — both clients serve it at the
  root; no env involved).

- [ ] **Step 1: Failing test per client:** the bridge passes `popoutUrl`
  into the engine options (passthrough-captured) and threads
  `onPopoutsChange` state into the head props (drive the captured callback
  with `["fx-analytics"]`, assert the tab slot's controls carry the
  disabled/popped witness — a `data-popped` attribute beside
  `data-collapsed` keeps it queryable).
- [ ] **Step 2: Run red; implement both bridges; run green.** StrictMode
  suite must stay green (the popped map is plain state — rebuild-safe).
- [ ] **Step 3: Commit** — `feat(clients): dockview bridges wire pop-outs — url, popped state, head slot`

---

### Task 7: e2e — the popup smoke, both clients

**Files:**
- Modify: `tests/browser/page-objects/contracts/Layout.ts` (+ playwright impl + testids if needed)
- Modify: `tests/browser/scenarios/layout.ts` (extend the dockview scenario)
- Test: the layout e2e spec (both clients via RTC_CLIENT_PKG)

**Interfaces:**
- Consumes: the Phase 1 dockview e2e scenario scaffolding (engine selection
  via localStorage `rtc-layout-engine` BARE string); playwright popup API.
- Produces: PO `popoutPanel(panelId): Promise<Page>` — clicks the head
  control and returns `context.waitForEvent("page")`'s page.

- [ ] **Step 1: Extend the scenario (spec first, red):**

```ts
const popup = await layout.popoutPanel("fx-analytics");
await popup.waitForLoadState();
// the panel's content lives — its testid resolves in the CHILD document
await expect(popup.getByTestId(TESTIDS.layout.collapseControl("fx-analytics"))).toBeAttached();
// dock-home: close from INSIDE the page (page.close() skips beforeunload)
await popup.evaluate(() => window.close());
await expect(page.getByTestId("dock-tab-fx-analytics")).toBeVisible();
// reload restores docked (session-scoped)
```

  Adapt selectors to the PO layer's real testids — raw `page.*` in specs is
  forbidden by gates 9-11; everything above goes through page objects.

- [ ] **Step 2: Run red (control missing) → green after Tasks 5-6; twice
  per client for flake confidence.**
- [ ] **Step 3: Commit** — `test(e2e): dockview pop-out smoke — open, live content, dock-home on close, docked after reload`

---

### Task 8: Docs

**Files:** `packages/layout-dockview/README.md` (pop-out section: session-scoped
semantics, the scrub, the popout.html contract), `docs/adr/ADR-002-layout-management-port.md`
(one pointer line in the Dockview-native era section),
`docs/STATUS.md` (Phase 5 status, Last updated bump).

- [ ] **Step 1: Write; `pnpm check:doc-links`; commit** —
  `docs: dockview pop-outs recorded — session-scoped doctrine, popout.html contract`

---

### Task 9: Measurement + acceptance gate (merge holds)

- [ ] **Step 1:** Re-pin the dockview header-bearing arm64 goldens — the
  pop-out control appears in every dockview tab head. Set (from Phase 3's
  measured header list, dockview subset): `app/fx-dockview`,
  `app/fx-{maximized,rail-maximized,collapsed,rail-collapsed}-dockview`,
  `app/{credit,equities,admin}-dockview`, `app/fx-closed-dockview`,
  `shell/layout-dockview`, `shell/layout-dockview-stacked` — local
  `-g "dockview"` EQUALS the x86 workflow pattern (all dockview cells; the
  non-header dockview cells re-shoot byte-identical, which is the cheap
  price of one pattern string; verify byte-identity in git status).
- [ ] **Step 2:** FULL react + solid visual asserts, unpiped, passed ==
  `--list` total, exit codes checked. Every non-dockview cell byte-identical.
- [ ] **Step 3:** Fast-tier gauntlet (19 gates) + full `pnpm typecheck`.
- [ ] **Step 4:** Acceptance strip: the dockview tab head with the ⧉ control
  across ~4 skins, PLUS a real screenshot of a popped-out window over the
  main app (drive the dev app with playwright, capture both windows
  composited or side by side). Deliver to the orchestrator; **merge holds
  for the user's eyeball.**

## Self-review

- **Spec coverage:** popout.html+deploy (T1), engine surface (T2), keying
  fix (T3), scrub/session-scope (T4), control+suppression (T5-6), e2e (T7),
  docs (T8), measurement+acceptance (T9). The spike's whole fix list is
  mapped; nothing in spec §3 Phase 5 is untasked.
- **Placeholder scan:** the two "adapt to the suite's idiom" notes are
  deliberate (fixture/PO names vary per file — the Phase 1/3 precedent);
  Task 2's `as never` sketch is explicitly marked to be resolved against
  the real group type at implementation. No TBDs.
- **Type consistency:** `popoutPanel(panelId): Promise<boolean>`,
  `onPopoutsChange(readonly string[])`, `onPopout?: () => void`,
  `poppedHere?: boolean`, `withoutPopoutGroups(parsed: unknown): unknown` —
  used identically across Tasks 2/4/5/6/7.
