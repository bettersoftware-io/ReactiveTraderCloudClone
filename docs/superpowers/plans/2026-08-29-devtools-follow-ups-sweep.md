# Devtools Follow-ups Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire every devtools follow-up parked in `docs/STATUS.md` (the July timeline-v2 residuals, the store-first v3 residuals, and the two 2026-07-21 live-acceptance findings), and put the two devtools packages behind the same per-package ≥95% coverage gate the web clients already have.

**Architecture:** Three PRs, one phase each, so a red phase never blocks the others. Phase 1 (PR 1) is mechanical: tests, one-line fixes, token swaps, copy, the docs line, the coverage backfill and the coverage gate. Phase 2 (PR 2) is structural: the `ContextPane` split, the compiler-healthcheck discriminator, the evicted-machines leaf, radius/cursor state fixes, `LiveHistory` frame cap, exact mount seed. Phase 3 (PR 3) is the React DevTools extension interference root-cause fix. Every code change lives in `packages/devtools-app`, `packages/devtools-core`, `tests/browser`, `scripts/`, `.github/workflows`, or docs — no client/server/domain package is touched.

**Tech Stack:** React 19 + React Compiler (no manual memo — ADR-003), vitest + RTL (jsdom), Playwright e2e, Biome + ESLint (custom `rtc/*` rules), stylelint, knip, v8 coverage.

**Spec:** There is no single spec — this plan argues from the follow-up register in `docs/STATUS.md` ("Devtools timeline UX — post-ship polish" entry) plus the two source specs it cites: `docs/superpowers/specs/2026-07-20-devtools-timeline-ux-design.md` and `docs/superpowers/specs/2026-08-29-devtools-store-first-navigation-design.md` (§3.1 names `panels/flash.ts`; §8 the e2e journey). Research briefings with verbatim code quotes were produced for every item and are summarised inline in each task.

## Global Constraints

- **Change surface.** Only `packages/devtools-app/**`, `packages/devtools-core/**`, `packages/devtools-extension/src/panel/panel.tsx` (Phase 3 only), `tests/browser/page-objects/**`, `tests/browser/playwright/devtools.spec.ts`, `scripts/react-compiler-healthcheck.mjs`, `.github/workflows/ci.yml`, `.github/workflows/coverage-report.yml`, `.claude/commands/rtc/gauntlet.md`, `CLAUDE.md`, `docs/STATUS.md`, `docs/architecture/20-devtools.md`, `packages/devtools-app/README.md`, `packages/devtools-extension/README.md`. Nothing else.
- **Lint.** Biome (braces on every control statement, no `biome-ignore`, import sort via `pnpm exec biome ci .`), ESLint `arrow-body-style: always` (every arrow has a block body — `(a, b) => { return a.localeCompare(b); }`), no inline object types in parameter positions (declare an `interface`), `rtc/name-functions-by-effect` (a concrete handler is named for its effect, never `onX`/`handleX`; a function-typed prop is a slot and stays `onX`), `rtc/newspaper-order` in test files (fixtures and helpers BELOW the last `test(...)`), `rtc/component-newspaper` (one exported component per `.tsx`, it is the first declaration after imports, filename = component name), `react-hooks` `recommended-latest` on plugin v7 (**`set-state-in-effect` is an error — never call a state setter inside `useEffect`**), stylelint `custom-property-pattern` (kebab-case tokens).
- **Tests.** Sociable RTL over real `InspectorStore` / `LiveHistory` / `FakeSocket`, zero `vi.mock` of repo modules (spying on a prototype method with `vi.spyOn` is fine — `afterEach(vi.restoreAllMocks)` already runs in the devtools-app suites). Per-file coverage ≥95% statements for every file touched or created — check with `pnpm --filter @rtc/devtools-app exec vitest run --coverage --coverage.include='src/**/*.{ts,tsx}' --coverage.reporter=text` (and the `@rtc/devtools-core` equivalent, `pnpm --filter @rtc/devtools-core test:coverage`) before reporting DONE.
- **Testids.** Only these are added: `state-at-seq` (Task 8). Every new testid is registered in `tests/browser/page-objects/contracts/testids.ts` under `devtools:` and referenced only via `TESTIDS.devtools.*`. Every new page-object method is declared in `tests/browser/page-objects/contracts/Inspector.ts` AND implemented in `tests/browser/page-objects/playwright/Inspector.ts` (typecheck enforces the mirror).
- **Exact copy strings.** Radius chip: `` `±${windowMs}ms @ ${formatLogTime(centerTs)} ✕` ``. Connection badge in import mode: `` `recording · ${appId}` ``. Evicted-machines leaf label: `` `Evicted (${count})` `` with id `machines:evicted`. Context-pane moment badge: `` `@ seq ${seq}` ``. Coverage tier display names: `devtools/core`, `devtools/app`; slugs `devtools-core`, `devtools-app`.
- **Commands (gates), run before every DONE report:** `pnpm exec biome ci .`, `pnpm lint:eslint` (root ESLint — NOTE `pnpm lint` alone is Biome only and proves nothing about ESLint), `pnpm lint:css`, `pnpm typecheck`, `pnpm --filter @rtc/devtools-app test`, `pnpm --filter @rtc/devtools-core test`, `pnpm lint:dead` (knip), `pnpm check:compiler`, plus `pnpm check:doc-links` whenever a markdown file changed and `pnpm check:scripts` / `pnpm lint:actions` when `package.json` scripts or a workflow changed. The e2e (Task 8) runs with `pnpm --filter @rtc/devtools-app build` first, then `pnpm --filter @rtc/tests test:browser:playwright -- devtools.spec.ts` and the same with `test:browser:playwright:solid`.
- **Commit style.** One commit per task, conventional prefix (`fix(devtools):`, `test(devtools):`, `refactor(devtools):`, `chore(ci):`, `docs(devtools):`), body names the STATUS.md item it retires.

---

# Phase 1 — mechanical (PR 1)

### Task 1: `argLabel` fallback tests + `localeCompare` ordering in `buildNavTree`

**Files:**
- Modify: `packages/devtools-app/src/nav/buildNavTree.ts:127,165`
- Test: `packages/devtools-app/src/__tests__/scope.test.ts`, `packages/devtools-app/src/__tests__/buildNavTree.test.ts`

**Interfaces:** none produced; consumes `streamLeafLabel`/`shortLabel` (exported from `nav/scope.ts`, already under test at `scope.test.ts:122-154`) and `buildNavTree(state, visibleLog)`.

- [ ] **Step 1: Write the failing ordering test** in `buildNavTree.test.ts`, next to the existing "four roots in order" test. Use the file's existing state-fixture helper (read the file — it builds an `InspectorState` with named presenters/machine kinds; reuse it rather than inventing another). Fixture presenters `["b", "A", "c"]` — default `.sort()` yields `["A", "b", "c"]` while `localeCompare` yields `["A", "b", "c"]` too, so that pair does NOT discriminate; use `["b", "a", "B"]`: default sort → `["B", "a", "b"]`, localeCompare → `["a", "b", "B"]`.

```ts
test("presenter and machine-kind roots order by localeCompare, not code-unit sort", () => {
  const state = stateWith({ presenters: ["b", "a", "B"], machineKinds: ["b", "a", "B"] });
  const tree = buildNavTree(state, []);
  const presenters = tree[1]!.children.map((n) => { return n.label; });
  const kinds = tree[2]!.children.map((n) => { return n.label; });
  expect(presenters).toEqual(["a", "b", "B"]);
  expect(kinds).toEqual(["a", "b", "B"]);
});
```
(`stateWith` is whatever the file's fixture builder is called — adapt the call, not the assertion. If the builder cannot take machine kinds, build the machine rows inline the way the file's other machine tests do.)

- [ ] **Step 2: Run it** — `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/buildNavTree.test.ts` → FAIL on the `["B", "a", "b"]` ordering.

- [ ] **Step 3: Fix both sort sites** in `buildNavTree.ts` (lines 127 and 165 — the wire root at 177 already does this):

```ts
return order
  .sort((a, b) => { return a.localeCompare(b); })
  .map((presenter) => {
```
and identically for `machineKind`.

- [ ] **Step 4: Add the `argLabel` branch tests** in `scope.test.ts`, one `test` block after the existing labels test. `argLabel` is private; drive it through the exported label function the existing test uses (it parses a stream id of the shape `key.prop[JSON-args]`). Cover all five uncovered branches:

```ts
test("stream labels fall back per arg shape: nested array, string-less object, null, primitive, multi-arg join", () => {
  expect(streamLeafLabel(parseStreamId('fx.price[[["EURUSD","GBPUSD"]]]'))).toContain("EURUSD, GBPUSD");
  expect(streamLeafLabel(parseStreamId('fx.price[[{"count":5}]]'))).toContain('{"count":5}');
  expect(streamLeafLabel(parseStreamId("fx.price[[null]]"))).toContain("null");
  expect(streamLeafLabel(parseStreamId("fx.price[[42]]"))).toContain("42");
  expect(streamLeafLabel(parseStreamId('fx.price[["EURUSD",7]]'))).toContain("EURUSD, 7");
});
```
Adjust the exact export names to what `scope.test.ts:122-154` already imports (`streamLeafLabel` / `shortLabel` / `parseStreamId`) — the assertions are the contract.

- [ ] **Step 5: Run both files + coverage** — `scope.ts` must reach 100% statements (only line 241 was dark). Then run the gate commands.

- [ ] **Step 6: Commit** — `fix(devtools): localeCompare nav ordering; cover argLabel fallbacks`.

---

### Task 2: Shared `useFlashOnSeq` hook (`panels/flash.ts`)

**Files:**
- Create: `packages/devtools-app/src/panels/flash.ts`
- Modify: `packages/devtools-app/src/panels/StateTreePanel.tsx:79-93`, `packages/devtools-app/src/nav/NavTree.tsx:165-177`
- Test: `packages/devtools-app/src/__tests__/flash.test.tsx` (new); `NavTree.test.tsx` and `StateTreePanel.test.tsx` keep passing untouched (both spy on `Element.prototype.animate`).

**Interfaces:**
- Produces: `useFlashOnSeq(flashRef: RefObject<HTMLSpanElement | null>, lastSeq: number): void` from `#/panels/flash`.

- [ ] **Step 1: Write the failing test** `flash.test.tsx`:

```tsx
import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useFlashOnSeq } from "#/panels/flash";

let animateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  animateSpy = vi.fn();
  Element.prototype.animate = animateSpy as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("flashes once per lastSeq advance past 0, never on unrelated re-renders", () => {
  const view = render(<Flasher lastSeq={0} tick={0} />);
  expect(animateSpy).not.toHaveBeenCalled();

  act(() => { view.rerender(<Flasher lastSeq={3} tick={0} />); });
  expect(animateSpy).toHaveBeenCalledTimes(1);
  expect(animateSpy.mock.calls[0]?.[0]).toEqual([{ opacity: 0.35 }, { opacity: 1 }]);
  expect(animateSpy.mock.calls[0]?.[1]).toEqual({ duration: 300, easing: "ease-out" });

  act(() => { view.rerender(<Flasher lastSeq={3} tick={1} />); });
  expect(animateSpy).toHaveBeenCalledTimes(1);

  act(() => { view.rerender(<Flasher lastSeq={4} tick={1} />); });
  expect(animateSpy).toHaveBeenCalledTimes(2);
});

interface FlasherProps {
  lastSeq: number;
  tick: number;
}

function Flasher({ lastSeq, tick }: FlasherProps): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  useFlashOnSeq(ref, lastSeq);
  return <span ref={ref} data-tick={tick} />;
}
```

- [ ] **Step 2: Run it** → FAIL (module missing).

- [ ] **Step 3: Create `panels/flash.ts`:**

```ts
import { type RefObject, useEffect } from "react";

/** Retrigger a compositor-safe opacity flash on a span WITHOUT remounting it,
 * each time `lastSeq` advances past 0. WAAPI promotes the element only for
 * the animation's lifetime, so there is no permanent will-change layer
 * (docs/performance.md). Shared by StateTreePanel and NavTree — the helper
 * spec §3.1 of the store-first design assumed. */
export function useFlashOnSeq(
  flashRef: RefObject<HTMLSpanElement | null>,
  lastSeq: number,
): void {
  useEffect((): void => {
    if (lastSeq > 0) {
      flashRef.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 300,
        easing: "ease-out",
      });
    }
  }, [flashRef, lastSeq]);
}
```

- [ ] **Step 4: Replace both inline effects.** In `StateTreePanel.tsx` (`StreamRowView`) and `NavTree.tsx` (`NavRow`) delete the `useEffect(...)` block and call `useFlashOnSeq(flashRef, row.lastSeq)` / `useFlashOnSeq(flashRef, node.lastSeq)`; remove the now-unused `useEffect` import from each file if nothing else uses it; keep a one-line comment `// opacity-only WAAPI flash, shared: panels/flash.ts`.

- [ ] **Step 5: Run** `flash.test.tsx`, `NavTree.test.tsx`, `StateTreePanel.test.tsx` → PASS; coverage: `flash.ts` 100%. Run the gate commands (knip must see `flash.ts` reachable — it is, via both callers).

- [ ] **Step 6: Commit** — `refactor(devtools): share the WAAPI flash as useFlashOnSeq (spec §3.1)`.

---

### Task 3: `importRecording` reads inside its `try` + the `reconstructError` render test

**Files:**
- Modify: `packages/devtools-app/src/recording/useRecording.ts:111-132`
- Test: `packages/devtools-app/src/__tests__/RecordingToolbar.test.tsx`, `packages/devtools-app/src/__tests__/ContextPane.test.tsx`

- [ ] **Step 1: Failing test in `RecordingToolbar.test.tsx`** (this harness is the only consumer of `useRecording`; mirror its existing `"import failure shows importError"` case and its testids):

```ts
test("a File.text() rejection surfaces as importError, not an unhandled rejection", async () => {
  const store = new InspectorStore();
  mount({ store });

  const file = new File(["irrelevant"], "r.json", { type: "application/json" });
  vi.spyOn(file, "text").mockRejectedValue(new Error("read failed"));

  fireEvent.change(screen.getByTestId("import"), { target: { files: [file] } });

  await waitFor(() => {
    expect(screen.getByTestId("import-error").textContent).toContain("read failed");
  });
});
```
(Use the same `mount` helper and the same import/import-error testids the file already uses — read them, don't guess.)

- [ ] **Step 2: Run** → FAIL (times out / unhandled rejection).

- [ ] **Step 3: Move the read inside the `try`** in `useRecording.ts`:

```ts
async function importRecording(file: File): Promise<void> {
  try {
    const text = await file.text();
    const rec = parseRecording(text);
    // ...rest of the existing body unchanged...
```

- [ ] **Step 4: Failing test in `ContextPane.test.tsx`** — the hook branch is covered (`useTimeline.test.tsx:252`), the render of the card is not:

```ts
test("a reconstruction failure renders the reconstruction-failed card, not a blank pane", () => {
  vi.spyOn(LiveHistory.prototype, "stateAt").mockImplementation(() => {
    throw new Error("history is corrupt");
  });
  const harness = mount();

  act(() => { harness.pin(rowAt(harness.log, 1)); });

  expect(screen.getByText("State reconstruction failed: Error: history is corrupt")).toBeTruthy();
  fireEvent.click(screen.getByTestId("context-tab-diff"));
  expect(screen.getByText("State reconstruction failed: Error: history is corrupt")).toBeTruthy();
});
```
(`mount`, `rowAt`, `LiveHistory` are already in that file.) It passes immediately — it is a coverage backfill, not a bug; keep it.

- [ ] **Step 5: Run both files + gates.** `useRecording.ts` branch coverage rises from 50%.

- [ ] **Step 6: Commit** — `fix(devtools): importRecording surfaces File read failures as importError; cover reconstructError card`.

---

### Task 4: DiffView backgrounds through tokens (`--ok`)

**Files:**
- Modify: `packages/devtools-app/src/InspectorApp.module.css:7-17` (token root `.app`), `packages/devtools-app/src/timeline/DiffView.module.css:27-37`

No behaviour test (devtools-app has no visual tier); stylelint + a manual eyeball of the Diff tab are the checks.

- [ ] **Step 1: Add the token** after `--warn` in the `.app` block: `--ok: #3fb950;`

- [ ] **Step 2: Swap the three declarations:**

```css
.added   { background: color-mix(in srgb, var(--ok) 25%, transparent); }
.removed { background: color-mix(in srgb, var(--danger) 25%, transparent); }
.changed { background: color-mix(in srgb, var(--warn) 25%, transparent); }
```
(`--warn` is `#d29922`, an exact match; `--danger` `#f87171` replaces `#f85149`, a negligible nudge; `--ok` is new.)

- [ ] **Step 3: Also point the wire-family stripe** in `packages/devtools-app/src/timeline/TimelinePane.module.css:120-134` (the other `#3fb950` literal) at `var(--ok)` so the literal has one owner.

- [ ] **Step 4: Run** `pnpm lint:css`, `pnpm exec biome ci .`, `pnpm --filter @rtc/devtools-app test`.

- [ ] **Step 5: Commit** — `style(devtools): DiffView tints through tokens; add --ok`.

---

### Task 5: Radius chip shows its centre timestamp

**Files:**
- Modify: `packages/devtools-app/src/timeline/TimelinePane.tsx:140-149`
- Test: `packages/devtools-app/src/__tests__/InspectorApp.test.tsx` (lines ~111, 114, 177, 180 assert the old exact text `"±100ms ✕"`)

- [ ] **Step 1: Update the four assertions** to the new shape and add one exactness check. `formatLogTime` is exported from `#/panels/formatLogTime`; the probed row's `ts` is available in the journey (the row the test clicks "wire ±100ms" on — read the test to get the variable):

```ts
expect(screen.getByText(`±100ms @ ${formatLogTime(probedRow.ts)} ✕`)).toBeTruthy();
// ...and where absence is asserted:
expect(screen.queryByText(/^±100ms @ /)).toBeNull();
```

- [ ] **Step 2: Run** → FAIL (old copy rendered).

- [ ] **Step 3: Change the chip** (formatLogTime is already imported in `TimelinePane.tsx`):

```tsx
{`±${model.filter.radius.windowMs}ms @ ${formatLogTime(model.filter.radius.centerTs)} ✕`}
```

- [ ] **Step 4: Run** `InspectorApp.test.tsx`, `TimelinePane.test.tsx` + gates.

- [ ] **Step 5: Commit** — `fix(devtools): radius chip names the moment it is centred on`.

---
### Task 6: Connection badge reads `recording · <appId>` in import mode

**Files:**
- Modify: `packages/devtools-app/src/InspectorApp.tsx` (`ConnectionRail` ~320-350 and its call site ~181-185)
- Test: `packages/devtools-app/src/__tests__/InspectorApp.test.tsx`

**Interfaces:** `ConnectionRailProps` gains `imported: ImportedRecording | null` (`ImportedRecording` is exported from `#/recording/useRecording`).

- [ ] **Step 1: Failing test** — the file already imports a recording in "pinned selection resets when the datasource swaps (import lands, Back to live)"; reuse that import path (same `serializeRecording` + `File` + `fireEvent.change` on the import input) with `appId: "imported-app"`:

```ts
test("an imported recording names itself in the connection badge instead of 'disconnected'", async () => {
  // ...mount + import exactly as the datasource-swap test does, appId "imported-app"...
  await waitFor(() => {
    expect(screen.getByTestId("connection-badge").textContent).toBe("recording · imported-app");
  });
  fireEvent.click(screen.getByText("Back to live"));
  await waitFor(() => {
    expect(screen.getByTestId("connection-badge").textContent).not.toBe("recording · imported-app");
  });
});
```
("Back to live" is the existing toolbar control — use whatever selector that test already uses.)

- [ ] **Step 2: Run** → FAIL (`disconnected`).

- [ ] **Step 3: Thread `imported` to the rail** — at the call site `imported={recording.imported}`, then:

```tsx
interface ConnectionRailProps {
  state: InspectorState;
  imported: ImportedRecording | null;
  nodes: readonly NavNode[];
  navigation: NavigationModel;
}

function describeConnection(state: InspectorState, imported: ImportedRecording | null): string {
  if (imported !== null) {
    return `recording · ${imported.appId}`;
  }
  return state.connected ? state.appId : "disconnected";
}
```
and the badge renders `{describeConnection(state, imported)}`. Keep `describeConnection` a module-level pure function (below `ConnectionRail`, newspaper order) — not a `renderX` function, not inline.

- [ ] **Step 4: Run + gates. Step 5: Commit** — `fix(devtools): connection badge names an imported recording`.

---

### Task 7: Docs — Chrome freezes backgrounded tabs

**Files:**
- Modify: `docs/architecture/20-devtools.md` §20.6 (insert immediately BEFORE the `#### 20.6.1 Chrome extension transport` heading, after the paragraph ending "…so the handshake re-runs and reconnects if the app comes back."), `packages/devtools-app/README.md` (after the "Same-origin is load-bearing…" paragraph, before `## How to run`).

- [ ] **Step 1: 20-devtools.md paragraph:**

```md
**Chrome freezes backgrounded tabs — the app tab included.** Even behind a
silent-audio keep-alive, freezing suspends the app-side hub's rAF flush and the
`BroadcastChannel` post underneath it, so no frame reaches the panel. The
same-origin panel reads this exactly like a disconnect: nothing resets the
liveness timer above, the badge flips to "disconnected", and it stays stalled
until the app tab is foregrounded again — keep the app visible (two windows
side by side) when inspecting locally. The WS-relay
([§20.9](#209-websocket-relay-transport-react-native)) and Chrome extension
([§20.6.1](#2061-chrome-extension-transport)) transports don't share this
failure mode: neither depends on the app tab's own timer budget to move a frame.
```
(Both anchors already resolve — they are used elsewhere in the same file; `pnpm check:doc-links` is the proof.)

- [ ] **Step 2: README paragraph:**

```md
**Keep the app tab foregrounded.** Chrome freezes backgrounded tabs
(silent-audio keep-alives included), which pauses the app-side hub and leaves
the panel reading "disconnected" until the app tab regains focus — a browser
tab-lifecycle limit, not a devtools bug. Use the
[Chrome extension](../devtools-extension/README.md) or the
[WS relay](../devtools-relay/README.md) when the app tab can't stay visible.
```

- [ ] **Step 3: Run** `pnpm check:doc-links`, `pnpm exec biome ci .`. **Step 4: Commit** — `docs(devtools): background-tab freeze stalls the same-origin panel`.

---

### Task 8: e2e proves the context pane is at a pinned moment (`state-at-seq`)

**Files:**
- Modify: `packages/devtools-app/src/timeline/ContextPane.tsx` (tab bar in `ContextPane`, ~lines 32-102), `packages/devtools-app/src/timeline/ContextPane.module.css`
- Modify: `tests/browser/page-objects/contracts/testids.ts:308-317`, `tests/browser/page-objects/contracts/Inspector.ts`, `tests/browser/page-objects/playwright/Inspector.ts:131-167`, `tests/browser/playwright/devtools.spec.ts:97-100`
- Test: `packages/devtools-app/src/__tests__/ContextPane.test.tsx`

**Interfaces:**
- Produces testid `TESTIDS.devtools.stateAtSeq = "state-at-seq"`; page-object `pinLatestTimelineRow(ctx): Promise<number>` (now returns the pinned row's `data-seq`), `waitStateAtSeq(ctx, seq: number): Promise<void>`, `waitStateLive(ctx): Promise<void>`.

- [ ] **Step 1: RTL failing test** in `ContextPane.test.tsx`:

```ts
test("a pinned moment is named in the context pane header and the badge leaves on resume", () => {
  const harness = mount();
  expect(screen.queryByTestId("state-at-seq")).toBeNull();

  act(() => { harness.pin(rowAt(harness.log, 2)); });
  expect(screen.getByTestId("state-at-seq").textContent).toBe(`@ seq ${rowAt(harness.log, 2).seq}`);

  act(() => { harness.resume(); });
  expect(screen.queryByTestId("state-at-seq")).toBeNull();
});
```
(`harness.resume` — or whatever the harness exposes for `model.resume()`; read `mount()`.)

- [ ] **Step 2: Render the badge** in `ContextPane`'s tab row, after the last `TabButton`:

```tsx
{model.selection.mode === "pinned" ? (
  <span data-testid="state-at-seq" className={styles.atSeq}>
    {`@ seq ${model.selection.seq}`}
  </span>
) : null}
```
CSS: `.atSeq { margin-left: auto; color: var(--dim); font-family: var(--font-mono); font-size: 11px; }` in `ContextPane.module.css`.

- [ ] **Step 3: Testid + page object.** `testids.ts`: add `stateAtSeq: "state-at-seq",` to the `devtools` block. `contracts/Inspector.ts`: change `pinLatestTimelineRow` to return `Promise<number>` and add `waitStateAtSeq(seq: number, timeoutMs: number): Promise<void>` and `waitStateLive(timeoutMs: number): Promise<void>` (match the file's existing signature style — `ctx` is threaded by the scenario layer, read `contracts/Inspector.ts:53-60`). `playwright/Inspector.ts`:

```ts
async pinLatestTimelineRow(): Promise<number> {
  const row = this.page().getByTestId(TESTIDS.devtools.timelineRow).last();
  const seq = Number(await row.getAttribute("data-seq"));
  await row.click();
  return seq;
}

async waitStateAtSeq(seq: number, timeoutMs: number): Promise<void> {
  await expect(this.page().getByTestId(TESTIDS.devtools.stateAtSeq)).toHaveText(`@ seq ${seq}`, { timeout: timeoutMs });
}

async waitStateLive(timeoutMs: number): Promise<void> {
  await expect(this.page().getByTestId(TESTIDS.devtools.stateAtSeq)).toHaveCount(0, { timeout: timeoutMs });
}
```
(Keep the existing pin implementation's row-selection logic if it pins something other than `.last()` — only add the `data-seq` read + return.)

- [ ] **Step 4: Spec** `devtools.spec.ts:97-100`:

```ts
const pinnedSeq = await devtools.pinLatestTimelineRow(ctx);
await devtools.expectPinnedBar(ctx);
await devtools.waitStateAtSeq(ctx, pinnedSeq, 5_000);
await devtools.resumeViaEscape(ctx);
await devtools.expectNoPinnedBar(ctx);
await devtools.waitStateLive(ctx, 5_000);
```
(Go through the scenario layer `tests/browser/page-objects/scenarios/devtools.ts` if that is how `expectPinnedBar` is reached — mirror the existing wrappers.)

- [ ] **Step 5: Run** RTL + `pnpm typecheck` + `pnpm --filter @rtc/devtools-app build` then both Playwright runs (react + solid) for `devtools.spec.ts`. **Step 6: Commit** — `test(devtools): e2e asserts the context pane sits at the pinned seq`.

---

### Task 9: Coverage backfill — the dark files

**Files (tests only; no source change unless a branch is provably dead):**
- `packages/devtools-app/src/__tests__/ValueView.test.tsx` (ValueView.tsx 81% — lines ~96-199, 300-302 dark)
- `packages/devtools-core/src/__tests__/WsRelayDuplex.test.ts` (85.7% — lines ~146, 164, 174-175)
- `packages/devtools-core/src/__tests__/inspector.test.ts` or a new `devtoolsHub.test.ts` (DevtoolsHub.ts 86.6% — lines ~442, 511, 528, 539 and the ranges the report names)
- `packages/devtools-app/src/__tests__/inspectorSession.test.ts` (90.9%, line 29), `relaySession.test.ts` (87.5%, line 39)

This task is deliberately specified by TARGET, not by transcribed test code: the dark branches are only identifiable by reading each source file against the coverage table, which the implementer must do first. Contract:

- [ ] **Step 1: Measure** — run the two coverage commands from Global Constraints and write the per-file dark-line list for the five files into the report BEFORE writing a test.
- [ ] **Step 2: Drive every dark line through behaviour, not internals.** `ValueView` through its public props as `StateTreePanel`/`ContextPane` use it (nested objects, arrays, long strings/truncation, `SerializedValue` tags — whichever the dark lines are); `WsRelayDuplex` through a `FakeSocket` (`__tests__/FakeSocket.testHelpers.ts` in devtools-app shows the shape) — reconnect after close, send-before-open buffering, error path; `DevtoolsHub` through its public API the way `inspector.test.ts` does (dormancy, coalescing, ring-buffer overflow, disposed-machine retention past `MAX_DISPOSED_RETAINED`); the two session files through their exported factory with a fake duplex.
- [ ] **Step 3: Targets** — every one of the five files ≥95% statements; `@rtc/devtools-core` aggregate ≥95% statements and ≥85% branches (Task 10 gates exactly these numbers — if a file cannot reach 95% because a branch is unreachable, report it with the line and why; do not delete code to make the number).
- [ ] **Step 4: Gates + Commit** — `test(devtools): backfill ValueView, WsRelayDuplex, DevtoolsHub, session coverage`.

---

### Task 10: Coverage gate for both devtools packages + report tiers + STATUS

**Files:**
- Modify: `packages/devtools-app/package.json` (scripts + devDependency `@vitest/coverage-v8`), `packages/devtools-app/vitest.config.ts`, `packages/devtools-core/vitest.config.ts`, `.github/workflows/ci.yml` (after the solid gate step, before `Build`), `.github/workflows/coverage-report.yml` (two tier steps + two `tiers=(…)` entries), `.claude/commands/rtc/gauntlet.md` (full tier), `CLAUDE.md` (the "eight tiers" prose + the `/rtc:gauntlet` row's "both ≥95% coverage gates"), `docs/STATUS.md`.

- [ ] **Step 1: devtools-app** — `package.json` scripts add `"test:coverage": "vitest run --coverage"`; devDependencies add `"@vitest/coverage-v8": "^4.1.10"` (same range as devtools-core; `pnpm install` afterwards, lockfile changes are expected). `vitest.config.ts`:

```ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.testHelpers.ts", "src/main.tsx"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
      // Same bar as the two web clients' ui:contract gates (ci.yml). Branches
      // at 85 for the same reason solid sits at 85: v8 counts every `?.` and
      // `??` as a branch pair, inflating the denominator on defensive code.
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 85 },
    },
  },
});
```
`main.tsx` is the mount entry (0% by construction) — excluded, as the client packages exclude theirs.

- [ ] **Step 2: devtools-core** — add the same `thresholds` line to its existing `coverage` block (keep its `include`).

- [ ] **Step 3: ci.yml** — after the solid gate step:

```yaml
      # The devtools packages carry the same bar. Aggregate gates cannot see one
      # weak file (STATUS.md, "Coverage-gap sweep") — the per-file report is the
      # coverage-report.yml tiers below; this step is the floor.
      - name: Devtools coverage gates (core + app, ≥95%, branches ≥85%)
        run: pnpm --filter @rtc/devtools-core test:coverage && pnpm --filter @rtc/devtools-app test:coverage
```

- [ ] **Step 4: coverage-report.yml** — two steps after "Coverage — server", same shape (`continue-on-error: true`, `pnpm --filter @rtc/devtools-core exec vitest run --coverage --coverage.reporter=json --coverage.reporter=html --reporter=default --reporter=json --outputFile.json=reports/unit/test-results.json`, and the `devtools-app` twin), and two `tiers=(…)` entries after the `server` line: `"devtools/core|devtools-core|packages/devtools-core/reports/unit/coverage"` and `"devtools/app|devtools-app|packages/devtools-app/reports/unit/coverage"`. Update the header comment's "eight tiers" → "ten tiers".

- [ ] **Step 5: gauntlet.md + CLAUDE.md** — add `pnpm --filter @rtc/devtools-core test:coverage   # ≥95%, branches ≥85%` and the app twin to the full tier list after the solid line (fast-tier count unchanged, so the CLAUDE.md "19 fast gates" prose stays); in `CLAUDE.md` change "**eight** tiers: `domain`, `server`, then …" to "**ten** tiers: `domain`, `server`, `devtools/core`, `devtools/app`, then …", and the `/rtc:gauntlet` row's "both ≥95% coverage gates" → "the four ≥95% coverage gates".

- [ ] **Step 6: STATUS.md** — in the "Devtools timeline UX — post-ship polish" entry delete the retired items (e2e State@seq, `importRecording` try, DiffView tokens, `reconstructError` test, radius timestamp, import badge, `argLabel` tests, `sort()` vs `localeCompare`, `flash.ts`, the Chrome-freeze environment note) and leave the Phase 2/3 items; bump `Last updated`.

- [ ] **Step 7: Run** `pnpm install`, both `test:coverage` scripts (must pass their thresholds — Task 9 made that true), `pnpm check:scripts`, `pnpm lint:actions`, `pnpm check:doc-links`, `pnpm exec biome ci .`. **Step 8: Commit** — `chore(ci): coverage gates + report tiers for devtools-core and devtools-app`.

---
# Phase 2 — structural (PR 2)

### Task 11: Split `ContextPane.tsx` → `StateTab.tsx` + `scopeState.ts`

**Files:**
- Create: `packages/devtools-app/src/timeline/StateTab.tsx`, `packages/devtools-app/src/timeline/scopeState.ts`
- Modify: `packages/devtools-app/src/timeline/ContextPane.tsx` (remove lines 300-406 `StateTabProps`/`StateTab`/`MachineLineProps`/`MachineLine` and 454-558 the pure helpers; import `StateTab` from `#/timeline/StateTab`), `scripts/react-compiler-healthcheck.mjs:78` (TRACKED entry `file:` → `packages/devtools-app/src/timeline/StateTab.tsx`, `fn: "StateTab"`, values unchanged)
- Test: create `packages/devtools-app/src/__tests__/StateTab.test.tsx`, `packages/devtools-app/src/__tests__/scopeState.test.ts`; trim `ContextPane.test.tsx`

**Interfaces:**
- `StateTab.tsx` exports `StateTab({ state, presentState, marked, scope }: StateTabProps)` and `StateTabProps` (identical to today's private interface). `MachineLine` stays private inside it.
- `scopeState.ts` exports, unchanged in body: `EMPTY_IDS`, `streamsInScope(streams, scope)`, `machinesInScope(machines, scope)`, `changedIds<T>(pinned, live, keyOf, trackedValueOf)`, `streamKey`, `streamValue`, `machineKey`, `machineValue`, `filterStreams(streams, query)`.
- CSS stays in `ContextPane.module.css` (shared import from both files) — a pure code move, no CSS split.

- [ ] **Step 1: `scopeState.test.ts` first** (pure functions, no render): `streamsInScope` — presenter scope keeps only that presenter's streams, stream scope keeps the exact id, `all`/`machineKind`/`wire` pass through; `machinesInScope` — kind and id narrowing, others pass through; `changedIds` — pinned row with no live twin is changed, JSON-different tracked value is changed, equal is not; the four accessors; `filterStreams` — empty query returns input identity, matches by id substring case-insensitively, matches by serialized value, no match → `[]`. Target 100%.
- [ ] **Step 2: Move the eight helpers + `EMPTY_IDS`** verbatim into `scopeState.ts` (exported), run the test → PASS.
- [ ] **Step 3: `StateTab.test.tsx`** mounting `<StateTab>` directly with hand-built `InspectorState` fixtures: presenter scope narrows + shows the search box; stream scope hides the search; `machineKind` scope lists that kind, `marked` + differing state renders `≠ live`; `machine` scope renders the single machine's `ValueView`; search matches by id and by value. Target ≥95%.
- [ ] **Step 4: Move `StateTab` + `MachineLine`** into `StateTab.tsx` (lede = `StateTab`, `MachineLine` below it), wire the import in `ContextPane.tsx`, update the healthcheck TRACKED path. Remove from `ContextPane.test.tsx` only the cases that now live in `StateTab.test.tsx` (keep every routing/Event/Diff/wire-scope/agedOut/reconstructError case). ContextPane.tsx should land near 400 lines.
- [ ] **Step 5: Run** all three test files, coverage per file, `pnpm check:compiler` (must print `ok … StateTab.tsx  StateTab …`), `pnpm lint:dead`, `pnpm lint`. **Step 6: Commit** — `refactor(devtools): extract StateTab + scopeState from ContextPane`.

---

### Task 12: Re-track `rows` — fused-block discriminator in the compiler healthcheck

**Files:**
- Modify: `scripts/react-compiler-healthcheck.mjs` (per-value loop lines ~271-306; TRACKED `useTimeline` entry lines ~61-71; the "Deliberately NOT tracked" prose ~134-151)

Background: the compiler fuses `filter`/`rows`/`t2` into one cache block, so `rows` compiles as `let rows;` + `rows = filterLog(log, filter); … $[10] = rows;` in the `if`, and `rows = $[10];` in the `else`. The `else`-branch readback from the same numbered slot is the memoization witness.

- [ ] **Step 1: Add the discriminator** (module-level function, below the loop's enclosing function per newspaper order):

```js
// Fused-block shape: `let name;` declared bare, assigned inside
// `if ($[n] !== …) { … name = <expr>; … $[k] = name; … } else { … name = $[k]; … }`.
// The compiler merged this value's reactive scope with a sibling that reads
// it. Witness = the else-branch readback from the SAME slot it was written to.
// `[\s\S]*?` (not `[^}]*?`): the if-block legitimately contains nested object
// literals (`filter = { ...a, ...b }`), whose braces a negated class cannot cross.
function fusedBlockMemoized(code, name) {
  const bareDecl = new RegExp(`(?:const|let)\\s+${name};`);
  if (!bareDecl.test(code)) {
    return false;
  }
  const fused = new RegExp(
    `if\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\b${name}\\s*=\\s*[^;\\n]+;[\\s\\S]*?\\$\\[(\\d+)\\]\\s*=\\s*${name};[\\s\\S]*?\\}\\s*else\\s*\\{[\\s\\S]*?\\b${name}\\s*=\\s*\\$\\[\\1\\];[\\s\\S]*?\\}`,
  );
  return fused.test(code);
}
```
and in the loop's `declMatch === null` branch, first:

```js
if (fusedBlockMemoized(code, name)) {
  console.log(`ok  ${file}  ${fn}  ${name}  (memoized, fused block)`);
  continue;
}
```

- [ ] **Step 2: Re-add `rows`** to the `useTimeline` TRACKED entry: `values: ["reconstruction", "rows"]`, with a one-line comment that the fused-block discriminator classifies it. Delete the `rows` bullet from the "Deliberately NOT tracked" prose (leave `filter` untracked and say so in one line).
- [ ] **Step 3: Positive check** — `pnpm check:compiler` prints `ok  packages/devtools-app/src/timeline/useTimeline.ts  useTimeline  rows  (memoized, fused block)` and exits 0.
- [ ] **Step 4: Negative check (mandatory, report the output)** — temporarily wrap `rows`'s computation in `useTimeline.ts` in a `try { … } catch { … }` (a known compiler bail), run `pnpm check:compiler`, confirm it FAILS naming `rows`, then revert the source edit. The gate must be two-sided; a discriminator that only ever says "ok" is worse than none.
- [ ] **Step 5: Commit** — `chore(compiler): classify fused cache blocks; re-track useTimeline.rows`.

---

### Task 13: Evicted machines get an `Evicted (n)` leaf under Machines

**Files:**
- Modify: `packages/devtools-app/src/nav/buildNavTree.ts:139-173` (`machineKindNodes`)
- Test: `packages/devtools-app/src/__tests__/buildNavTree.test.ts`

`InspectorStore.evictDisposedMachines` (cap `MAX_DISPOSED_MACHINES = 500`) drops rows from `state.machines` while the log keeps their rows, so `All` ≥ Σ children. `tally.machines` (from the visible log, keyed by machineId) still knows them.

- [ ] **Step 1: Failing tests:**

```ts
test("machines the log still references but the store evicted surface as one Evicted leaf", () => {
  const state = stateWithMachines([]); // no live rows
  const log = [machineEventRow({ machineId: "ghost-1", seq: 1 }), machineEventRow({ machineId: "ghost-2", seq: 2 })];
  const machines = buildNavTree(state, log)[2]!;
  const evicted = machines.children.at(-1)!;
  expect(evicted.id).toBe("machines:evicted");
  expect(evicted.label).toBe("Evicted (2)");
  expect(evicted.scope).toBeNull();
  expect(evicted.count).toBe(2);
  expect(evicted.disposed).toBe(true);
});

test("no Evicted leaf when every logged machine is still in state", () => {
  // fixture with one live machine and its rows → Machines root has exactly the kind node
});
```
(Use the file's existing machine-row/log-row builders.)

- [ ] **Step 2: Implement** — in `machineKindNodes` collect `knownIds` from `state.machines`, and after the sorted kind nodes:

```ts
let evictedCount = 0;
let evictedRows = 0;
for (const [machineId, t] of tally.machines) {
  if (!knownIds.has(machineId)) {
    evictedCount += 1;
    evictedRows += t.count;
  }
}
if (evictedCount > 0) {
  nodes.push(evictedLeaf(evictedCount, evictedRows));
}
return nodes;
```
```ts
function evictedLeaf(machineCount: number, rowCount: number): NavNode {
  return {
    id: "machines:evicted",
    label: `Evicted (${machineCount})`,
    scope: null,
    count: rowCount,
    lastSeq: 0,
    disposed: true,
    detail: "past the disposed-machine cap; rows stay in the log",
    children: [],
  };
}
```
(`count` = rows, so Σ children = All's machine-family rows; the label counts machines. If `Tally` has no `count` field use whatever it names its row count. `scope: null` renders it like a header — unselectable, no `nav-node` testid — verify `NavRow` handles a `scope: null` leaf with `disposed: true` without a caret.)

- [ ] **Step 3: Run + gates. Step 4: Commit** — `fix(devtools): nav tree shows evicted machines so All = Σ children`.

---

### Task 14: Dismissing the radius chip pops the probe scope

**Files:**
- Modify: `packages/devtools-app/src/InspectorApp.tsx` (~104-151), `packages/devtools-app/src/timeline/TimelinePane.tsx:20-26,140-149`
- Test: `packages/devtools-app/src/__tests__/InspectorApp.test.tsx`, `TimelinePane.test.tsx`

The chip calls `model.clearRadius` only; `escapeTimeline` pairs it with `navigation.popScope()`. Both dismissals must be the same operation.

- [ ] **Step 1: Failing test** (InspectorApp journey style — probe from a presenter scope, dismiss via the CHIP, expect the scope to return to the presenter and no stale history):

```ts
test("dismissing the radius chip returns to the pre-probe scope, same as Escape", () => {
  // ...mount, select presenter node "fx" (existing selectNavNode helper), pin a wire row, click "wire ±100ms"...
  expect(selectedNavScopeId()).toBe("all");
  fireEvent.click(screen.getByTitle("Clear radius filter"));
  expect(screen.queryByText(/^±100ms @ /)).toBeNull();
  expect(selectedNavScopeId()).toBe("presenter:fx");
  fireEvent.keyDown(window, { key: "Escape" });   // nothing left to pop: stays on fx, resumes the pin
  expect(selectedNavScopeId()).toBe("presenter:fx");
});
```
(`selectedNavScopeId` — the file reads the selected `nav-node`'s `data-scope-id`; reuse its helper.)

- [ ] **Step 2: Implement** — `InspectorApp.tsx`:

```ts
function dismissRadius(): void {
  navigation.popScope();
  timeline.clearRadius();
}

function escapeTimeline(): void {
  if (timeline.filter.radius !== null) {
    dismissRadius();
    return;
  }
  // ...unchanged...
}
```
`TimelinePaneProps` gains `onDismissRadius: () => void` (a slot — `onX` is correct); the chip's `onClick={onDismissRadius}`; `InspectorApp` passes `onDismissRadius={dismissRadius}`. `TimelinePane.test.tsx` passes a `vi.fn()` and asserts the chip calls it.

- [ ] **Step 3: Run + gates. Step 4: Commit** — `fix(devtools): radius chip dismiss pops the probe scope like Escape`.

---

### Task 15: Tree cursor follows programmatic scope changes (render-time derivation)

**Files:**
- Modify: `packages/devtools-app/src/nav/NavTree.tsx:21-22,59,119`
- Test: `packages/devtools-app/src/__tests__/NavTree.test.tsx`

`useState(scopeKey(scope))` seeds once; a scope change from outside the tree (probe push/pop, Esc, "show in All", datasource swap) moves the highlight but not the keyboard cursor. **No `useEffect` + setter (lint error `react-hooks/set-state-in-effect`).** The cursor state records which selection it was set against; when the selection changes underneath it, the derived cursor snaps to the selection.

- [ ] **Step 1: Failing test** — a harness whose `scope` is driven by its own `useState` and exposed via a button OUTSIDE the tree (not through `onSelect`):

```tsx
test("a scope change from outside the tree moves the keyboard cursor to the new selection", () => {
  mountWithExternalScope();                // starts on "all"
  fireEvent.click(screen.getByTestId("external-select-blotter"));
  node("presenter:blotter").focus();
  pressKey("ArrowDown");
  expect(document.activeElement).toBe(node("presenter:priceHistory"));  // moved FROM blotter, not from all
});
```
(`node`/`pressKey` are the file's helpers; the harness renders `<NavTree nodes scope={scope} onSelect={setScope} />` plus `<button data-testid="external-select-blotter" onClick={() => { setScope(blotterScope); }} />`. Pick the sibling that the fixture actually places after blotter.)

- [ ] **Step 2: Implement:**

```ts
interface TreeCursor {
  id: string;
  /** The selection this cursor was placed under; a different selection means the cursor is stale. */
  forSelection: string;
}

const selectedId = scopeKey(scope);
const [cursor, setCursor] = useState<TreeCursor>({ id: selectedId, forSelection: selectedId });
const cursorId = cursor.forSelection === selectedId ? cursor.id : selectedId;

function moveCursorTo(id: string): void {
  setCursor({ id, forSelection: selectedId });
}
```
Replace every `setCursorId(x)` with `moveCursorTo(x)`; leave `selectThisNode`'s explicit `onMoveCursorTo` call in place (it keeps the click path synchronous).

- [ ] **Step 3: Run** `NavTree.test.tsx` + `InspectorApp.test.tsx` + gates (`pnpm lint` must be clean of `react-hooks/*`). **Step 4: Commit** — `fix(devtools): nav cursor follows scope changes made outside the tree`.

---

### Task 16: `LiveHistory` trims on a frame cap too (`maxFrames`)

**Files:**
- Modify: `packages/devtools-core/src/LiveHistory.ts` (options ~1-30, constructor, `trim()` ~210-246, `fromRecording`)
- Test: `packages/devtools-core/src/__tests__/liveHistory.test.ts`
- Docs: `docs/architecture/20-devtools.md` if it names `maxEvents` (grep; add `maxFrames` beside it)

- [ ] **Step 1: Failing test:**

```ts
it("trims zero-event frames past maxFrames even when totalEvents never grows", () => {
  const history = new LiveHistory({ maxFrames: 5, checkpointInterval: 3 });
  for (let i = 0; i < 20; i += 1) {
    history.record({ kind: "welcome", v: PROTOCOL_VERSION, appId: "a" });
  }
  expect(history.eventCount).toBe(0);
  expect(history.toRecording("a", 0).frames.length).toBeLessThanOrEqual(6); // seed + ≤5 retained
});
```
(Use the welcome frame shape the file's other tests use.)

- [ ] **Step 2: Implement** — `DEFAULT_MAX_FRAMES = 20_000`; `LiveHistoryOptions.maxFrames?: number` (doc: frames of every kind count — welcome/snapshot/bye carry zero events and never trip `maxEvents`); constructor `this.maxFrames = options?.maxFrames ?? DEFAULT_MAX_FRAMES;`; `trim()` condition becomes `this.frames.length > 1 && (this.totalEvents > this.maxEvents || this.frames.length > this.maxFrames)`; `fromRecording` passes `maxFrames: Number.POSITIVE_INFINITY` beside its existing `maxEvents: Number.POSITIVE_INFINITY`.
- [ ] **Step 3: Run + coverage (`LiveHistory.ts` ≥95%) + gates. Step 4: Commit** — `fix(devtools-core): LiveHistory bounds frames, not only events`.

---

### Task 17: Exact mount seed via `store.clone()`

**Files:**
- Modify: `packages/devtools-app/src/InspectorApp.tsx:63`
- Test: `packages/devtools-app/src/__tests__/InspectorApp.test.tsx` (the existing seed test at ~495 uses `coalesce: false`, which cannot see the window)

`getSnapshot()` is stable between rAF flushes (`FRAMES_PER_FLUSH = 4` ≈ 66 ms); events applied pre-mount but not yet flushed are in the store, invisible to the seed, and never tapped.

- [ ] **Step 1: Failing test** — build a DEFAULT store (`new InspectorStore()`, coalescing on), `store.apply(...)` a welcome + a batch carrying a stream emission for `"fx.price[[\"EURUSD\"]]"` synchronously (no rAF has run — vitest jsdom has no automatic frame), render `InspectorApp`, then assert the seeded history sees it: `liveHistory.stateAt(liveHistory.latestSeq).streams` contains that stream (read the ~495 test for how `liveHistory` is reached).
- [ ] **Step 2: Implement** — `liveHistory.record(projectSnapshot(store.clone().getSnapshot()));` with a two-line comment: the coalesced live snapshot lags applied state by up to `FRAMES_PER_FLUSH` frames; `clone()` folds synchronously.
- [ ] **Step 3: Run + gates. Step 4: Commit** — `fix(devtools): seed history from an exact store clone, not the coalesced snapshot`.

---

### Task 18: Phase 2 docs + STATUS

**Files:** `docs/architecture/20-devtools.md` §20.12 (one line each: Evicted leaf; cursor-follows-scope; chip dismiss = Escape; `maxFrames`; exact seed), `docs/STATUS.md` (delete the retired Phase 2 items: `ContextPane` size, `rows` re-tracked, evicted tally, `LiveHistory.trim`, seed-from-snapshot; add one line under the same entry: "`MachineRow.intents` is uncapped in `InspectorStore` — same failure class as the log cap, harden when it bites"), `CLAUDE.md` only if it names `ContextPane.tsx` (grep).

- [ ] Run `pnpm check:doc-links`, `pnpm exec biome ci .`. Commit — `docs(devtools): §20.12 phase-2 behaviours; STATUS retires the structural residuals`.

---

# Phase 3 — React DevTools extension interference (PR 3)

### Task 19: Disable the React DevTools hook on the inspector page (opt back in with `?react-devtools`)

**Files:**
- Create: `packages/devtools-app/src/disableReactDevtoolsHook.ts`
- Modify: `packages/devtools-app/src/main.tsx:1-4` (FIRST import), `packages/devtools-app/src/index.ts` (re-export), `packages/devtools-extension/src/panel/panel.tsx` (same first import — defence in depth; the panel is a `chrome-extension://` origin the extension's content script most likely never reaches, but the import is free)
- Test: `packages/devtools-app/src/__tests__/disableReactDevtoolsHook.test.ts`
- Docs: `docs/architecture/20-devtools.md` §20.10 (after the paragraph noting React installs `__REACT_DEVTOOLS_GLOBAL_HOOK__` even in production), `packages/devtools-app/README.md` (after "How to run"), `packages/devtools-extension/README.md` (before "## Build & load"), `docs/STATUS.md` (delete the interference finding; the polish entry can now go entirely if nothing else remains).

> **SUPERSEDED at execution (2026-08-30).** The import-order design below was ruled out: `biome.jsonc` sets `sortBareImports: true` and no import group sorts ahead of `react`, so a side-effect import cannot be kept first without a lint disable, which the repo bans. Shipped instead (PR #620): a classic inline `<script>` in `packages/devtools-app/index.html` before the module entry, unit-tested by extracting it, and asserted post-build by `check:devtools-dist`; the extension panel carries no guard (MV3 CSP forbids inline scripts; React DevTools does not attach to `chrome-extension://` pages). See `docs/architecture/20-devtools.md` §20.10.

Why this shape: `react-dom@19.2.8` calls `injectInternals()` ONCE, at module-evaluation time, and bails on `hook.isDisabled` before `hook.inject()`. ES-module import order — not `createRoot` timing — decides; a side-effect module imported first runs before `react-dom/client` evaluates. Biome's import sorter treats side-effect imports as group separators and does not move them (verify with `pnpm exec biome ci .`).

- [ ] **Step 1: Failing test:**

```ts
import { beforeEach, expect, test, vi } from "vitest";

interface HookWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: { isDisabled?: boolean };
}

beforeEach(() => {
  vi.resetModules();
  delete (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  window.history.replaceState(null, "", "/devtools/");
});

test("importing the module disables an installed hook", async () => {
  (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false };
  await import("#/disableReactDevtoolsHook");
  expect((window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__?.isDisabled).toBe(true);
});

test("?react-devtools keeps the hook enabled for debugging the inspector itself", async () => {
  window.history.replaceState(null, "", "/devtools/?react-devtools");
  (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false };
  await import("#/disableReactDevtoolsHook");
  expect((window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__?.isDisabled).toBe(false);
});

test("no hook installed is a no-op", async () => {
  await expect(import("#/disableReactDevtoolsHook")).resolves.toBeDefined();
});
```

- [ ] **Step 2: Module:**

```ts
/** Neutralises the React DevTools browser extension on the inspector page,
 * BEFORE react-dom evaluates. The extension's backend serialises every
 * component's props on every commit; the inspector deliberately carries a
 * 5000-row log and whole InspectorState snapshots as props, so under live
 * traffic (~15 commits/s) the extension storms `RangeError: Invalid string
 * length` and the tab goes unresponsive (live-acceptance, 2026-07-21).
 * react-dom's injectInternals() runs at module-evaluation time and bails on
 * `hook.isDisabled` — so this must be the FIRST import of the entry module.
 * Opt back in (to debug the inspector's own React tree) with `?react-devtools`. */
disableReactDevtoolsHook(readReactDevtoolsHook(), keepReactDevtools(globalThis.location));

interface ReactDevtoolsHook {
  isDisabled?: boolean;
}

interface HookHost {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook;
}

function readReactDevtoolsHook(): ReactDevtoolsHook | undefined {
  return (globalThis as HookHost).__REACT_DEVTOOLS_GLOBAL_HOOK__;
}

function keepReactDevtools(location: Location | undefined): boolean {
  if (location === undefined) {
    return false;
  }
  return new URLSearchParams(location.search).has("react-devtools");
}

function disableReactDevtoolsHook(hook: ReactDevtoolsHook | undefined, keep: boolean): void {
  if (hook !== undefined && !keep) {
    hook.isDisabled = true;
  }
}
```
`main.tsx`: `import "#/disableReactDevtoolsHook"; // must stay the first import — see the module header` above `import { StrictMode } from "react";`. `index.ts`: `export {} from` is not needed — add `import "#/disableReactDevtoolsHook";`? **No** — the library entry must not carry the side effect; instead `panel.tsx` imports it by path via the package's export map: add `"./disableReactDevtoolsHook": "./src/disableReactDevtoolsHook.ts"` to `packages/devtools-app/package.json` `exports`, and `panel.tsx` gets `import "@rtc/devtools-app/disableReactDevtoolsHook";` as its first import. (knip: the file is reachable from `main.tsx`; the export-map entry keeps the extension import resolvable.)

- [ ] **Step 3: Docs** — §20.10 paragraph (≤8 lines): the mechanism, the symptom, the opt-in flag, and that the extension panel gets the same import defensively. README lines: "The inspector page disables the React DevTools extension for itself (`?react-devtools` re-enables it) — see §20.10" in devtools-app; in devtools-extension: "The RTC panel is its own `chrome-extension://` page; React DevTools does not attach there, and the panel imports the same guard the same-origin page uses."

- [ ] **Step 4: Run** the unit test, `pnpm --filter @rtc/devtools-app build`, `pnpm --filter @rtc/devtools-extension build`, `pnpm build && pnpm check:devtools-dist`, `pnpm lint:dead`, `pnpm exec biome ci .` (confirm the import stayed first), `pnpm check:doc-links`.

- [ ] **Step 5: Live verification (controller/user, not the implementer)** — `pnpm dev:react:fs`, open `/devtools/` with the React DevTools extension installed: `window.__REACT_DEVTOOLS_GLOBAL_HOOK__.isDisabled === true` in the inspector tab's console, the extension icon shows "no React", no `RangeError` under live traffic; `/devtools/?react-devtools` shows the React tree again.

- [ ] **Step 6: Commit** — `fix(devtools): disable the React DevTools hook on the inspector page (opt-in ?react-devtools)`.

---

## Self-review notes (written with the plan)

- **Coverage of the register:** Phase 1 retires STATUS items argLabel/sort/flash/importRecording/reconstructError/DiffView/radius/badge/e2e + the environment note, and adds the gate + backfill the user asked for; Phase 2 retires ContextPane size/`rows`/evicted/`previousScope`/cursor/trim/seed; Phase 3 retires the interference finding. Left parked, deliberately: `MachineRow.intents` uncapped (Task 18 logs it), the RN inspector decision, the v2 extension specs.
- **Deliberate deviation from "no placeholders":** Task 9 specifies targets and the driving behaviours rather than transcribed test code — the dark lines are only knowable by reading the five files against the coverage table, which the implementer does first and reports.
- **Type consistency:** `ImportedRecording` (Task 6) is the type `useRecording.ts:14-19` already exports; `TESTIDS.devtools.stateAtSeq` (Task 8) is the only new testid; `useFlashOnSeq` (Task 2) signature matches both callers' `RefObject<HTMLSpanElement>` refs; `onDismissRadius` (Task 14) is a slot, so `onX` naming is correct under `rtc/name-functions-by-effect`.
- **Ordering hazards:** Task 10's thresholds only pass after Task 9; Task 8's e2e needs `pnpm --filter @rtc/devtools-app build` first; Task 11 must update the healthcheck TRACKED path in the same commit or `check:compiler` reds; Task 12's negative check is mandatory.
