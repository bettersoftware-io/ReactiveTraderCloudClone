# DevTools Store-First Navigation (v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the inspector to the Redux DevTools mental model — one navigation tree (All / Presenters→streams / Machines→kind→instance / Wire→msgType) replaces the filter rail and the three lenses; selecting a node scopes the actions list, State, Diff and a new Machine tab; **Clear** hides everything before now.

**Architecture:** Panel-side only, inside `@rtc/devtools-app`. A `Scope` value compiles into the `TimelineFilter` that `useTimeline` already understands (`compileScope`), so the scoped list *is* today's `TimelinePane` with a compiled filter. Clear is a `clearedBeforeSeq` watermark in that same filter — `InspectorStore` and `LiveHistory` are never touched. Two STATUS defects that live in the same lines are folded in: the pinned row is captured at pin time (survives log-cap eviction), and follow mode auto-scrolls only while the pane is at the bottom.

**Tech Stack:** TypeScript, React 19 (React Compiler — no manual memo), CSS Modules, vitest + @testing-library/react (jsdom), Playwright (existing `devtools.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-08-29-devtools-store-first-navigation-design.md` — executors read the spec alongside this plan; section numbers below (§3.1, §5 …) refer to it.

## Global Constraints

- **No changes outside `packages/devtools-app/`, `tests/browser/`, and `docs/`.** `@rtc/devtools-core`, both clients' hubs/manifests, `devtools-relay`, `devtools-extension` are untouched (spec §7, §10). `PROTOCOL_VERSION` stays 2, `RECORDING_VERSION` stays 1.
- **No new dependencies.** `@rtc/devtools-app` stays `devtools-core` + `react` + `react-dom`.
- **Imports:** `#/` subpath alias inside `devtools-app` (`#/nav/scope`, `#/timeline/...`). Never ≥2-up relative imports.
- **Lint gates:** Biome (mandatory braces on every control statement; no `biome-ignore`; import sort — run `npx biome ci .` not just `lint`), custom ESLint (`rtc/name-functions-by-effect`: a concrete handler is named for its **effect** — `pinTimelineRow`, `clearTimeline` — never `onClick`/`handleX`; `onX` names are reserved for slot props; newspaper order: exported component first, sub-components, then helpers; named `interface XProps` for every component, no inline object types; no inline `style={{…}}`; no render-functions). Explicit return types on every function (`: ReactElement`, `: void`).
- **React Compiler, not manual memo** (ADR-003): no `useMemo`/`useCallback`; derive values inline.
- **Tests:** `packages/devtools-app/src/__tests__/*.test.ts(x)`; style = `import { expect, test } from "vitest"` + `@testing-library/react` + `afterEach(cleanup)`; nested `Harness` components inside a `mount()` function (Biome forbids top-level component declarations and any exports in test files); stub `Element.prototype.animate` where a flash can run (jsdom has no WAAPI). Check **per-file** coverage of every new/changed file with `pnpm --filter @rtc/devtools-app exec vitest run --coverage` (never trust the aggregate).
- **`data-testid`s that MUST keep working:** `connection-badge`, `devtools-stream-row`, `devtools-machine-row`, `timeline-row` (+ `data-seq`, `data-family`), `pinned-bar`, `context-tab-event|state|diff`, `intent-injector`, `intent-invoke-button`, `intent-confirm`, `intent-confirm-yes`, `intent-error`, `intent-name`, `record-toggle`, `export`, `export-buffer`, `import`, `import-label`, `import-error`, `recording-banner`, `back-to-live`. **Retired:** `lens-timeline|machines|wire`. **New:** `nav-node` (+ `data-scope-id`), `clear-log`, `unclear-log`, `live-chip`, `show-in-all`, `context-tab-machine`.
- **Copy (exact strings):** Clear button `Clear`; Unclear button `Unclear`; live chip `⤓ live`; pinned bar suffixes `(before clear)`, `(evicted from log)`, ` — not in this scope`, button `show in All`; wire-scope State reason `wire messages carry no state`; wire probe button `wire ±100ms`; search placeholder `Search scope… ( / )`.
- **Commands** (from the worktree root): `pnpm --filter @rtc/devtools-app test`, `pnpm --filter @rtc/devtools-app typecheck`, `npx biome ci packages/devtools-app tests`, `pnpm lint`. E2E (one client at a time, from `tests/`): `pnpm --filter @rtc/tests test:browser:playwright devtools.spec.ts` (react) and `pnpm --filter @rtc/tests test:browser:playwright:solid devtools.spec.ts`. Commit after every task with a conventional message.

---

### Task 1: `nav/scope.ts` — `Scope`, `parseStreamId`, `compileScope`, labels

Pure module, no React. Everything downstream keys off these names.

**Files:**
- Create: `packages/devtools-app/src/nav/scope.ts`
- Test: `packages/devtools-app/src/__tests__/scope.test.ts`

**Interfaces:**
- Consumes: `FamilyFilterState`, `SourcePill`, `ALL_FAMILIES_ON` from `#/timeline/timelineModel`; `InspectorState` from `@rtc/devtools-core`.
- Produces:
  - `type Scope = {kind:"all"} | {kind:"presenter";presenter} | {kind:"stream";streamId} | {kind:"machineKind";machineKind} | {kind:"machine";machineId} | {kind:"wire"} | {kind:"msgType";msgType}`
  - `const ALL_SCOPE: Scope`
  - `scopeKey(scope): string` — `"all"`, `"presenter:blotter"`, `"stream:blotter.trades$"`, `"machineKind:tileExecution"`, `"machine:m3"`, `"wire"`, `"msgType:PRICE"` (these are also the NavTree node ids).
  - `scopesEqual(a, b): boolean`
  - `parseStreamId(streamId): ParsedStreamId` — `{ presenter, prop, argsKey: string | null }`
  - `interface ScopeFilter { families: FamilyFilterState; pills: readonly SourcePill[] | null }` and `compileScope(scope, state): ScopeFilter` (`pills: null` = unconstrained; `[]` = matches nothing — see Task 2).
  - `streamLeafLabel(streamId): string` — `prop` + `` ` · ${args}` `` when parameterized (`price$ · EURUSD`).
  - `shortLabel(streamId, scope): string` — full id under `all`; `streamLeafLabel` under a matching `presenter`; the args label (or `prop` when unparameterized) under `stream`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/devtools-app/src/__tests__/scope.test.ts
import { expect, test } from "vitest";

import type { InspectorState } from "@rtc/devtools-core";

import {
  ALL_SCOPE,
  compileScope,
  parseStreamId,
  scopeKey,
  scopesEqual,
  shortLabel,
  streamLeafLabel,
} from "#/nav/scope";

test("parseStreamId splits presenter / prop / args for the three id shapes", () => {
  expect(parseStreamId("blotter.trades$")).toEqual({
    presenter: "blotter",
    prop: "trades$",
    argsKey: null,
  });
  expect(parseStreamId('priceHistory.history$[["EURCAD"]]')).toEqual({
    presenter: "priceHistory",
    prop: "history$",
    argsKey: '[["EURCAD"]]',
  });
  expect(
    parseStreamId('priceStream.price$[[{"symbol":"EURUSD","ratePrecision":5}]]'),
  ).toEqual({
    presenter: "priceStream",
    prop: "price$",
    argsKey: '[[{"symbol":"EURUSD","ratePrecision":5}]]',
  });
  // No dot at all: the whole id is the presenter and the prop is empty.
  expect(parseStreamId("orphan")).toEqual({
    presenter: "orphan",
    prop: "",
    argsKey: null,
  });
});

test("scopeKey is stable and unique per variant; scopesEqual compares by key", () => {
  expect(scopeKey(ALL_SCOPE)).toBe("all");
  expect(scopeKey({ kind: "presenter", presenter: "blotter" })).toBe(
    "presenter:blotter",
  );
  expect(scopeKey({ kind: "stream", streamId: "blotter.trades$" })).toBe(
    "stream:blotter.trades$",
  );
  expect(scopeKey({ kind: "machineKind", machineKind: "tileExecution" })).toBe(
    "machineKind:tileExecution",
  );
  expect(scopeKey({ kind: "machine", machineId: "m3" })).toBe("machine:m3");
  expect(scopeKey({ kind: "wire" })).toBe("wire");
  expect(scopeKey({ kind: "msgType", msgType: "PRICE" })).toBe("msgType:PRICE");
  expect(
    scopesEqual({ kind: "machine", machineId: "m3" }, { kind: "machine", machineId: "m3" }),
  ).toBe(true);
  expect(scopesEqual(ALL_SCOPE, { kind: "wire" })).toBe(false);
});

test("compileScope: every variant compiles to families + pills", () => {
  const state = stateWith();

  expect(compileScope(ALL_SCOPE, state)).toEqual({
    families: { stream: true, machine: true, wire: true, devtools: true },
    pills: null,
  });
  expect(compileScope({ kind: "presenter", presenter: "blotter" }, state)).toEqual({
    families: { stream: true, machine: false, wire: false, devtools: false },
    pills: [
      { type: "stream", id: "blotter.activity$" },
      { type: "stream", id: "blotter.trades$" },
    ],
  });
  expect(compileScope({ kind: "stream", streamId: "blotter.trades$" }, state)).toEqual({
    families: { stream: true, machine: false, wire: false, devtools: false },
    pills: [{ type: "stream", id: "blotter.trades$" }],
  });
  expect(
    compileScope({ kind: "machineKind", machineKind: "tileExecution" }, state),
  ).toEqual({
    families: { stream: false, machine: true, wire: false, devtools: false },
    pills: [
      { type: "machine", id: "m1" },
      { type: "machine", id: "m2" },
    ],
  });
  expect(compileScope({ kind: "machine", machineId: "m2" }, state)).toEqual({
    families: { stream: false, machine: true, wire: false, devtools: false },
    pills: [{ type: "machine", id: "m2" }],
  });
  expect(compileScope({ kind: "wire" }, state)).toEqual({
    families: { stream: false, machine: false, wire: true, devtools: false },
    pills: null,
  });
  expect(compileScope({ kind: "msgType", msgType: "PRICE" }, state)).toEqual({
    families: { stream: false, machine: false, wire: true, devtools: false },
    pills: [{ type: "msgType", id: "PRICE" }],
  });
});

test("compileScope: a presenter/kind with no members yields an EMPTY pill set, not an unconstrained one", () => {
  const state = stateWith();

  expect(compileScope({ kind: "presenter", presenter: "gone" }, state).pills).toEqual([]);
  expect(compileScope({ kind: "machineKind", machineKind: "gone" }, state).pills).toEqual([]);
});

test("labels: streamLeafLabel and shortLabel per scope", () => {
  expect(streamLeafLabel("blotter.trades$")).toBe("trades$");
  expect(streamLeafLabel('priceHistory.history$[["EURCAD"]]')).toBe("history$ · EURCAD");
  expect(
    streamLeafLabel('priceStream.price$[[{"symbol":"EURUSD","ratePrecision":5}]]'),
  ).toBe("price$ · EURUSD");
  expect(streamLeafLabel('animationDirector.intentsFor[["tile:EURUSD"]]')).toBe(
    "intentsFor · tile:EURUSD",
  );
  // Unparseable args fall back to the raw args key.
  expect(streamLeafLabel("x.y$[not json]")).toBe("y$ · not json");

  const id = 'priceHistory.history$[["EURCAD"]]';

  expect(shortLabel(id, ALL_SCOPE)).toBe(id);
  expect(shortLabel(id, { kind: "presenter", presenter: "priceHistory" })).toBe(
    "history$ · EURCAD",
  );
  // A non-matching presenter scope (a stray row) keeps the full id.
  expect(shortLabel(id, { kind: "presenter", presenter: "blotter" })).toBe(id);
  expect(shortLabel(id, { kind: "stream", streamId: id })).toBe("EURCAD");
  expect(
    shortLabel("blotter.trades$", { kind: "stream", streamId: "blotter.trades$" }),
  ).toBe("trades$");
  expect(shortLabel(id, { kind: "wire" })).toBe(id);
});

function stateWith(): InspectorState {
  return {
    connected: true,
    dev: false,
    appId: "rtc-web",
    protocolMismatch: null,
    streams: [
      { streamId: "analytics.position$", lastValue: null, lastSeq: 0, totalEmissions: 0, ratePerSec: 0 },
      { streamId: "blotter.activity$", lastValue: null, lastSeq: 0, totalEmissions: 0, ratePerSec: 0 },
      { streamId: "blotter.trades$", lastValue: null, lastSeq: 0, totalEmissions: 0, ratePerSec: 0 },
    ],
    machines: [
      { machineId: "m1", machineKind: "tileExecution", args: ["EURUSD"], state: null, disposed: false, createdAt: 0, intents: [], transitions: 0 },
      { machineId: "m2", machineKind: "tileExecution", args: ["USDJPY"], state: null, disposed: false, createdAt: 0, intents: [], transitions: 0 },
      { machineId: "m3", machineKind: "incident", args: [], state: null, disposed: false, createdAt: 0, intents: [], transitions: 0 },
    ],
    log: [],
  };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/scope.test.ts`
Expected: FAIL — `Cannot find module '#/nav/scope'`.

- [ ] **Step 3: Implement `nav/scope.ts`**

```ts
// packages/devtools-app/src/nav/scope.ts
import type { InspectorState } from "@rtc/devtools-core";

import type { FamilyFilterState, SourcePill } from "#/timeline/timelineModel";
import { ALL_FAMILIES_ON } from "#/timeline/timelineModel";

/** The inspector's single selection — what the navigation tree has picked
 * (spec §3.2). Presenter = a store, its streams = slices; machines and the
 * wire are stores too. `all` is the unified timeline. */
export type Scope =
  | { kind: "all" }
  | { kind: "presenter"; presenter: string }
  | { kind: "stream"; streamId: string }
  | { kind: "machineKind"; machineKind: string }
  | { kind: "machine"; machineId: string }
  | { kind: "wire" }
  | { kind: "msgType"; msgType: string };

export const ALL_SCOPE: Scope = { kind: "all" };

export interface ParsedStreamId {
  presenter: string;
  prop: string;
  /** The raw `[…]` suffix `instrumentPresenters` appends for method streams
   * (the JSON-stringified arg tuple), or null for plain prop streams. */
  argsKey: string | null;
}

/** What a scope compiles down to — the two structural layers of
 * `TimelineFilter`. `pills: null` means unconstrained; an EMPTY array means
 * "matches nothing" (a presenter whose streams were all evicted must not
 * silently widen to every stream). */
export interface ScopeFilter {
  families: FamilyFilterState;
  pills: readonly SourcePill[] | null;
}

const NO_FAMILIES: FamilyFilterState = {
  stream: false,
  machine: false,
  wire: false,
  devtools: false,
};

/** Splits `key.prop` / `key.prop[JSON-args]` — the id convention written by
 * `instrumentPresenters` (devtools-core) and read by nobody in core. Lives
 * here on purpose: a future protocol with first-class identity deletes this
 * one helper. */
export function parseStreamId(streamId: string): ParsedStreamId {
  const dot = streamId.indexOf(".");

  if (dot === -1) {
    return { presenter: streamId, prop: "", argsKey: null };
  }

  const presenter = streamId.slice(0, dot);
  const rest = streamId.slice(dot + 1);
  const bracket = rest.indexOf("[");

  if (bracket === -1) {
    return { presenter, prop: rest, argsKey: null };
  }

  return {
    presenter,
    prop: rest.slice(0, bracket),
    argsKey: rest.slice(bracket),
  };
}

export function scopeKey(scope: Scope): string {
  switch (scope.kind) {
    case "all": {
      return "all";
    }

    case "presenter": {
      return `presenter:${scope.presenter}`;
    }

    case "stream": {
      return `stream:${scope.streamId}`;
    }

    case "machineKind": {
      return `machineKind:${scope.machineKind}`;
    }

    case "machine": {
      return `machine:${scope.machineId}`;
    }

    case "wire": {
      return "wire";
    }

    case "msgType": {
      return `msgType:${scope.msgType}`;
    }
  }
}

export function scopesEqual(a: Scope, b: Scope): boolean {
  return scopeKey(a) === scopeKey(b);
}

export function compileScope(scope: Scope, state: InspectorState): ScopeFilter {
  switch (scope.kind) {
    case "all": {
      return { families: ALL_FAMILIES_ON, pills: null };
    }

    case "presenter": {
      const presenter = scope.presenter;
      const pills = state.streams
        .filter((row) => {
          return parseStreamId(row.streamId).presenter === presenter;
        })
        .map((row): SourcePill => {
          return { type: "stream", id: row.streamId };
        });

      return { families: onlyFamily("stream"), pills };
    }

    case "stream": {
      return {
        families: onlyFamily("stream"),
        pills: [{ type: "stream", id: scope.streamId }],
      };
    }

    case "machineKind": {
      const kind = scope.machineKind;
      const pills = state.machines
        .filter((row) => {
          return row.machineKind === kind;
        })
        .map((row): SourcePill => {
          return { type: "machine", id: row.machineId };
        });

      return { families: onlyFamily("machine"), pills };
    }

    case "machine": {
      return {
        families: onlyFamily("machine"),
        pills: [{ type: "machine", id: scope.machineId }],
      };
    }

    case "wire": {
      return { families: onlyFamily("wire"), pills: null };
    }

    case "msgType": {
      return {
        families: onlyFamily("wire"),
        pills: [{ type: "msgType", id: scope.msgType }],
      };
    }
  }
}

/** Tree-leaf label: `trades$`, `history$ · EURCAD`, `price$ · EURUSD`. */
export function streamLeafLabel(streamId: string): string {
  const parsed = parseStreamId(streamId);

  if (parsed.argsKey === null) {
    return parsed.prop;
  }

  return `${parsed.prop} · ${argsLabel(parsed.argsKey)}`;
}

/** A stream id rendered relative to the current scope (spec §3.2): the full
 * id under `all` (and any scope that does not contain it), the leaf label
 * inside its own presenter, and just the args (or the prop) inside itself. */
export function shortLabel(streamId: string, scope: Scope): string {
  if (scope.kind === "presenter") {
    return parseStreamId(streamId).presenter === scope.presenter
      ? streamLeafLabel(streamId)
      : streamId;
  }

  if (scope.kind === "stream" && scope.streamId === streamId) {
    const parsed = parseStreamId(streamId);

    return parsed.argsKey === null ? parsed.prop : argsLabel(parsed.argsKey);
  }

  return streamId;
}

function onlyFamily(family: keyof FamilyFilterState): FamilyFilterState {
  return { ...NO_FAMILIES, [family]: true };
}

/** `[["EURCAD"]]` → `EURCAD`; `[[{"symbol":"EURUSD",…}]]` → `EURUSD` (the
 * first string-valued field of an object arg); anything unparseable → the
 * raw key minus its outer brackets. */
function argsLabel(argsKey: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(argsKey);
  } catch {
    return stripOuterBrackets(argsKey);
  }

  const tuple = Array.isArray(parsed) ? parsed : [parsed];

  return tuple
    .map((arg) => {
      return argLabel(arg);
    })
    .join(", ");
}

function argLabel(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }

  if (Array.isArray(arg)) {
    return arg
      .map((inner) => {
        return argLabel(inner);
      })
      .join(", ");
  }

  if (arg !== null && typeof arg === "object") {
    for (const value of Object.values(arg)) {
      if (typeof value === "string") {
        return value;
      }
    }
  }

  return JSON.stringify(arg) ?? "";
}

function stripOuterBrackets(argsKey: string): string {
  return argsKey.replace(/^\[+/, "").replace(/\]+$/, "");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/scope.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci packages/devtools-app && pnpm --filter @rtc/devtools-app typecheck
git add packages/devtools-app/src/nav/scope.ts packages/devtools-app/src/__tests__/scope.test.ts
git commit -m "feat(devtools-app): Scope union, parseStreamId, compileScope and scope-relative labels"
```

---

### Task 2: `timelineModel.ts` — nullable pills, `clearedBeforeSeq`, `logAfterSeq`, `hasSeq`

**Files:**
- Modify: `packages/devtools-app/src/timeline/timelineModel.ts`
- Modify: `packages/devtools-app/src/__tests__/timelineModel.test.ts`

**Interfaces:**
- Produces:
  - `TimelineFilter.pills: readonly SourcePill[] | null` (null = unconstrained). `EMPTY_TIMELINE_FILTER.pills === null`.
  - `TimelineFilter.clearedBeforeSeq: number` (0 = nothing cleared); `EMPTY_TIMELINE_FILTER.clearedBeforeSeq === 0`.
  - `logAfterSeq(log, seq): readonly LogRow[]` — rows with `row.seq > seq` (binary search; `seq <= 0` returns `log` itself).
  - `hasSeq(log, seq): boolean` — binary search on the seq-sorted log.
  - `filterLog` applies the watermark first, then families / pills / text / radius.

- [ ] **Step 1: Update the existing tests and add the new ones**

In `timelineModel.test.ts`, every filter literal that reads `pills: []` and means "no pill constraint" becomes `pills: null`, and every literal gains `clearedBeforeSeq: 0`. Then append:

```ts
import { hasSeq, logAfterSeq } from "#/timeline/timelineModel";

test("logAfterSeq drops everything at or before the watermark; 0 is a no-op", () => {
  const log = [row(emission(1, "a.x$", 1)), row(emission(3, "a.x$", 3)), row(emission(7, "a.x$", 7))];

  expect(logAfterSeq(log, 0)).toBe(log);
  expect(logAfterSeq(log, 3).map((r) => r.seq)).toEqual([7]);
  expect(logAfterSeq(log, 4).map((r) => r.seq)).toEqual([7]);
  expect(logAfterSeq(log, 7)).toEqual([]);
});

test("hasSeq finds present seqs and rejects absent ones", () => {
  const log = [row(emission(1, "a.x$", 1)), row(emission(3, "a.x$", 3))];

  expect(hasSeq(log, 3)).toBe(true);
  expect(hasSeq(log, 2)).toBe(false);
  expect(hasSeq([], 1)).toBe(false);
});

test("filterLog: clearedBeforeSeq hides older rows; an EMPTY pill set matches nothing", () => {
  const log = [row(emission(1, "a.x$", 1)), row(emission(2, "a.x$", 2)), row(wireIn(3, "PRICE"))];

  expect(
    filterLog(log, { ...EMPTY_TIMELINE_FILTER, clearedBeforeSeq: 1 }).map((r) => r.seq),
  ).toEqual([2, 3]);
  expect(filterLog(log, { ...EMPTY_TIMELINE_FILTER, pills: [] })).toEqual([]);
});
```

(`row`, `emission`, `wireIn` are the file's existing fixture helpers; add `EMPTY_TIMELINE_FILTER` to the import list.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/timelineModel.test.ts`
Expected: FAIL — `logAfterSeq`/`hasSeq` not exported; type errors on `clearedBeforeSeq`.

- [ ] **Step 3: Implement**

In `timelineModel.ts`:

```ts
export interface TimelineFilter {
  families: FamilyFilterState;
  /** null = no source constraint; [] = matches nothing (a scope with no
   * members). Compiled from the navigation scope, never user-edited. */
  pills: readonly SourcePill[] | null;
  text: string;
  radius: RadiusFilter | null;
  /** Clear (spec §5): rows with seq <= this are hidden everywhere. */
  clearedBeforeSeq: number;
}

export const EMPTY_TIMELINE_FILTER: TimelineFilter = {
  families: ALL_FAMILIES_ON,
  pills: null,
  text: "",
  radius: null,
  clearedBeforeSeq: 0,
};

/** Rows strictly after `seq` — the Clear watermark. Binary search on the
 * seq-sorted log so the per-render cost is O(log n) + slice. */
export function logAfterSeq(
  log: readonly LogRow[],
  seq: number,
): readonly LogRow[] {
  if (seq <= 0) {
    return log;
  }

  const index = indexOfSeq(log, seq);
  const start = log[index]?.seq === seq ? index + 1 : index;

  return start === 0 ? log : log.slice(start);
}

export function hasSeq(log: readonly LogRow[], seq: number): boolean {
  return log[indexOfSeq(log, seq)]?.seq === seq;
}

export function filterLog(
  log: readonly LogRow[],
  filter: TimelineFilter,
): readonly LogRow[] {
  const needle = filter.text.trim().toLowerCase();

  return logAfterSeq(log, filter.clearedBeforeSeq).filter((row) => {
    if (!filter.families[familyOf(row.kind)]) {
      return false;
    }

    if (filter.pills !== null && !rowMatchesPills(row, filter.pills)) {
      return false;
    }

    if (needle !== "" && !row.summary.toLowerCase().includes(needle)) {
      return false;
    }

    if (filter.radius !== null) {
      const delta = Math.abs(row.ts - filter.radius.centerTs);

      if (delta > filter.radius.windowMs) {
        return false;
      }
    }

    return true;
  });
}
```

Leave `sourceOfEvent`, `pillKey`, `findPredecessorRow`, `diffableValueOf`, `seqOfMachineIntent`, `rowMatchesPills`, `comparabilityKey`, `indexOfSeq` as they are. `useTimeline.ts` and `FilterControls.tsx` still compile (they only read `pills` — `FilterControls` maps over `model.filter.pills`; change that one expression to `(model.filter.pills ?? [])` so the intermediate state typechecks; both files are rewritten/deleted in Tasks 3 and 6).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/devtools-app test` (whole package — `useTimeline`, `TimelinePane`, `FilterControls` consumers must still pass) and `pnpm --filter @rtc/devtools-app typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-app/src/timeline/timelineModel.ts packages/devtools-app/src/timeline/FilterControls.tsx packages/devtools-app/src/__tests__/timelineModel.test.ts
git commit -m "feat(devtools-app): clearedBeforeSeq watermark and nullable pill constraint in the timeline filter"
```

---

### Task 3: `useTimeline` — scope-compiled filter, Clear/Unclear, captured pin, tail attachment

The hook's public shape changes; its three direct consumers (`FilterControls`, `TimelinePane`, `InspectorApp`) get the *minimal* edits that keep the package green — their real rewrites are Tasks 6 and 9.

**Files:**
- Modify: `packages/devtools-app/src/timeline/useTimeline.ts`
- Modify: `packages/devtools-app/src/timeline/FilterControls.tsx` (drop family checkboxes + pill chips; keep text input + radius chip)
- Modify: `packages/devtools-app/src/timeline/TimelinePane.tsx` (drop the source-pill button; `pin(row)`)
- Modify: `packages/devtools-app/src/InspectorApp.tsx` (pass `ALL_SCOPE` + `presentState`; drop the `addPill` cross-links; `pinTimelineAtIntent` looks the row up)
- Modify: `packages/devtools-app/src/__tests__/useTimeline.test.tsx`, `TimelinePane.test.tsx` (delete the "source adds a pill" test), `ContextPane.test.tsx` (`pin(seq)` → `pin(row)`)

**Interfaces:**
- Consumes: `Scope`, `ALL_SCOPE`, `compileScope` (Task 1); `filterLog`, `hasSeq`, `EMPTY_TIMELINE_FILTER`, `RADIUS_WINDOW_MS` (Task 2).
- Produces:
  ```ts
  export type TimelineSelection =
    | { mode: "follow" }
    | { mode: "pinned"; seq: number; row: LogRow };   // row captured at pin time (spec §6.2)
  export interface TimelineModel {
    selection: TimelineSelection;
    filter: TimelineFilter;                 // compiled scope + user text/radius/watermark
    rows: readonly LogRow[];
    selectedRow: LogRow | null;             // = selection.row while pinned
    pinnedState: InspectorState | null;
    agedOut: boolean;
    reconstructError: string | null;
    pinnedRowEvicted: boolean;              // pinned && !hasSeq(log, seq)
    pinnedRowHidden: boolean;               // pinned && !hasSeq(rows, seq)
    pinnedBeforeClear: boolean;             // pinned && seq <= clearedBeforeSeq
    tailAttached: boolean;                  // spec §6.1 — follow auto-scroll only while true
    pin: (row: LogRow) => void;
    resume: () => void;                     // follow + tailAttached = true
    selectPrev: () => void;
    selectNext: () => void;
    setText: (text: string) => void;
    setRadiusAround: (row: LogRow) => void;
    clearRadius: () => void;
    clear: () => void;                      // watermark = latest log seq; also resumes
    unclear: () => void;                    // watermark = 0
    setTailAttached: (attached: boolean) => void;
  }
  export function useTimeline(log, history, scope: Scope, presentState: InspectorState): TimelineModel
  ```
  `toggleFamily` / `addPill` / `removePill` are **removed**.

- [ ] **Step 1: Rewrite `useTimeline.test.tsx`**

Replace the file with:

```tsx
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import type { AppToInspector, InspectorState, LogRow } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import { useTimeline } from "#/timeline/useTimeline";

test("pin captures the row and reconstructs state at that seq; resume returns to follow", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  expect(result.current.selection).toEqual({ mode: "follow" });
  expect(result.current.pinnedState).toBeNull();

  act(() => {
    result.current.pin(rowAt(log, 1));
  });

  expect(result.current.selection.mode).toBe("pinned");
  expect(result.current.selectedRow?.seq).toBe(1);
  const pinnedRow = result.current.pinnedState?.streams.find((s) => {
    return s.streamId === "fx.price$";
  });
  expect(pinnedRow?.lastValue).toBe(1);

  act(() => {
    result.current.resume();
  });

  expect(result.current.selection).toEqual({ mode: "follow" });
  expect(result.current.pinnedState).toBeNull();
});

test("selectPrev from follow pins the last row; selectNext walks forward", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selectedRow?.seq).toBe(3);

  act(() => {
    result.current.selectPrev();
  });
  expect(result.current.selectedRow?.seq).toBe(2);

  act(() => {
    result.current.selectNext();
  });
  expect(result.current.selectedRow?.seq).toBe(3);
});

test("flags agedOut when the pinned seq precedes the retained window", () => {
  const history = new LiveHistory({ maxEvents: 2 });
  const store = new InspectorStore({ coalesce: false });

  for (const frame of priceFrames(10)) {
    history.record(frame);
    store.apply(frame);
  }

  const present = store.getSnapshot();
  const { result } = renderHook(() => {
    return useTimeline(present.log, history, ALL_SCOPE, present);
  });

  act(() => {
    result.current.pin(rowAt(present.log, 1));
  });

  expect(result.current.agedOut).toBe(true);
  expect(result.current.pinnedState).toBeNull();
});

test("a pinned row survives leaving the log: selectedRow stays, pinnedRowEvicted flips", () => {
  const { history, log, present } = seeded(3);
  const { result, rerender } = renderHook(
    ({ rows }: { rows: readonly LogRow[] }) => {
      return useTimeline(rows, history, ALL_SCOPE, present);
    },
    { initialProps: { rows: log } },
  );

  act(() => {
    result.current.pin(rowAt(log, 1));
  });
  expect(result.current.pinnedRowEvicted).toBe(false);

  // The store's LOG_CAP evicts oldest rows; simulate by handing the hook a
  // log that no longer contains seq 1.
  rerender({ rows: log.slice(1) });

  expect(result.current.selectedRow?.seq).toBe(1);
  expect(result.current.pinnedRowEvicted).toBe(true);
});

test("scope narrows rows; switching scope keeps the pin and flags it hidden", () => {
  const { history, log, present } = seeded(3, "blotter.trades$");
  const blotter: Scope = { kind: "presenter", presenter: "blotter" };
  const { result, rerender } = renderHook(
    ({ scope }: { scope: Scope }) => {
      return useTimeline(log, history, scope, present);
    },
    { initialProps: { scope: ALL_SCOPE } },
  );

  expect(result.current.rows.length).toBe(6);

  rerender({ scope: blotter });
  expect(
    result.current.rows.every((row) => {
      return row.summary.startsWith("blotter.");
    }),
  ).toBe(true);
  expect(result.current.rows.length).toBe(3);

  act(() => {
    result.current.pin(result.current.rows[0] as LogRow);
  });
  expect(result.current.pinnedRowHidden).toBe(false);

  rerender({ scope: { kind: "stream", streamId: "fx.price$" } });
  expect(result.current.selection.mode).toBe("pinned");
  expect(result.current.pinnedRowHidden).toBe(true);
});

test("clear hides everything at or before the latest seq, resumes, and unclear restores", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  act(() => {
    result.current.pin(rowAt(log, 2));
  });
  act(() => {
    result.current.clear();
  });

  expect(result.current.filter.clearedBeforeSeq).toBe(3);
  expect(result.current.rows).toEqual([]);
  expect(result.current.selection).toEqual({ mode: "follow" });

  act(() => {
    result.current.unclear();
  });

  expect(result.current.filter.clearedBeforeSeq).toBe(0);
  expect(result.current.rows.length).toBe(3);
});

test("a moment pinned before a later clear is flagged pinnedBeforeClear", () => {
  const { history, log, present } = seeded(3);
  const { result, rerender } = renderHook(
    ({ rows }: { rows: readonly LogRow[] }) => {
      return useTimeline(rows, history, ALL_SCOPE, present);
    },
    { initialProps: { rows: log.slice(0, 2) } },
  );

  act(() => {
    result.current.clear();
  });
  rerender({ rows: log });

  act(() => {
    result.current.pin(rowAt(log, 3));
  });
  expect(result.current.pinnedBeforeClear).toBe(false);

  act(() => {
    result.current.pin(rowAt(log, 1));
  });
  expect(result.current.pinnedBeforeClear).toBe(true);
});

test("tail attachment: detach sticks; resume re-attaches", () => {
  const { history, log, present } = seeded(3);
  const { result } = renderHook(() => {
    return useTimeline(log, history, ALL_SCOPE, present);
  });

  expect(result.current.tailAttached).toBe(true);

  act(() => {
    result.current.setTailAttached(false);
  });
  expect(result.current.tailAttached).toBe(false);

  act(() => {
    result.current.resume();
  });
  expect(result.current.tailAttached).toBe(true);
});

function rowAt(log: readonly LogRow[], seq: number): LogRow {
  const row = log.find((r) => {
    return r.seq === seq;
  });

  if (row === undefined) {
    throw new Error(`no row with seq ${seq}`);
  }

  return row;
}

function priceFrames(count: number, extraStreamId?: string): AppToInspector[] {
  const frames: AppToInspector[] = [
    { kind: "snapshot", streams: [], machines: [] },
  ];
  let seq = 0;

  for (let i = 1; i <= count; i += 1) {
    seq += 1;
    frames.push({
      kind: "batch",
      events: [
        { kind: "stream:emission", seq, ts: 1000 + seq, streamId: "fx.price$", value: i, coalesced: 1 },
      ],
    });

    if (extraStreamId !== undefined) {
      seq += 1;
      frames.push({
        kind: "batch",
        events: [
          { kind: "stream:emission", seq, ts: 1000 + seq, streamId: extraStreamId, value: i, coalesced: 1 },
        ],
      });
    }
  }

  return frames;
}

interface Seeded {
  history: LiveHistory;
  log: readonly LogRow[];
  present: InspectorState;
}

function seeded(count: number, extraStreamId?: string): Seeded {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });

  for (const frame of priceFrames(count, extraStreamId)) {
    history.record(frame);
    store.apply(frame);
  }

  const present = store.getSnapshot();

  return { history, log: present.log, present };
}
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/useTimeline.test.tsx`
Expected: FAIL — wrong arity / missing members.

- [ ] **Step 3: Rewrite `useTimeline.ts`**

```ts
// packages/devtools-app/src/timeline/useTimeline.ts
import { useState } from "react";

import type { InspectorState, LiveHistory, LogRow } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { compileScope } from "#/nav/scope";
import type { TimelineFilter } from "#/timeline/timelineModel";
import {
  EMPTY_TIMELINE_FILTER,
  filterLog,
  hasSeq,
  RADIUS_WINDOW_MS,
} from "#/timeline/timelineModel";

/** "pinned" carries the row itself (spec §6.2): the log caps at 5000 rows and
 * evicts oldest-first, so re-finding the row by seq each render silently
 * loses the Event/Diff tabs minutes into a live session. */
export type TimelineSelection =
  | { mode: "follow" }
  | { mode: "pinned"; seq: number; row: LogRow };

export interface TimelineModel {
  selection: TimelineSelection;
  filter: TimelineFilter;
  rows: readonly LogRow[];
  selectedRow: LogRow | null;
  pinnedState: InspectorState | null;
  agedOut: boolean;
  reconstructError: string | null;
  pinnedRowEvicted: boolean;
  pinnedRowHidden: boolean;
  pinnedBeforeClear: boolean;
  tailAttached: boolean;
  pin: (row: LogRow) => void;
  resume: () => void;
  selectPrev: () => void;
  selectNext: () => void;
  setText: (text: string) => void;
  setRadiusAround: (row: LogRow) => void;
  clearRadius: () => void;
  clear: () => void;
  unclear: () => void;
  setTailAttached: (attached: boolean) => void;
}

/** The user-editable part of the filter; families + pills come from the
 * scope (spec §4.1) and are recompiled every render. */
interface UserFilter {
  text: string;
  radius: TimelineFilter["radius"];
  clearedBeforeSeq: number;
}

const EMPTY_USER_FILTER: UserFilter = {
  text: "",
  radius: null,
  clearedBeforeSeq: 0,
};

interface Reconstruction {
  state: InspectorState | null;
  error: string | null;
}

/** Owns the timeline's selection + filter state and the pinned-moment
 * reconstruction. Selection implies pause: "pinned" freezes the context pane
 * at that seq while the rows keep tailing live underneath; "follow" tracks
 * the tail. The navigation scope is an INPUT here — the tree owns it — and
 * compiles into the structural half of the filter. Reconstruction failures
 * are caught and surfaced as reconstructError. */
export function useTimeline(
  log: readonly LogRow[],
  history: LiveHistory,
  scope: Scope,
  presentState: InspectorState,
): TimelineModel {
  const [selection, setSelection] = useState<TimelineSelection>({
    mode: "follow",
  });
  const [userFilter, setUserFilter] = useState<UserFilter>(EMPTY_USER_FILTER);
  const [tailAttached, setTailAttached] = useState(true);

  const filter: TimelineFilter = {
    ...EMPTY_TIMELINE_FILTER,
    ...compileScope(scope, presentState),
    ...userFilter,
  };
  const rows = filterLog(log, filter);

  const pinnedSeq = selection.mode === "pinned" ? selection.seq : null;
  const selectedRow = selection.mode === "pinned" ? selection.row : null;
  const pinnedRowEvicted = pinnedSeq !== null && !hasSeq(log, pinnedSeq);
  const pinnedRowHidden = pinnedSeq !== null && !hasSeq(rows, pinnedSeq);
  const pinnedBeforeClear =
    pinnedSeq !== null && pinnedSeq <= userFilter.clearedBeforeSeq;

  const agedOut =
    pinnedSeq !== null && history.oldestSeq > 0 && pinnedSeq <= history.oldestSeq;

  const reconstruction = computeReconstruction(pinnedSeq, agedOut, history);

  function pin(row: LogRow): void {
    setSelection({ mode: "pinned", seq: row.seq, row });
  }

  function resume(): void {
    setSelection({ mode: "follow" });
    setTailAttached(true);
  }

  function selectPrev(): void {
    setSelection((current) => {
      return stepped(rows, current, -1);
    });
  }

  function selectNext(): void {
    setSelection((current) => {
      return stepped(rows, current, 1);
    });
  }

  function setText(text: string): void {
    setUserFilter((prev) => {
      return { ...prev, text };
    });
  }

  function setRadiusAround(row: LogRow): void {
    setUserFilter((prev) => {
      return {
        ...prev,
        radius: { centerTs: row.ts, windowMs: RADIUS_WINDOW_MS },
      };
    });
  }

  function clearRadius(): void {
    setUserFilter((prev) => {
      return { ...prev, radius: null };
    });
  }

  function clear(): void {
    const latest = log[log.length - 1];

    if (latest === undefined) {
      return;
    }

    setUserFilter((prev) => {
      return { ...prev, clearedBeforeSeq: latest.seq };
    });
    setSelection({ mode: "follow" });
    setTailAttached(true);
  }

  function unclear(): void {
    setUserFilter((prev) => {
      return { ...prev, clearedBeforeSeq: 0 };
    });
  }

  return {
    selection,
    filter,
    rows,
    selectedRow,
    pinnedState: reconstruction.state,
    agedOut,
    reconstructError: reconstruction.error,
    pinnedRowEvicted,
    pinnedRowHidden,
    pinnedBeforeClear,
    tailAttached,
    pin,
    resume,
    selectPrev,
    selectNext,
    setText,
    setRadiusAround,
    clearRadius,
    clear,
    unclear,
    setTailAttached,
  };
}

function stepped(
  rows: readonly LogRow[],
  current: TimelineSelection,
  delta: 1 | -1,
): TimelineSelection {
  const last = rows[rows.length - 1];

  if (last === undefined) {
    return current;
  }

  if (current.mode === "follow") {
    return { mode: "pinned", seq: last.seq, row: last };
  }

  const seq = current.seq;
  const index = rows.findIndex((row) => {
    return row.seq === seq;
  });

  if (index === -1) {
    return { mode: "pinned", seq: last.seq, row: last };
  }

  const next = rows[Math.max(0, Math.min(index + delta, rows.length - 1))];

  return next === undefined ? current : { mode: "pinned", seq: next.seq, row: next };
}

function computeReconstruction(
  pinnedSeq: number | null,
  agedOut: boolean,
  history: LiveHistory,
): Reconstruction {
  if (pinnedSeq === null || agedOut) {
    return { state: null, error: null };
  }

  try {
    return { state: history.stateAt(pinnedSeq), error: null };
  } catch (error) {
    return { state: null, error: String(error) };
  }
}
```

- [ ] **Step 4: Minimal consumer edits so the package compiles**

`FilterControls.tsx`: delete `FamilyCheckbox`, `PillChip`, the `FAMILIES` constant, the families `<div>` and the pills `<div>`; keep the text input and the radius chip. Its imports shrink to `ChangeEvent, ReactElement, RefObject`, the CSS module, and `TimelineModel`.

`TimelinePane.tsx`: in `TimelineRowView` delete `addSourcePill` and the `<button … title="Filter to this source">`; render the source as a plain `<span className={styles.source}>{source.id}</span>` inside the `pinArea` button; change `pinTimelineRow` to `model.pin(row)`. In `TimelinePane.test.tsx` delete the test "clicking a row's source adds a pill without pinning".

`ContextPane.test.tsx`: `harness.pin` now takes a row — change `HarnessHandle.pin` to `(row: LogRow) => void`, expose the seeded log on the handle (`handle.log = log` inside `Harness`, typed `log: readonly LogRow[]`), and change the three call sites to `harness.pin(rowAt(harness.log, N))` with the same `rowAt` helper as `useTimeline.test.tsx`.

`InspectorApp.tsx`: add `import { ALL_SCOPE } from "#/nav/scope";` and call `useTimeline(activeLog, activeHistory, ALL_SCOPE, presentState)`. Delete `filterTimelineByMachine` and `filterTimelineByMsgType` and stop passing `onFocusInTimeline` / `onMsgTypePill` (both are optional props on the panels). Rewrite `pinTimelineAtIntent`:

```ts
function pinTimelineAtIntent(
  machineId: string,
  name: string,
  ts: number,
): void {
  const seq = seqOfMachineIntent(activeLog, machineId, name, ts);
  const row =
    seq === null
      ? undefined
      : activeLog.find((r) => {
          return r.seq === seq;
        });

  if (row !== undefined) {
    timeline.pin(row);
    setLens("timeline");
  }
}
```

- [ ] **Step 5: Run the whole package**

Run: `pnpm --filter @rtc/devtools-app test && pnpm --filter @rtc/devtools-app typecheck && npx biome ci packages/devtools-app`
Expected: PASS. (`InspectorApp.test.tsx`'s journey test still clicks `lens-machines`/`lens-wire` — they exist until Task 9.)

- [ ] **Step 6: Commit**

```bash
git add packages/devtools-app/src
git commit -m "feat(devtools-app): useTimeline takes a scope, captures the pinned row, adds clear/unclear and tail attachment"
```

---

### Task 4: `nav/buildNavTree.ts` — the four roots with counts, flash keys, wire health

Pure. Consumes the *visible* log (after the Clear watermark) so badges reset on Clear (spec §5).

**Files:**
- Create: `packages/devtools-app/src/nav/buildNavTree.ts`
- Test: `packages/devtools-app/src/__tests__/buildNavTree.test.ts`

**Interfaces:**
- Consumes: `Scope`, `scopeKey`, `parseStreamId`, `streamLeafLabel` (Task 1); `sourceOfEvent` (timelineModel); `InspectorState`, `LogRow`, `SerializedValue` from `@rtc/devtools-core`.
- Produces:
  ```ts
  export interface NavNode {
    id: string;              // scopeKey(scope) for selectable nodes; "presenters" | "machines" for group headers
    label: string;
    scope: Scope | null;     // null = group header (expand/collapse only)
    count: number;           // visible rows matching this node's scope
    lastSeq: number;         // max seq among those rows (0 = none) — flash key
    disposed: boolean;       // machine instances only
    detail: string | null;   // wire root health line, else null
    children: readonly NavNode[];
  }
  export function buildNavTree(state: InspectorState, visibleLog: readonly LogRow[]): readonly NavNode[]
  export function wireHealthLine(visibleLog: readonly LogRow[]): string | null   // null when no wire rows
  ```
  Root order: `all`, `presenters`, `machines`, `wire`. Presenter children sorted by presenter then streamId (state.streams is already streamId-sorted). Machine kinds sorted by kind; instances in state order. Wire children (msgTypes) sorted alphabetically.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/devtools-app/src/__tests__/buildNavTree.test.ts
import { expect, test } from "vitest";

import type { InspectorState, LogRow } from "@rtc/devtools-core";

import { buildNavTree, wireHealthLine } from "#/nav/buildNavTree";

test("four roots in order; All counts every visible row", () => {
  const tree = buildNavTree(stateWith(), logWith());

  expect(tree.map((n) => n.id)).toEqual(["all", "presenters", "machines", "wire"]);
  expect(tree[0]).toMatchObject({ scope: { kind: "all" }, count: 5, lastSeq: 5 });
  expect(tree[1]?.scope).toBeNull();
  expect(tree[2]?.scope).toBeNull();
  expect(tree[3]?.scope).toEqual({ kind: "wire" });
});

test("presenters group streams with leaf labels, counts and lastSeq rolled up", () => {
  const presenters = buildNavTree(stateWith(), logWith())[1];
  const blotter = presenters?.children.find((n) => n.id === "presenter:blotter");

  expect(presenters?.children.map((n) => n.id)).toEqual([
    "presenter:blotter",
    "presenter:priceHistory",
  ]);
  expect(blotter).toMatchObject({
    label: "blotter",
    scope: { kind: "presenter", presenter: "blotter" },
    count: 2,
    lastSeq: 3,
  });
  expect(blotter?.children.map((n) => [n.id, n.label, n.count])).toEqual([
    ["stream:blotter.activity$", "activity$", 0],
    ["stream:blotter.trades$", "trades$", 2],
  ]);
  expect(
    presenters?.children[1]?.children[0],
  ).toMatchObject({ id: 'stream:priceHistory.history$[["EURCAD"]]', label: "history$ · EURCAD", count: 1 });
});

test("machines group by kind → instance with disposed flag and arg summary", () => {
  const machines = buildNavTree(stateWith(), logWith())[2];
  const tile = machines?.children.find((n) => n.id === "machineKind:tileExecution");

  expect(machines?.children.map((n) => n.id)).toEqual([
    "machineKind:incident",
    "machineKind:tileExecution",
  ]);
  expect(tile).toMatchObject({ count: 1, lastSeq: 4 });
  expect(tile?.children.map((n) => [n.id, n.label, n.disposed, n.count])).toEqual([
    ["machine:m1", 'm1 ["EURUSD"]', false, 1],
    ["machine:m2", 'm2 ["USDJPY"]', true, 0],
  ]);
});

test("wire root lists msgTypes with counts and carries the health line", () => {
  const wire = buildNavTree(stateWith(), logWith())[3];

  expect(wire).toMatchObject({ count: 1, lastSeq: 5 });
  expect(wire?.children.map((n) => [n.id, n.label, n.count])).toEqual([
    ["msgType:PRICE", "PRICE", 1],
  ]);
  expect(wire?.detail).toBe("▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 0");
});

test("an empty visible log (just cleared) zeroes every count but keeps the structure", () => {
  const tree = buildNavTree(stateWith(), []);

  expect(tree[0]?.count).toBe(0);
  expect(tree[1]?.children.length).toBe(2);
  expect(tree[3]?.children).toEqual([]);
  expect(tree[3]?.detail).toBeNull();
  expect(wireHealthLine([])).toBeNull();
});

test("wireHealthLine counts a re-registered stream as a reconnect", () => {
  const log: LogRow[] = [
    wireIn(1, "PRICE", 1000),
    registered(2, "fx.price$", 1500),
    registered(3, "fx.price$", 1600),
  ];

  expect(wireHealthLine(log)).toBe("▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 1");
});

function stateWith(): InspectorState {
  return {
    connected: true,
    dev: false,
    appId: "rtc-web",
    protocolMismatch: null,
    streams: [
      { streamId: "blotter.activity$", lastValue: null, lastSeq: 0, totalEmissions: 0, ratePerSec: 0 },
      { streamId: "blotter.trades$", lastValue: 2, lastSeq: 3, totalEmissions: 2, ratePerSec: 0 },
      { streamId: 'priceHistory.history$[["EURCAD"]]', lastValue: 1, lastSeq: 2, totalEmissions: 1, ratePerSec: 0 },
    ],
    machines: [
      { machineId: "m1", machineKind: "tileExecution", args: ["EURUSD"], state: null, disposed: false, createdAt: 0, intents: [], transitions: 0 },
      { machineId: "m2", machineKind: "tileExecution", args: ["USDJPY"], state: null, disposed: true, createdAt: 0, intents: [], transitions: 0 },
      { machineId: "m3", machineKind: "incident", args: [], state: null, disposed: false, createdAt: 0, intents: [], transitions: 0 },
    ],
    log: [],
  };
}

function logWith(): LogRow[] {
  return [
    emission(1, "blotter.trades$", 1, 1001),
    emission(2, 'priceHistory.history$[["EURCAD"]]', 1, 1002),
    emission(3, "blotter.trades$", 2, 1003),
    {
      seq: 4,
      ts: 1004,
      kind: "machine:state",
      summary: "m1 {} ×1",
      event: { kind: "machine:state", seq: 4, ts: 1004, machineId: "m1", state: {}, coalesced: 1 },
    },
    wireIn(5, "PRICE", 1005),
  ];
}

function emission(seq: number, streamId: string, value: number, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "stream:emission",
    summary: `${streamId} ${value} ×1`,
    event: { kind: "stream:emission", seq, ts, streamId, value, coalesced: 1 },
  };
}

function wireIn(seq: number, msgType: string, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "wire:in",
    summary: `${msgType} null`,
    event: { kind: "wire:in", seq, ts, msgType, payload: null },
  };
}

function registered(seq: number, streamId: string, ts: number): LogRow {
  return {
    seq,
    ts,
    kind: "stream:registered",
    summary: `${streamId} registered`,
    event: { kind: "stream:registered", seq, ts, streamId },
  };
}
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/buildNavTree.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/devtools-app/src/nav/buildNavTree.ts
import type { InspectorState, LogRow, MachineRow, SerializedValue } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { parseStreamId, scopeKey, streamLeafLabel } from "#/nav/scope";
import { sourceOfEvent } from "#/timeline/timelineModel";

export interface NavNode {
  id: string;
  label: string;
  scope: Scope | null;
  count: number;
  lastSeq: number;
  disposed: boolean;
  detail: string | null;
  children: readonly NavNode[];
}

/** The navigator's data (spec §3.1): four fixed roots built from the live
 * state (what exists) and the VISIBLE log (what happened since Clear).
 * Counts and lastSeq come from one pass over the log; the flash key is
 * lastSeq, so a node re-flashes exactly when its scope received a row. */
export function buildNavTree(
  state: InspectorState,
  visibleLog: readonly LogRow[],
): readonly NavNode[] {
  const tally = tallyLog(visibleLog);
  const last = visibleLog[visibleLog.length - 1];

  return [
    leaf("all", "All", { kind: "all" }, visibleLog.length, last?.seq ?? 0),
    {
      ...header("presenters", "Presenters"),
      children: presenterNodes(state, tally),
    },
    {
      ...header("machines", "Machines"),
      children: machineKindNodes(state, tally),
    },
    wireNode(visibleLog, tally),
  ];
}

/** `▼ in/s · ▲ out/s · reconnects` over the visible log, trailing 10 s window
 * measured from the log's own timestamps (replay-correct). Null when the
 * log carries no wire rows at all (the simulator-mode norm). */
export function wireHealthLine(visibleLog: readonly LogRow[]): string | null {
  const latestTs = visibleLog[visibleLog.length - 1]?.ts ?? 0;
  const windowStart = latestTs - RATE_WINDOW_MS;
  const seen = new Set<string>();
  let inCount = 0;
  let outCount = 0;
  let wireRows = 0;
  let reconnects = 0;

  for (const row of visibleLog) {
    if (row.event.kind === "wire:in" || row.event.kind === "wire:out") {
      wireRows += 1;

      if (row.ts >= windowStart) {
        if (row.event.kind === "wire:in") {
          inCount += 1;
        } else {
          outCount += 1;
        }
      }
    } else if (row.event.kind === "stream:registered") {
      if (seen.has(row.event.streamId)) {
        reconnects += 1;
      } else {
        seen.add(row.event.streamId);
      }
    }
  }

  if (wireRows === 0) {
    return null;
  }

  const seconds = RATE_WINDOW_MS / 1000;

  return `▼ ${(inCount / seconds).toFixed(1)} in/s · ▲ ${(outCount / seconds).toFixed(1)} out/s · reconnects: ${reconnects}`;
}

const RATE_WINDOW_MS = 10_000;
const ARGS_LABEL_MAX = 24;

interface Tally {
  count: number;
  lastSeq: number;
}

interface LogTally {
  streams: Map<string, Tally>;
  machines: Map<string, Tally>;
  msgTypes: Map<string, Tally>;
}

function presenterNodes(state: InspectorState, tally: LogTally): NavNode[] {
  const order: string[] = [];
  const byPresenter = new Map<string, NavNode[]>();

  for (const row of state.streams) {
    const presenter = parseStreamId(row.streamId).presenter;
    const t = tally.streams.get(row.streamId);
    const node = leaf(
      scopeKey({ kind: "stream", streamId: row.streamId }),
      streamLeafLabel(row.streamId),
      { kind: "stream", streamId: row.streamId },
      t?.count ?? 0,
      t?.lastSeq ?? 0,
    );
    const existing = byPresenter.get(presenter);

    if (existing) {
      existing.push(node);
    } else {
      byPresenter.set(presenter, [node]);
      order.push(presenter);
    }
  }

  return order.sort().map((presenter) => {
    const children = byPresenter.get(presenter) ?? [];

    return rollup(
      scopeKey({ kind: "presenter", presenter }),
      presenter,
      { kind: "presenter", presenter },
      children,
    );
  });
}

function machineKindNodes(state: InspectorState, tally: LogTally): NavNode[] {
  const order: string[] = [];
  const byKind = new Map<string, NavNode[]>();

  for (const row of state.machines) {
    const t = tally.machines.get(row.machineId);
    const node: NavNode = {
      ...leaf(
        scopeKey({ kind: "machine", machineId: row.machineId }),
        machineLabel(row),
        { kind: "machine", machineId: row.machineId },
        t?.count ?? 0,
        t?.lastSeq ?? 0,
      ),
      disposed: row.disposed,
    };
    const existing = byKind.get(row.machineKind);

    if (existing) {
      existing.push(node);
    } else {
      byKind.set(row.machineKind, [node]);
      order.push(row.machineKind);
    }
  }

  return order.sort().map((machineKind) => {
    return rollup(
      scopeKey({ kind: "machineKind", machineKind }),
      machineKind,
      { kind: "machineKind", machineKind },
      byKind.get(machineKind) ?? [],
    );
  });
}

function wireNode(visibleLog: readonly LogRow[], tally: LogTally): NavNode {
  const children = [...tally.msgTypes.entries()]
    .sort(([a], [b]) => {
      return a.localeCompare(b);
    })
    .map(([msgType, t]) => {
      return leaf(
        scopeKey({ kind: "msgType", msgType }),
        msgType,
        { kind: "msgType", msgType },
        t.count,
        t.lastSeq,
      );
    });

  return {
    ...rollup("wire", "Wire", { kind: "wire" }, children),
    detail: wireHealthLine(visibleLog),
  };
}

function tallyLog(visibleLog: readonly LogRow[]): LogTally {
  const streams = new Map<string, Tally>();
  const machines = new Map<string, Tally>();
  const msgTypes = new Map<string, Tally>();

  for (const row of visibleLog) {
    const source = sourceOfEvent(row.event);

    if (source === null) {
      continue;
    }

    const bucket =
      source.type === "stream"
        ? streams
        : source.type === "machine"
          ? machines
          : msgTypes;
    const t = bucket.get(source.id);

    if (t === undefined) {
      bucket.set(source.id, { count: 1, lastSeq: row.seq });
    } else {
      t.count += 1;
      t.lastSeq = Math.max(t.lastSeq, row.seq);
    }
  }

  return { streams, machines, msgTypes };
}

function leaf(
  id: string,
  label: string,
  scope: Scope,
  count: number,
  lastSeq: number,
): NavNode {
  return { id, label, scope, count, lastSeq, disposed: false, detail: null, children: [] };
}

function header(id: string, label: string): NavNode {
  return { id, label, scope: null, count: 0, lastSeq: 0, disposed: false, detail: null, children: [] };
}

function rollup(
  id: string,
  label: string,
  scope: Scope,
  children: readonly NavNode[],
): NavNode {
  let count = 0;
  let lastSeq = 0;

  for (const child of children) {
    count += child.count;
    lastSeq = Math.max(lastSeq, child.lastSeq);
  }

  return { id, label, scope, count, lastSeq, disposed: false, detail: null, children };
}

function machineLabel(row: MachineRow): string {
  const args = compactArgs(row.args);

  return args === "" ? row.machineId : `${row.machineId} ${args}`;
}

function compactArgs(args: SerializedValue | null): string {
  if (args === null) {
    return "";
  }

  const json = JSON.stringify(args) ?? "";

  if (json === "[]") {
    return "";
  }

  return json.length > ARGS_LABEL_MAX ? `${json.slice(0, ARGS_LABEL_MAX)}…` : json;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/buildNavTree.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci packages/devtools-app && pnpm --filter @rtc/devtools-app typecheck
git add packages/devtools-app/src/nav/buildNavTree.ts packages/devtools-app/src/__tests__/buildNavTree.test.ts
git commit -m "feat(devtools-app): buildNavTree — All/Presenters/Machines/Wire roots with visible-log counts"
```

---

### Task 5: `nav/useNavigation.ts` + `nav/NavTree.tsx` — selection, one-deep history, the rail tree

**Files:**
- Create: `packages/devtools-app/src/nav/useNavigation.ts`
- Create: `packages/devtools-app/src/nav/NavTree.tsx`
- Create: `packages/devtools-app/src/nav/NavTree.module.css`
- Test: `packages/devtools-app/src/__tests__/useNavigation.test.tsx`
- Test: `packages/devtools-app/src/__tests__/NavTree.test.tsx`

**Interfaces:**
- Consumes: `NavNode` (Task 4); `Scope`, `ALL_SCOPE`, `scopeKey`, `scopesEqual` (Task 1).
- Produces:
  ```ts
  export interface NavigationModel {
    scope: Scope;
    previousScope: Scope | null;      // set only by pushScope (the wire probe, spec §4.2)
    select: (scope: Scope) => void;   // sets scope, clears previousScope
    pushScope: (scope: Scope) => void;// remembers the current scope, then selects
    popScope: () => boolean;          // restores previousScope; false when there is none
  }
  export function useNavigation(): NavigationModel

  export interface NavTreeProps { nodes: readonly NavNode[]; scope: Scope; onSelect: (scope: Scope) => void; }
  export function NavTree(props: NavTreeProps): ReactElement
  ```
  DOM contract: the root `<div data-nav-tree tabIndex={0}>`; each selectable node's **label button** carries `data-testid="nav-node"`, `data-scope-id={node.id}`, `data-selected="true|false"`; a header's label button toggles expansion and carries no testid; the caret button (nodes with children) has `aria-label="Expand"`/`"Collapse"`; the count badge has class `count`; the wire `detail` renders in a `<span className={styles.detail}>`. Default-expanded ids: `presenters`, `machines`, `wire`. Keyboard while the tree has focus: `ArrowDown`/`ArrowUp` move a cursor over the visible selectable nodes, `Enter` selects the cursor node, `ArrowRight`/`ArrowLeft` expand/collapse it. The label span of a node flashes (`element.animate([{opacity:0.35},{opacity:1}], {duration:300, easing:"ease-out"})`) when `lastSeq` changes and is `> 0`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/devtools-app/src/__tests__/useNavigation.test.tsx
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";

import { ALL_SCOPE } from "#/nav/scope";
import { useNavigation } from "#/nav/useNavigation";

test("starts at All; select replaces the scope and forgets any previous one", () => {
  const { result } = renderHook(useNavigation);

  expect(result.current.scope).toEqual(ALL_SCOPE);
  expect(result.current.previousScope).toBeNull();

  act(() => {
    result.current.select({ kind: "wire" });
  });
  expect(result.current.scope).toEqual({ kind: "wire" });
  expect(result.current.previousScope).toBeNull();
});

test("pushScope remembers one level; popScope restores it once", () => {
  const { result } = renderHook(useNavigation);

  act(() => {
    result.current.select({ kind: "presenter", presenter: "blotter" });
  });
  act(() => {
    result.current.pushScope(ALL_SCOPE);
  });
  expect(result.current.scope).toEqual(ALL_SCOPE);
  expect(result.current.previousScope).toEqual({ kind: "presenter", presenter: "blotter" });

  let popped = false;

  act(() => {
    popped = result.current.popScope();
  });
  expect(popped).toBe(true);
  expect(result.current.scope).toEqual({ kind: "presenter", presenter: "blotter" });
  expect(result.current.previousScope).toBeNull();

  act(() => {
    popped = result.current.popScope();
  });
  expect(popped).toBe(false);
});

test("pushScope onto the same scope records no history", () => {
  const { result } = renderHook(useNavigation);

  act(() => {
    result.current.pushScope(ALL_SCOPE);
  });
  expect(result.current.previousScope).toBeNull();
});
```

```tsx
// packages/devtools-app/src/__tests__/NavTree.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { NavNode } from "#/nav/buildNavTree";
import { NavTree } from "#/nav/NavTree";
import type { Scope } from "#/nav/scope";
import { ALL_SCOPE, scopeKey } from "#/nav/scope";

afterEach(cleanup);

let animateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  animateSpy = vi.fn(() => {
    return { cancel: () => {} };
  });
  Element.prototype.animate =
    animateSpy as unknown as typeof Element.prototype.animate;
});

test("renders roots expanded, groups collapsed; clicking a label selects; caret toggles", () => {
  const selected = mount();

  // Group headers expanded by default → presenter nodes visible; presenter
  // collapsed by default → its streams hidden.
  expect(node("presenter:blotter")).toBeTruthy();
  expect(screen.queryByText("trades$")).toBeNull();

  fireEvent.click(node("presenter:blotter"));
  expect(selected.at(-1)).toEqual({ kind: "presenter", presenter: "blotter" });
  expect(node("presenter:blotter").dataset.selected).toBe("true");
  expect(node("all").dataset.selected).toBe("false");

  fireEvent.click(screen.getAllByLabelText("Expand")[0] as HTMLElement);
  expect(node("stream:blotter.trades$")).toBeTruthy();

  fireEvent.click(node("stream:blotter.trades$"));
  expect(selected.at(-1)).toEqual({ kind: "stream", streamId: "blotter.trades$" });
});

test("shows counts, the wire health detail, and dims disposed machines", () => {
  mount();

  expect(node("all").textContent).toContain("7");
  expect(screen.getByText("▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 0")).toBeTruthy();

  fireEvent.click(screen.getAllByLabelText("Expand")[1] as HTMLElement); // tileExecution
  expect(node("machine:m2").closest("[data-disposed]")?.getAttribute("data-disposed")).toBe("true");
});

test("keyboard: ArrowDown/Up move the cursor, Enter selects, ArrowRight expands", () => {
  const selected = mount();
  const tree = screen.getByTestId("nav-tree");

  tree.focus();
  fireEvent.keyDown(tree, { key: "ArrowDown" }); // all → presenter:blotter
  fireEvent.keyDown(tree, { key: "ArrowRight" }); // expand blotter
  expect(node("stream:blotter.trades$")).toBeTruthy();

  fireEvent.keyDown(tree, { key: "ArrowDown" }); // → stream:blotter.activity$
  fireEvent.keyDown(tree, { key: "ArrowDown" }); // → stream:blotter.trades$
  fireEvent.keyDown(tree, { key: "Enter" });
  expect(selected.at(-1)).toEqual({ kind: "stream", streamId: "blotter.trades$" });

  fireEvent.keyDown(tree, { key: "ArrowUp" }); // → stream:blotter.activity$
  fireEvent.keyDown(tree, { key: "Enter" });
  expect(selected.at(-1)).toEqual({ kind: "stream", streamId: "blotter.activity$" });
});

test("a node flashes when its lastSeq advances, not on unrelated re-renders", () => {
  const handle = mount();
  const before = animateSpy.mock.calls.length;

  handle.bump("presenter:blotter", 9);
  expect(animateSpy.mock.calls.length).toBeGreaterThan(before);

  const after = animateSpy.mock.calls.length;

  handle.bump("presenter:blotter", 9);
  expect(animateSpy.mock.calls.length).toBe(after);
});

function node(id: string): HTMLElement {
  const match = screen.getAllByTestId("nav-node").find((el) => {
    return el.dataset.scopeId === id;
  });

  if (match === undefined) {
    throw new Error(`no nav-node ${id}`);
  }

  return match;
}

interface MountHandle extends Array<Scope> {
  bump: (id: string, lastSeq: number) => void;
}

function mount(): MountHandle {
  const selected = [] as unknown as MountHandle;

  selected.bump = () => {};

  function Harness(): ReactElement {
    const [nodes, setNodes] = useState(sampleTree);
    const [scope, setScope] = useState<Scope>(ALL_SCOPE);

    selected.bump = (id, lastSeq): void => {
      setNodes((prev) => {
        return prev.map((root) => {
          return withLastSeq(root, id, lastSeq);
        });
      });
    };

    function selectScope(next: Scope): void {
      selected.push(next);
      setScope(next);
    }

    return <NavTree nodes={nodes} scope={scope} onSelect={selectScope} />;
  }

  render(<Harness />);

  return selected;
}

function withLastSeq(node: NavNode, id: string, lastSeq: number): NavNode {
  return {
    ...node,
    lastSeq: node.id === id ? lastSeq : node.lastSeq,
    children: node.children.map((child) => {
      return withLastSeq(child, id, lastSeq);
    }),
  };
}

function sampleTree(): NavNode[] {
  return [
    leaf(ALL_SCOPE, "All", 7, 7),
    {
      ...leaf(null, "Presenters", 0, 0, "presenters"),
      children: [
        {
          ...leaf({ kind: "presenter", presenter: "blotter" }, "blotter", 2, 3),
          children: [
            leaf({ kind: "stream", streamId: "blotter.activity$" }, "activity$", 0, 0),
            leaf({ kind: "stream", streamId: "blotter.trades$" }, "trades$", 2, 3),
          ],
        },
      ],
    },
    {
      ...leaf(null, "Machines", 0, 0, "machines"),
      children: [
        {
          ...leaf({ kind: "machineKind", machineKind: "tileExecution" }, "tileExecution", 1, 4),
          children: [
            leaf({ kind: "machine", machineId: "m1" }, 'm1 ["EURUSD"]', 1, 4),
            { ...leaf({ kind: "machine", machineId: "m2" }, 'm2 ["USDJPY"]', 0, 0), disposed: true },
          ],
        },
      ],
    },
    {
      ...leaf({ kind: "wire" }, "Wire", 1, 5),
      detail: "▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 0",
      children: [leaf({ kind: "msgType", msgType: "PRICE" }, "PRICE", 1, 5)],
    },
  ];
}

function leaf(
  scope: Scope | null,
  label: string,
  count: number,
  lastSeq: number,
  headerId?: string,
): NavNode {
  return {
    id: scope === null ? (headerId ?? label) : scopeKey(scope),
    label,
    scope,
    count,
    lastSeq,
    disposed: false,
    detail: null,
    children: [],
  };
}
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/useNavigation.test.tsx src/__tests__/NavTree.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `useNavigation.ts`**

```ts
// packages/devtools-app/src/nav/useNavigation.ts
import { useState } from "react";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE, scopesEqual } from "#/nav/scope";

export interface NavigationModel {
  scope: Scope;
  previousScope: Scope | null;
  select: (scope: Scope) => void;
  pushScope: (scope: Scope) => void;
  popScope: () => boolean;
}

interface NavigationState {
  scope: Scope;
  previousScope: Scope | null;
}

/** The inspector's single selection (spec §3.2) plus a ONE-deep history used
 * only by the wire probe (§4.2): `pushScope` remembers where you were,
 * `popScope` (Esc) takes you back. Plain `select` — clicking the tree —
 * always forgets the history; the probe is the only round trip. */
export function useNavigation(): NavigationModel {
  const [state, setState] = useState<NavigationState>({
    scope: ALL_SCOPE,
    previousScope: null,
  });

  function select(scope: Scope): void {
    setState({ scope, previousScope: null });
  }

  function pushScope(scope: Scope): void {
    setState((prev) => {
      if (scopesEqual(prev.scope, scope)) {
        return prev;
      }

      return { scope, previousScope: prev.scope };
    });
  }

  function popScope(): boolean {
    if (state.previousScope === null) {
      return false;
    }

    setState({ scope: state.previousScope, previousScope: null });

    return true;
  }

  return {
    scope: state.scope,
    previousScope: state.previousScope,
    select,
    pushScope,
    popScope,
  };
}
```

- [ ] **Step 4: Implement `NavTree.tsx` and its CSS**

```tsx
// packages/devtools-app/src/nav/NavTree.tsx
import type { KeyboardEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import type { NavNode } from "#/nav/buildNavTree";
import styles from "#/nav/NavTree.module.css";
import type { Scope } from "#/nav/scope";
import { scopeKey } from "#/nav/scope";

/** The rail navigator (spec §3.1): one tree, four roots, one selection.
 * Expansion is local view state keyed by node id and independent of
 * selection; the selection itself lives in `useNavigation` and arrives as
 * `scope`. Keyboard (when the tree is focused): ↑/↓ move a cursor over the
 * visible selectable nodes, Enter selects, ←/→ collapse/expand. */
export function NavTree({ nodes, scope, onSelect }: NavTreeProps): ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(DEFAULT_EXPANDED);
  const [cursorId, setCursorId] = useState<string>(scopeKey(scope));
  const selectedId = scopeKey(scope);
  const visible = flattenVisible(nodes, expanded);

  function toggleNodeExpansion(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function moveTreeCursor(e: KeyboardEvent<HTMLDivElement>): void {
    const selectable = visible.filter((entry) => {
      return entry.node.scope !== null;
    });
    const index = selectable.findIndex((entry) => {
      return entry.node.id === cursorId;
    });
    const current = selectable[index]?.node ?? null;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(index + delta, selectable.length - 1));
      const next = selectable[nextIndex];

      if (next !== undefined) {
        setCursorId(next.node.id);
      }
    } else if (e.key === "Enter" && current !== null && current.scope !== null) {
      e.preventDefault();
      onSelect(current.scope);
    } else if (e.key === "ArrowRight" && current !== null && current.children.length > 0) {
      e.preventDefault();
      setExpanded((prev) => {
        return prev.has(current.id) ? prev : new Set(prev).add(current.id);
      });
    } else if (e.key === "ArrowLeft" && current !== null) {
      e.preventDefault();
      setExpanded((prev) => {
        if (!prev.has(current.id)) {
          return prev;
        }

        const next = new Set(prev);

        next.delete(current.id);

        return next;
      });
    }
  }

  return (
    <div
      data-nav-tree=""
      data-testid="nav-tree"
      tabIndex={0}
      className={styles.tree}
      onKeyDown={moveTreeCursor}
    >
      {visible.map((entry) => {
        return (
          <NavRow
            key={entry.node.id}
            node={entry.node}
            depth={entry.depth}
            expanded={expanded.has(entry.node.id)}
            selected={entry.node.id === selectedId}
            atCursor={entry.node.id === cursorId}
            onSelect={onSelect}
            onToggle={toggleNodeExpansion}
          />
        );
      })}
    </div>
  );
}

export interface NavTreeProps {
  nodes: readonly NavNode[];
  scope: Scope;
  onSelect: (scope: Scope) => void;
}

const DEFAULT_EXPANDED: ReadonlySet<string> = new Set(["presenters", "machines", "wire"]);

interface VisibleEntry {
  node: NavNode;
  depth: number;
}

interface NavRowProps {
  node: NavNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  atCursor: boolean;
  onSelect: (scope: Scope) => void;
  onToggle: (id: string) => void;
}

function NavRow({
  node,
  depth,
  expanded,
  selected,
  atCursor,
  onSelect,
  onToggle,
}: NavRowProps): ReactElement {
  const flashRef = useRef<HTMLSpanElement>(null);
  const hasChildren = node.children.length > 0;

  useEffect((): void => {
    // Same compositor-safe opacity flash as StateTreePanel: WAAPI promotes
    // the span only for the animation's lifetime (docs/performance.md).
    if (node.lastSeq > 0) {
      flashRef.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 300,
        easing: "ease-out",
      });
    }
  }, [node.lastSeq]);

  function toggleThisNode(): void {
    onToggle(node.id);
  }

  function selectThisNode(): void {
    if (node.scope === null) {
      onToggle(node.id);
    } else {
      onSelect(node.scope);
    }
  }

  const rowClassName = [
    styles.row,
    selected ? styles.rowSelected : "",
    atCursor ? styles.rowCursor : "",
    node.disposed ? styles.rowDisposed : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rowClassName}
      data-depth={depth}
      data-disposed={node.disposed ? "true" : "false"}
    >
      {hasChildren ? (
        <button
          type="button"
          className={styles.caret}
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={toggleThisNode}
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className={styles.caretSpacer} />
      )}
      <button
        type="button"
        className={node.scope === null ? styles.header : styles.label}
        data-testid={node.scope === null ? undefined : "nav-node"}
        data-scope-id={node.scope === null ? undefined : node.id}
        data-selected={node.scope === null ? undefined : String(selected)}
        title={node.scope === null ? undefined : node.id}
        onClick={selectThisNode}
      >
        <span ref={flashRef} className={styles.labelText}>
          {node.label}
        </span>
        {node.scope !== null ? (
          <span className={styles.count}>{node.count}</span>
        ) : null}
      </button>
      {node.detail !== null ? (
        <span className={styles.detail}>{node.detail}</span>
      ) : null}
    </div>
  );
}

function flattenVisible(
  nodes: readonly NavNode[],
  expanded: ReadonlySet<string>,
): VisibleEntry[] {
  const out: VisibleEntry[] = [];

  function walk(list: readonly NavNode[], depth: number): void {
    for (const node of list) {
      out.push({ node, depth });

      if (node.children.length > 0 && expanded.has(node.id)) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(nodes, 0);

  return out;
}
```

```css
/* packages/devtools-app/src/nav/NavTree.module.css */
.tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
  outline: none;
}

.tree:focus-visible {
  box-shadow: inset 0 0 0 1px var(--accent);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 1px 4px;
  border-radius: 3px;
}

.row[data-depth="1"] {
  padding-left: 12px;
}

.row[data-depth="2"] {
  padding-left: 24px;
}

.rowSelected {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.rowCursor {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);
}

.rowDisposed {
  opacity: 0.45;
}

.caret,
.caretSpacer {
  flex: none;
  width: 12px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dim);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}

.label,
.header {
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.header {
  color: var(--dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.labelText {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  flex: none;
  color: var(--dim);
  font-size: 10px;
}

.detail {
  flex-basis: 100%;
  padding-left: 16px;
  color: var(--dim);
  font-size: 10px;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/useNavigation.test.tsx src/__tests__/NavTree.test.tsx`
Expected: PASS (3 + 4 tests).

- [ ] **Step 6: Lint + commit**

```bash
npx biome ci packages/devtools-app && pnpm --filter @rtc/devtools-app typecheck && pnpm lint
git add packages/devtools-app/src/nav packages/devtools-app/src/__tests__/useNavigation.test.tsx packages/devtools-app/src/__tests__/NavTree.test.tsx
git commit -m "feat(devtools-app): NavTree rail navigator and useNavigation scope model"
```

---

### Task 6: `TimelinePane` — header (search / Clear / Unclear / radius), scroll-anchored follow, whole-row pin, scope-relative labels, wire probe

`FilterControls` is deleted here; its text input (and the `/` shortcut target) moves into the pane's header.

**Files:**
- Modify: `packages/devtools-app/src/timeline/TimelinePane.tsx`
- Modify: `packages/devtools-app/src/timeline/TimelinePane.module.css`
- Delete: `packages/devtools-app/src/timeline/FilterControls.tsx`, `packages/devtools-app/src/timeline/FilterControls.module.css`
- Modify: `packages/devtools-app/src/InspectorApp.tsx` (rail no longer renders `FilterControls`; pass the new pane props)
- Modify: `packages/devtools-app/src/__tests__/TimelinePane.test.tsx`

**Interfaces:**
- Consumes: `TimelineModel` (Task 3); `Scope`, `shortLabel` (Task 1).
- Produces:
  ```ts
  export interface TimelinePaneProps {
    model: TimelineModel;
    scope: Scope;
    searchInputRef: RefObject<HTMLInputElement | null>;   // the "/" shortcut target
    onProbeWire: (row: LogRow) => void;                    // spec §4.2 — InspectorApp implements
    onShowInAll: () => void;                               // pinned-bar "show in All"
  }
  ```
  DOM: header `<div className={styles.header}>` with the search `<input placeholder="Search scope… ( / )">`, a radius chip `±100ms ✕` (when `filter.radius !== null`, click → `clearRadius`), `<button data-testid="clear-log">Clear</button>`, and `<button data-testid="unclear-log">Unclear</button>` only while `filter.clearedBeforeSeq > 0`. The rows container gets `onScroll`. A `<button data-testid="live-chip">⤓ live</button>` renders below the rows while `!model.tailAttached && following`. Each row: the `pinArea` button covers time · kind chip · summary · source (source hidden under `stream` / `machine` / `msgType` scopes); a sibling `<button title="Show wire traffic within ±100 ms">wire ±100ms</button>` calls `onProbeWire(row)`. Pinned bar label rules (first match): `agedOut` → `⏸ this moment left the buffer`; else `⏸ pinned at <time>` + `(before clear)` if `pinnedBeforeClear`, else `(evicted from log)` if `pinnedRowEvicted`; then ` — not in this scope` + a `<button data-testid="show-in-all">show in All</button>` if `pinnedRowHidden && !agedOut`. Bar buttons: `Resume`, and `wire ±100ms` (calls `onProbeWire(selectedRow)`) when a row is selected and no radius is active.

- [ ] **Step 1: Rewrite `TimelinePane.test.tsx`**

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import type { AppToInspector, InspectorState, LogRow } from "@rtc/devtools-core";
import { InspectorStore, LiveHistory } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import { TimelinePane } from "#/timeline/TimelinePane";
import { useTimeline } from "#/timeline/useTimeline";

afterEach(cleanup);

test("clicking a row pins it and shows the pinned bar; Resume returns to follow", () => {
  mount();

  const rows = screen.getAllByTestId("timeline-row");

  expect(rows.length).toBe(3);

  // The row itself is a non-interactive container; the pin target is its
  // first child button, which now covers the whole row's text.
  fireEvent.click((rows[0] as HTMLElement).querySelector("button") as HTMLElement);
  expect(screen.getByTestId("pinned-bar").textContent).toContain("pinned at");

  fireEvent.click(screen.getByText("Resume"));
  expect(screen.queryByTestId("pinned-bar")).toBeNull();
});

test("Clear empties the list and shows Unclear; Unclear brings the rows back", () => {
  mount();

  fireEvent.click(screen.getByTestId("clear-log"));
  expect(screen.queryAllByTestId("timeline-row")).toEqual([]);

  fireEvent.click(screen.getByTestId("unclear-log"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(3);
  expect(screen.queryByTestId("unclear-log")).toBeNull();
});

test("search filters rows by summary text through the header input", () => {
  mount();

  fireEvent.change(screen.getByPlaceholderText("Search scope… ( / )"), {
    target: { value: "fx.price$ 3" },
  });
  expect(screen.getAllByTestId("timeline-row").length).toBe(1);
});

test("source label is scope-relative and hidden under a single-stream scope", () => {
  const handle = mount();

  expect(screen.getAllByText("fx.price$").length).toBe(3);

  handle.setScope({ kind: "presenter", presenter: "fx" });
  expect(screen.getAllByText("price$").length).toBe(3);
  expect(screen.queryByText("fx.price$")).toBeNull();

  handle.setScope({ kind: "stream", streamId: "fx.price$" });
  expect(screen.queryByText("price$")).toBeNull();
  expect(screen.getAllByTestId("timeline-row").length).toBe(3);
});

test("wire ±100ms on a row calls onProbeWire with that row", () => {
  const handle = mount();

  fireEvent.click(screen.getAllByTitle("Show wire traffic within ±100 ms")[1] as HTMLElement);
  expect(handle.probed.map((r) => r.seq)).toEqual([2]);
});

test("scrolling away from the bottom detaches the tail; ⤓ live re-attaches", () => {
  const handle = mount();
  const list = screen.getByTestId("timeline-rows");

  // jsdom has no layout: fake the geometry the handler reads.
  Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(list, "clientHeight", { value: 200, configurable: true });
  list.scrollTop = 100;
  fireEvent.scroll(list);

  expect(handle.model().tailAttached).toBe(false);
  expect(screen.getByTestId("live-chip")).toBeTruthy();

  fireEvent.click(screen.getByTestId("live-chip"));
  expect(handle.model().tailAttached).toBe(true);
  expect(screen.queryByTestId("live-chip")).toBeNull();
});

test("auto-scroll runs only while attached", () => {
  const handle = mount();
  const list = screen.getByTestId("timeline-rows");
  const scrollTopSetter = vi.fn();

  Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(list, "clientHeight", { value: 200, configurable: true });
  Object.defineProperty(list, "scrollTop", {
    get: () => 100,
    set: scrollTopSetter,
    configurable: true,
  });

  fireEvent.scroll(list); // detaches (100 + 200 < 1000)
  scrollTopSetter.mockClear();
  handle.append(); // a new row arrives
  expect(scrollTopSetter).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId("live-chip"));
  expect(scrollTopSetter).toHaveBeenCalledWith(1000);
});

test("pinned bar flags a pin that is hidden by the current scope and offers show in All", () => {
  const handle = mount();

  fireEvent.click((screen.getAllByTestId("timeline-row")[0] as HTMLElement).querySelector("button") as HTMLElement);
  handle.setScope({ kind: "wire" });

  expect(screen.getByTestId("pinned-bar").textContent).toContain("not in this scope");
  fireEvent.click(screen.getByTestId("show-in-all"));
  expect(handle.shownInAll).toBe(1);
});

interface Handle {
  setScope: (scope: Scope) => void;
  append: () => void;
  model: () => ReturnType<typeof useTimeline>;
  probed: LogRow[];
  shownInAll: number;
}

interface Seed {
  history: LiveHistory;
  store: InspectorStore;
}

function mount(): Handle {
  const handle: Handle = {
    setScope: () => {},
    append: () => {},
    model: () => {
      throw new Error("not mounted");
    },
    probed: [],
    shownInAll: 0,
  };

  function Harness(): ReactElement {
    const [{ history, store }] = useState(seed);
    const [state, setState] = useState<InspectorState>(store.getSnapshot());
    const [scope, setScope] = useState<Scope>(ALL_SCOPE);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const model = useTimeline(state.log, history, scope, state);

    handle.setScope = setScope;
    handle.model = (): ReturnType<typeof useTimeline> => {
      return model;
    };
    handle.append = (): void => {
      const seq = state.log.length + 1;
      const frame: AppToInspector = {
        kind: "batch",
        events: [
          { kind: "stream:emission", seq, ts: 1000 + seq, streamId: "fx.price$", value: seq, coalesced: 1 },
        ],
      };

      history.record(frame);
      store.apply(frame);
      setState(store.getSnapshot());
    };

    function probeWire(row: LogRow): void {
      handle.probed.push(row);
    }

    function showInAll(): void {
      handle.shownInAll += 1;
    }

    return (
      <TimelinePane
        model={model}
        scope={scope}
        searchInputRef={searchRef}
        onProbeWire={probeWire}
        onShowInAll={showInAll}
      />
    );
  }

  render(<Harness />);

  return handle;
}

function seed(): Seed {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });
  const frames: AppToInspector[] = [{ kind: "snapshot", streams: [], machines: [] }];

  for (let seq = 1; seq <= 3; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        { kind: "stream:emission", seq, ts: 1000 + seq, streamId: "fx.price$", value: seq, coalesced: 1 },
      ],
    });
  }

  for (const frame of frames) {
    history.record(frame);
    store.apply(frame);
  }

  return { history, store };
}
```

(Row summaries are `InspectorStore.summarize` output — `fx.price$ 3 ×1` for the third emission — so the needle `fx.price$ 3` matches exactly one row.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/TimelinePane.test.tsx`
Expected: FAIL — missing props / testids.

- [ ] **Step 3: Rewrite `TimelinePane.tsx`**

```tsx
// packages/devtools-app/src/timeline/TimelinePane.tsx
import type { ChangeEvent, ReactElement, RefObject, UIEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { LogRow } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import { shortLabel } from "#/nav/scope";
import { formatLogTime } from "#/panels/formatLogTime";
import styles from "#/timeline/TimelinePane.module.css";
import { familyOf, sourceOfEvent } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";

/** The actions list (spec §4): the chronological rows of the current scope,
 * a header (scoped search, Clear/Unclear, radius chip), and the pinned bar.
 * Follow mode auto-scrolls to the tail ONLY while the pane is at the bottom
 * (§6.1, the log-viewer rule): scrolling up detaches silently, a "⤓ live"
 * chip re-attaches, and while detached the ≤500-row render window anchors
 * to the first visible row instead of the tail so rows stop remounting
 * under the cursor — which is what makes whole-row click-to-pin safe. */
export function TimelinePane({
  model,
  scope,
  searchInputRef,
  onProbeWire,
  onShowInAll,
}: TimelinePaneProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [anchorSeq, setAnchorSeq] = useState<number | null>(null);
  const following = model.selection.mode === "follow";
  const pinnedSeq = model.selection.mode === "pinned" ? model.selection.seq : null;
  const centerSeq = pinnedSeq ?? (model.tailAttached ? null : anchorSeq);
  const visible = windowedRows(model.rows, centerSeq);

  useEffect((): void => {
    if (following && model.tailAttached && visible.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [following, model.tailAttached, visible]);

  function trackScrollPosition(e: UIEvent<HTMLDivElement>): void {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_EPSILON_PX;

    if (atBottom !== model.tailAttached) {
      model.setTailAttached(atBottom);
    }

    if (!atBottom) {
      setAnchorSeq(firstVisibleSeq(el));
    }
  }

  function reattachTail(): void {
    model.setTailAttached(true);
  }

  return (
    <div className={styles.pane}>
      <PaneHeader model={model} searchInputRef={searchInputRef} />
      {pinnedSeq !== null ? (
        <PinnedBar
          model={model}
          pinnedSeq={pinnedSeq}
          onProbeWire={onProbeWire}
          onShowInAll={onShowInAll}
        />
      ) : null}
      <div
        ref={scrollRef}
        data-testid="timeline-rows"
        className={styles.rows}
        onScroll={trackScrollPosition}
      >
        {visible.map((row) => {
          return (
            <TimelineRowView
              key={row.seq}
              row={row}
              scope={scope}
              model={model}
              pinnedSeq={pinnedSeq}
              onProbeWire={onProbeWire}
            />
          );
        })}
      </div>
      {following && !model.tailAttached ? (
        <button
          type="button"
          data-testid="live-chip"
          className={styles.liveChip}
          onClick={reattachTail}
        >
          ⤓ live
        </button>
      ) : null}
    </div>
  );
}

const MAX_RENDERED_ROWS = 500;
const HALF_WINDOW = 250;
const BOTTOM_EPSILON_PX = 8;

export interface TimelinePaneProps {
  model: TimelineModel;
  scope: Scope;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onProbeWire: (row: LogRow) => void;
  onShowInAll: () => void;
}

interface PaneHeaderProps {
  model: TimelineModel;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

function PaneHeader({ model, searchInputRef }: PaneHeaderProps): ReactElement {
  function changeScopeSearch(e: ChangeEvent<HTMLInputElement>): void {
    model.setText(e.target.value);
  }

  return (
    <div className={styles.header}>
      <input
        ref={searchInputRef}
        type="text"
        className={styles.search}
        placeholder="Search scope… ( / )"
        value={model.filter.text}
        onChange={changeScopeSearch}
      />
      {model.filter.radius !== null ? (
        <button
          type="button"
          className={styles.chip}
          title="Clear radius filter"
          onClick={model.clearRadius}
        >
          {`±${model.filter.radius.windowMs}ms ✕`}
        </button>
      ) : null}
      <button
        type="button"
        data-testid="clear-log"
        className={styles.headerButton}
        title="Hide everything before now (c)"
        onClick={model.clear}
      >
        Clear
      </button>
      {model.filter.clearedBeforeSeq > 0 ? (
        <button
          type="button"
          data-testid="unclear-log"
          className={styles.headerButton}
          title="Show the hidden rows again"
          onClick={model.unclear}
        >
          Unclear
        </button>
      ) : null}
    </div>
  );
}

interface PinnedBarProps {
  model: TimelineModel;
  pinnedSeq: number;
  onProbeWire: (row: LogRow) => void;
  onShowInAll: () => void;
}

function PinnedBar({
  model,
  pinnedSeq,
  onProbeWire,
  onShowInAll,
}: PinnedBarProps): ReactElement {
  const row = model.selectedRow;

  function probeWireAroundPin(): void {
    if (row !== null) {
      onProbeWire(row);
    }
  }

  return (
    <div className={styles.pinnedBar} data-testid="pinned-bar">
      <span className={styles.pinnedLabel}>{`⏸ ${pinnedLabel(model, pinnedSeq)}`}</span>
      {model.pinnedRowHidden && !model.agedOut ? (
        <button
          type="button"
          data-testid="show-in-all"
          className={styles.resume}
          onClick={onShowInAll}
        >
          show in All
        </button>
      ) : null}
      {row !== null && model.filter.radius === null ? (
        <button type="button" className={styles.resume} onClick={probeWireAroundPin}>
          wire ±100ms
        </button>
      ) : null}
      <button type="button" className={styles.resume} onClick={model.resume}>
        Resume
      </button>
    </div>
  );
}

interface TimelineRowViewProps {
  row: LogRow;
  scope: Scope;
  model: TimelineModel;
  pinnedSeq: number | null;
  onProbeWire: (row: LogRow) => void;
}

function TimelineRowView({
  row,
  scope,
  model,
  pinnedSeq,
  onProbeWire,
}: TimelineRowViewProps): ReactElement {
  const source = sourceOfEvent(row.event);
  const isSelected = pinnedSeq === row.seq;
  const isDimmed = pinnedSeq !== null && row.seq > pinnedSeq;
  const sourceLabel = sourceLabelFor(source?.type ?? null, source?.id ?? null, scope);

  const rowClassName = isSelected
    ? `${styles.row} ${styles.rowSelected}`
    : isDimmed
      ? `${styles.row} ${styles.rowDimmed}`
      : styles.row;

  function pinTimelineRow(): void {
    model.pin(row);
  }

  function probeWireAroundRow(): void {
    onProbeWire(row);
  }

  return (
    <div
      data-testid="timeline-row"
      data-seq={row.seq}
      data-family={familyOf(row.kind)}
      className={rowClassName}
    >
      <button type="button" className={styles.pinArea} onClick={pinTimelineRow}>
        <span className={styles.time}>{formatLogTime(row.ts)}</span>
        <span className={styles.kindChip}>{row.kind}</span>
        <span className={styles.summary}>{row.summary}</span>
        {sourceLabel !== null ? (
          <span className={styles.source} title={source?.id}>
            {sourceLabel}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        title="Show wire traffic within ±100 ms"
        className={styles.radius}
        onClick={probeWireAroundRow}
      >
        wire ±100ms
      </button>
    </div>
  );
}

/** Under a single-source scope the source column collapses (§4.2); under a
 * presenter it is the leaf label; elsewhere the full id. */
function sourceLabelFor(
  type: "stream" | "machine" | "msgType" | null,
  id: string | null,
  scope: Scope,
): string | null {
  if (type === null || id === null) {
    return null;
  }

  if (scope.kind === "stream" || scope.kind === "machine" || scope.kind === "msgType") {
    return null;
  }

  return type === "stream" ? shortLabel(id, scope) : id;
}

function pinnedLabel(model: TimelineModel, pinnedSeq: number): string {
  if (model.agedOut) {
    return "this moment left the buffer";
  }

  const time = model.selectedRow ? formatLogTime(model.selectedRow.ts) : `#${pinnedSeq}`;
  const qualifier = model.pinnedBeforeClear
    ? " (before clear)"
    : model.pinnedRowEvicted
      ? " (evicted from log)"
      : "";
  const hidden = model.pinnedRowHidden ? " — not in this scope" : "";

  return `pinned at ${time}${qualifier}${hidden}`;
}

function firstVisibleSeq(el: HTMLDivElement): number | null {
  for (const child of Array.from(el.children)) {
    const element = child as HTMLElement;

    if (element.offsetTop + element.offsetHeight > el.scrollTop) {
      const seq = Number(element.dataset.seq);

      return Number.isFinite(seq) ? seq : null;
    }
  }

  const first = el.children[0] as HTMLElement | undefined;
  const seq = Number(first?.dataset.seq);

  return Number.isFinite(seq) ? seq : null;
}

function windowedRows(
  rows: readonly LogRow[],
  centerSeq: number | null,
): readonly LogRow[] {
  if (centerSeq === null) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  const index = rows.findIndex((row) => {
    return row.seq >= centerSeq;
  });

  if (index === -1) {
    return rows.slice(-MAX_RENDERED_ROWS);
  }

  return rows.slice(Math.max(0, index - HALF_WINDOW), index + HALF_WINDOW);
}
```

- [ ] **Step 4: CSS**

Append to `TimelinePane.module.css` (and change `.source` to a span with ellipsis):

```css
.header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
}

.search {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-panel);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 11px;
}

.headerButton,
.chip {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-panel);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}

.chip {
  border-radius: 10px;
  font-size: 10px;
}

.liveChip {
  position: sticky;
  bottom: 6px;
  align-self: center;
  padding: 2px 10px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: var(--bg-panel);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}
```

and replace the existing `.source` rule with:

```css
.source {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  color: var(--accent);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Delete `FilterControls.tsx` + `FilterControls.module.css`. In `InspectorApp.tsx`: remove the `FilterControls` import and its `<FilterControls …/>` in `ConnectionRail` (drop `timeline`/`textInputRef` from `ConnectionRailProps`), and render the pane as

```tsx
<TimelinePane
  model={timeline}
  scope={ALL_SCOPE}
  searchInputRef={filterInputRef}
  onProbeWire={timeline.setRadiusAround}
  onShowInAll={noop}
/>
```

with `function noop(): void {}` as a module-level helper (Task 9 replaces both slots with the real navigation wiring).

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @rtc/devtools-app test && pnpm --filter @rtc/devtools-app typecheck && npx biome ci packages/devtools-app && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A packages/devtools-app/src
git commit -m "feat(devtools-app): TimelinePane header with Clear/Unclear + scoped search, scroll-anchored follow, whole-row pin, wire probe"
```

---

### Task 7: `timeline/MachineTab.tsx` — the machine detail, relocated from `MachinesPanel`

Pure relocation of `MachinesPanel`'s detail column (meta, State, Intents, dev-only injector). `MachinesPanel` itself is deleted in Task 9; this task only adds.

**Files:**
- Create: `packages/devtools-app/src/timeline/MachineTab.tsx`
- Create: `packages/devtools-app/src/timeline/MachineTab.module.css`
- Test: `packages/devtools-app/src/__tests__/MachineTab.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface MachineTabProps {
    machine: MachineRow;
    dev: boolean;
    onInvokeIntent?: (machineId: string, name: string, args: readonly unknown[]) => void;
    onPinIntent?: (machineId: string, name: string, ts: number) => void;
  }
  export function MachineTab(props: MachineTabProps): ReactElement
  ```
  Testids unchanged from `MachinesPanel`: `intent-name`, `intent-injector`, `intent-invoke-button`, `intent-confirm`, `intent-confirm-yes`, `intent-error`; label text `Args (JSON array)`.

- [ ] **Step 1: Write the failing tests** — port `MachinesPanelInject.test.tsx` and the intent-pin assertion from `MachinesPanel.test.tsx`:

```tsx
// packages/devtools-app/src/__tests__/MachineTab.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { MachineRow } from "@rtc/devtools-core";

import { MachineTab } from "#/timeline/MachineTab";

afterEach(cleanup);

test("shows kind, transitions, status, state and intent history newest-first", () => {
  render(
    <MachineTab
      machine={machineRow({
        transitions: 4,
        intents: [
          { name: "submit", args: [], ts: 1 },
          { name: "cancel", args: [], ts: 2 },
        ],
      })}
      dev={false}
    />,
  );

  expect(screen.getByText("OrderTicketMachine")).toBeTruthy();
  expect(screen.getByText("4")).toBeTruthy();
  expect(screen.getByText("LIVE")).toBeTruthy();
  expect(screen.getAllByTestId("intent-name").map((el) => el.textContent)).toEqual([
    "cancel",
    "submit",
  ]);
});

test("clicking an intent name calls onPinIntent with machineId/name/ts", () => {
  const onPinIntent = vi.fn();

  render(<MachineTab machine={machineRow({})} dev={false} onPinIntent={onPinIntent} />);
  fireEvent.click(screen.getByTestId("intent-name"));

  expect(onPinIntent).toHaveBeenCalledWith("m1", "submit", 1);
});

test("hides the intent injector when the app is not a dev build", () => {
  render(<MachineTab machine={machineRow({})} dev={false} />);

  expect(screen.queryByTestId("intent-injector")).toBeNull();
});

test("shows one invoke button per DISTINCT observed intent name when dev", () => {
  render(
    <MachineTab
      machine={machineRow({
        intents: [
          { name: "submit", args: [], ts: 1 },
          { name: "cancel", args: [], ts: 2 },
          { name: "submit", args: [1], ts: 3 },
        ],
      })}
      dev
    />,
  );

  expect(
    screen.getAllByTestId("intent-invoke-button").map((b) => b.textContent),
  ).toEqual(["submit", "cancel"]);
});

test("confirming an armed intent calls onInvokeIntent with the parsed JSON array args", () => {
  const onInvokeIntent = vi.fn();

  render(<MachineTab machine={machineRow({})} dev onInvokeIntent={onInvokeIntent} />);
  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: '["EURUSD", 1000000]' },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));

  expect(onInvokeIntent).toHaveBeenCalledWith("m1", "submit", ["EURUSD", 1000000]);
});

test("rejects invalid JSON and non-array JSON without invoking", () => {
  const onInvokeIntent = vi.fn();

  render(<MachineTab machine={machineRow({})} dev onInvokeIntent={onInvokeIntent} />);

  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: "{ not valid" },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));
  expect(screen.getByTestId("intent-error")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Args (JSON array)"), {
    target: { value: "{}" },
  });
  fireEvent.click(screen.getByTestId("intent-confirm-yes"));
  expect(screen.getByTestId("intent-error")).toBeTruthy();

  expect(onInvokeIntent).not.toHaveBeenCalled();
});

test("Cancel disarms a pending intent", () => {
  render(<MachineTab machine={machineRow({})} dev />);

  fireEvent.click(screen.getByTestId("intent-invoke-button"));
  expect(screen.getByTestId("intent-confirm")).toBeTruthy();

  fireEvent.click(screen.getByText("Cancel"));
  expect(screen.queryByTestId("intent-confirm")).toBeNull();
});

function machineRow(overrides: Partial<MachineRow>): MachineRow {
  return {
    machineId: "m1",
    machineKind: "OrderTicketMachine",
    args: { symbol: "EURUSD" },
    state: { status: "idle" },
    disposed: false,
    createdAt: 0,
    intents: [{ name: "submit", args: [], ts: 1 }],
    transitions: 0,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/MachineTab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MachineTab.tsx`**

Copy from `MachinesPanel.tsx` the functions `MachineDetail` (renamed and exported as `MachineTab`, minus the `detailHeader`/`timelineButton` block and the `machine === null` branch), `MetaRow`, `IntentList`, `IntentPinButton`, `IntentInjector`, `distinctIntentNames`, `withIntentKeys` and the `KeyedIntent` interface — byte-for-byte apart from the import of `styles from "#/timeline/MachineTab.module.css"` and these three handler renames required by `rtc/name-functions-by-effect` (the originals are inline arrows; make them named functions): the intent-pin `onClick` becomes `function pinIntentOnTimeline(): void { onPinIntent?.(machineId, intent.name, intent.ts); }`, the invoke-button `onClick={() => { arm(name); }}` becomes a small `ArmButton` sub-component with `function armIntent(): void { onArm(name); }`, and the textarea `onChange` becomes `function changeIntentArgs(event: ChangeEvent<HTMLTextAreaElement>): void { setArgsText(event.target.value); }`. The exported component:

```tsx
/** The Machine tab (spec §4.3): current state, transition count, intent
 * history newest-first, and — dev builds only — the confirm-gated intent
 * injector. Relocated verbatim from the retired Machines lens. */
export function MachineTab({
  machine,
  dev,
  onInvokeIntent,
  onPinIntent,
}: MachineTabProps): ReactElement {
  return (
    <div className={styles.detail}>
      <dl className={styles.meta}>
        <MetaRow label="Kind" value={machine.machineKind} />
        <MetaRow label="Transitions" value={String(machine.transitions)} />
        <MetaRow label="Status" value={machine.disposed ? "DISPOSED" : "LIVE"} />
      </dl>
      <h4 className={styles.sectionTitle}>State</h4>
      <ValueView value={machine.state} />
      <h4 className={styles.sectionTitle}>{`Intents (${machine.intents.length})`}</h4>
      <IntentList intents={machine.intents} machineId={machine.machineId} onPinIntent={onPinIntent} />
      {dev ? (
        <IntentInjector key={machine.machineId} machine={machine} onInvokeIntent={onInvokeIntent} />
      ) : null}
    </div>
  );
}

export interface MachineTabProps {
  machine: MachineRow;
  dev: boolean;
  onInvokeIntent?: (machineId: string, name: string, args: readonly unknown[]) => void;
  onPinIntent?: (machineId: string, name: string, ts: number) => void;
}
```

`MachineTab.module.css`: copy from `MachinesPanel.module.css` the rules `.detail` (drop its `border`/`border-radius`/`background` — the context pane already frames it), `.empty`, `.meta`, `.metaRow`, `.metaLabel`, `.metaValue`, `.sectionTitle`, `.intents`, `.intent`, `.intentPin`, `.intentName`, `.intentPin:hover .intentName, .intentPin:focus-visible .intentName`, `.inject`, `.injectButtons`, `.injectButton`, `.injectLabel`, `.injectArgs`, `.injectError` (use `color: var(--danger);` — the `--negative` fallback was a leftover), `.injectConfirm`, `.injectConfirmText`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/MachineTab.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx biome ci packages/devtools-app && pnpm --filter @rtc/devtools-app typecheck && pnpm lint
git add packages/devtools-app/src/timeline/MachineTab.tsx packages/devtools-app/src/timeline/MachineTab.module.css packages/devtools-app/src/__tests__/MachineTab.test.tsx
git commit -m "feat(devtools-app): MachineTab — machine detail + intent injector relocated from the Machines lens"
```

---

### Task 8: `ContextPane` — scope-narrowed State, machine `≠ live`, wire has no state, the Machine tab

**Files:**
- Modify: `packages/devtools-app/src/timeline/ContextPane.tsx`
- Modify: `packages/devtools-app/src/timeline/ContextPane.module.css` (add `.noState`, `.changedMark`)
- Modify: `packages/devtools-app/src/InspectorApp.tsx` (pass the new props)
- Modify: `packages/devtools-app/src/__tests__/ContextPane.test.tsx`

**Interfaces:**
- Consumes: `Scope`, `parseStreamId` (Task 1); `MachineTab` (Task 7); `TimelineModel` (Task 3).
- Produces:
  ```ts
  export interface ContextPaneProps {
    model: TimelineModel;
    log: readonly LogRow[];
    presentState: InspectorState;
    scope: Scope;
    dev: boolean;
    onInvokeIntent?: (machineId: string, name: string, args: readonly unknown[]) => void;
    onPinIntent?: (machineId: string, name: string, ts: number) => void;
  }
  ```
  Tabs: `event`, `state`, `diff`, `machine` (`data-testid="context-tab-machine"`, rendered only when a *context machine* exists: the `scope.kind === "machine"` machine, else the machine of the pinned row's `machineId` — looked up in `presentState.machines`, i.e. live). State button is `disabled` when `scope.kind` is `wire` | `msgType`; the body then shows `<div className={styles.noState}>wire messages carry no state</div>`. State body per scope: `all` → search + `StateTreePanel` (all streams) + `Machines` list; `presenter` → search + `StateTreePanel` (that presenter's streams); `stream` → `StateTreePanel` (that row only, no search); `machineKind` → `Machines` list (that kind only); `machine` → `Machines` list (that id only) + `<ValueView value={machine.state}>`. `MachineLine` gains `data-testid="devtools-machine-row"` and a `≠ live` mark when its pinned state JSON differs from live.

- [ ] **Step 1: Extend `ContextPane.test.tsx`**

Update the harness to accept scope + a machine-bearing seed, then add:

Replace the file's `mount`/`seed` and their types with:

```tsx
import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";

interface HarnessHandle {
  pin: (row: LogRow) => void;
  resume: () => void;
  log: readonly LogRow[];
}

interface SeedResult {
  history: LiveHistory;
  log: readonly LogRow[];
  present: InspectorState;
}

function mount(scope: Scope = ALL_SCOPE, withMachine = false): HarnessHandle {
  const handle: HarnessHandle = {
    pin: () => {},
    resume: () => {},
    log: [],
  };

  function Harness(): ReactElement {
    const [{ history, log, present }] = useState(() => {
      return seed(withMachine);
    });
    const model = useTimeline(log, history, scope, present);

    handle.pin = model.pin;
    handle.resume = model.resume;
    handle.log = log;

    return (
      <ContextPane
        model={model}
        log={log}
        presentState={present}
        scope={scope}
        dev={false}
      />
    );
  }

  render(<Harness />);

  return handle;
}

function seed(withMachine: boolean): SeedResult {
  const history = new LiveHistory();
  const store = new InspectorStore({ coalesce: false });
  const frames: AppToInspector[] = [
    {
      kind: "snapshot",
      streams: [],
      machines: withMachine
        ? [
            {
              machineId: "m1",
              machineKind: "tileExecution",
              args: ["EURUSD"],
              state: { phase: "idle" },
              disposed: false,
              createdAt: 0,
            },
          ]
        : [],
    },
  ];

  for (let seq = 1; seq <= 3; seq += 1) {
    frames.push({
      kind: "batch",
      events: [
        { kind: "stream:emission", seq, ts: 1000 + seq, streamId: "fx.price$", value: seq, coalesced: 1 },
      ],
    });
  }

  if (withMachine) {
    frames.push({
      kind: "batch",
      events: [
        { kind: "machine:state", seq: 4, ts: 1004, machineId: "m1", state: { phase: "busy" }, coalesced: 1 },
      ],
    });
  }

  for (const frame of frames) {
    history.record(frame);
    store.apply(frame);
  }

  const snapshot = store.getSnapshot();

  return { history, log: snapshot.log, present: snapshot };
}

function rowAt(log: readonly LogRow[], seq: number): LogRow {
  const row = log.find((r) => {
    return r.seq === seq;
  });

  if (row === undefined) {
    throw new Error(`no row with seq ${seq}`);
  }

  return row;
}
```

(`InspectorState` joins the `@rtc/devtools-core` type import.) The existing five tests call `mount()` and `harness.pin(rowAt(harness.log, N))` as rewritten in Task 3. Then add:

```tsx
test("presenter scope narrows State to that presenter's streams and keeps the search box", () => {
  mount({ kind: "presenter", presenter: "fx" }, true);

  expect(screen.getByText("fx.price$")).toBeTruthy();
  expect(screen.getByPlaceholderText("Search state…")).toBeTruthy();
  expect(screen.queryByText("m1")).toBeNull();
});

test("stream scope shows the single stream row without a search box", () => {
  mount({ kind: "stream", streamId: "fx.price$" }, true);

  expect(screen.getAllByTestId("devtools-stream-row").length).toBe(1);
  expect(screen.queryByPlaceholderText("Search state…")).toBeNull();
});

test("wire scope disables the State tab and explains why", () => {
  mount({ kind: "wire" });

  expect((screen.getByTestId("context-tab-state") as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("wire messages carry no state")).toBeTruthy();
});

test("machineKind scope lists only that kind's instances, marked ≠ live when pinned earlier", () => {
  const harness = mount({ kind: "machineKind", machineKind: "tileExecution" }, true);

  expect(screen.getAllByTestId("devtools-machine-row").length).toBe(1);
  expect(screen.queryByTestId("devtools-stream-row")).toBeNull();

  act(() => {
    harness.pin(rowAt(harness.log, 2)); // before the machine:state at seq 4
  });
  expect(screen.getByText("≠ live")).toBeTruthy();
});

test("machine scope shows the Machine tab with state and intents", () => {
  mount({ kind: "machine", machineId: "m1" }, true);

  fireEvent.click(screen.getByTestId("context-tab-machine"));
  expect(screen.getByText("tileExecution")).toBeTruthy();
  expect(screen.getByText("Intents (0)")).toBeTruthy();
});

test("pinning a machine row under All surfaces the Machine tab; a stream row hides it", () => {
  const harness = mount(ALL_SCOPE, true);

  expect(screen.queryByTestId("context-tab-machine")).toBeNull();

  act(() => {
    harness.pin(rowAt(harness.log, 4));
  });
  expect(screen.getByTestId("context-tab-machine")).toBeTruthy();

  act(() => {
    harness.pin(rowAt(harness.log, 1));
  });
  expect(screen.queryByTestId("context-tab-machine")).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/ContextPane.test.tsx`
Expected: FAIL — missing props / tab.

- [ ] **Step 3: Implement**

In `ContextPane.tsx`:

```tsx
type ContextTab = "event" | "state" | "diff" | "machine";

const TAB_LABELS: Record<ContextTab, string> = {
  event: "Event",
  state: "State",
  diff: "Diff",
  machine: "Machine",
};

export function ContextPane({
  model,
  log,
  presentState,
  scope,
  dev,
  onInvokeIntent,
  onPinIntent,
}: ContextPaneProps): ReactElement {
  const [tab, setTab] = useState<ContextTab>("state");
  const pinned = model.selection.mode === "pinned";
  const row = model.selectedRow;
  const contextMachine = findContextMachine(presentState, scope, row);
  const stateAvailable = scope.kind !== "wire" && scope.kind !== "msgType";
  // Tabs that need a pinned row fall back to State while following; a
  // Machine tab left selected after its machine went away falls back too.
  const activeTab = resolveTab(tab, pinned, contextMachine !== null);

  return (
    <div className={styles.pane}>
      <nav className={styles.tabs}>
        <TabButton tabId="event" active={activeTab} disabled={!pinned} onSelect={setTab} />
        <TabButton tabId="state" active={activeTab} disabled={!stateAvailable} onSelect={setTab} />
        <TabButton tabId="diff" active={activeTab} disabled={!pinned} onSelect={setTab} />
        {contextMachine !== null ? (
          <TabButton tabId="machine" active={activeTab} disabled={false} onSelect={setTab} />
        ) : null}
      </nav>
      <div className={styles.body}>
        {activeTab === "machine" && contextMachine !== null ? (
          <MachineTab
            machine={contextMachine}
            dev={dev}
            onInvokeIntent={onInvokeIntent}
            onPinIntent={onPinIntent}
          />
        ) : (
          <ContextBody
            tab={activeTab}
            model={model}
            row={row}
            log={log}
            presentState={presentState}
            scope={scope}
            stateAvailable={stateAvailable}
          />
        )}
      </div>
    </div>
  );
}
```

with these helpers below the sub-components:

```tsx
function resolveTab(tab: ContextTab, pinned: boolean, hasMachine: boolean): ContextTab {
  if (tab === "machine") {
    return hasMachine ? "machine" : "state";
  }

  return pinned ? tab : "state";
}

/** The machine the Machine tab describes: the scoped one, else the pinned
 * row's. Always the LIVE row (intent history + injector are live concerns);
 * the State tab is where the pinned reconstruction shows. */
function findContextMachine(
  state: InspectorState,
  scope: Scope,
  row: LogRow | null,
): MachineRow | null {
  const machineId =
    scope.kind === "machine"
      ? scope.machineId
      : row !== null && "machineId" in row.event
        ? row.event.machineId
        : null;

  if (machineId === null) {
    return null;
  }

  return (
    state.machines.find((machine) => {
      return machine.machineId === machineId;
    }) ?? null
  );
}
```

`ContextBody` gains `scope` and `stateAvailable` props; before the state branch add:

```tsx
  if (tab === "state" && !stateAvailable) {
    return <div className={styles.noState}>wire messages carry no state</div>;
  }
```

and pass `scope` into `StateTab`. `StateTab` becomes:

```tsx
interface StateTabProps {
  state: InspectorState;
  presentState: InspectorState;
  marked: boolean;
  scope: Scope;
}

function StateTab({ state, presentState, marked, scope }: StateTabProps): ReactElement {
  const [query, setQuery] = useState("");
  const searchable = scope.kind === "all" || scope.kind === "presenter";
  const showStreams = scope.kind === "all" || scope.kind === "presenter" || scope.kind === "stream";
  const showMachines = scope.kind === "all" || scope.kind === "machineKind" || scope.kind === "machine";

  function changeStateQuery(e: ChangeEvent<HTMLInputElement>): void {
    setQuery(e.target.value);
  }

  const changedStreams = marked ? changedStreamIds(state.streams, presentState.streams) : EMPTY_IDS;
  const changedMachines = marked ? changedMachineIds(state.machines, presentState.machines) : EMPTY_IDS;
  const streams = filterStreams(streamsInScope(state.streams, scope), searchable ? query : "");
  const machines = machinesInScope(state.machines, scope);
  const focused = scope.kind === "machine" ? (machines[0] ?? null) : null;

  return (
    <div className={styles.stateTab}>
      {searchable ? (
        <input
          type="text"
          className={styles.search}
          placeholder="Search state…"
          value={query}
          onChange={changeStateQuery}
        />
      ) : null}
      {showStreams ? <StateTreePanel streams={streams} changedIds={changedStreams} /> : null}
      {showMachines ? (
        <>
          <h3 className={styles.machinesTitle}>Machines</h3>
          <div className={styles.machines}>
            {machines.map((machine) => {
              return (
                <MachineLine
                  key={machine.machineId}
                  machine={machine}
                  changed={changedMachines.has(machine.machineId)}
                />
              );
            })}
          </div>
        </>
      ) : null}
      {focused !== null ? <ValueView value={focused.state} /> : null}
    </div>
  );
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

function streamsInScope(streams: readonly StreamRow[], scope: Scope): readonly StreamRow[] {
  if (scope.kind === "presenter") {
    return streams.filter((row) => {
      return parseStreamId(row.streamId).presenter === scope.presenter;
    });
  }

  if (scope.kind === "stream") {
    return streams.filter((row) => {
      return row.streamId === scope.streamId;
    });
  }

  return streams;
}

function machinesInScope(machines: readonly MachineRow[], scope: Scope): readonly MachineRow[] {
  if (scope.kind === "machineKind") {
    return machines.filter((row) => {
      return row.machineKind === scope.machineKind;
    });
  }

  if (scope.kind === "machine") {
    return machines.filter((row) => {
      return row.machineId === scope.machineId;
    });
  }

  return machines;
}

function changedMachineIds(
  pinned: readonly MachineRow[],
  live: readonly MachineRow[],
): ReadonlySet<string> {
  const liveById = new Map(
    live.map((row) => {
      return [row.machineId, row] as const;
    }),
  );
  const changed = new Set<string>();

  for (const row of pinned) {
    const liveRow = liveById.get(row.machineId);

    if (liveRow === undefined || JSON.stringify(liveRow.state) !== JSON.stringify(row.state)) {
      changed.add(row.machineId);
    }
  }

  return changed;
}
```

`MachineLine` gains `changed: boolean`, the testid, and the mark:

```tsx
interface MachineLineProps {
  machine: MachineRow;
  changed: boolean;
}

function MachineLine({ machine, changed }: MachineLineProps): ReactElement {
  const stateJson = JSON.stringify(machine.state) ?? "null";
  const compact = stateJson.length > 60 ? `${stateJson.slice(0, 60)}…` : stateJson;

  return (
    <div data-testid="devtools-machine-row" className={styles.machineLine}>
      <span className={styles.machineId}>{machine.machineId}</span>
      <span className={styles.machineKind}>{machine.machineKind}</span>
      <span className={styles.machineState}>{compact}</span>
      {changed ? (
        <span className={styles.changedMark} title="differs from live">
          ≠ live
        </span>
      ) : null}
    </div>
  );
}
```

Delete `computeChangedIds` / `computeVisibleStreams` (inlined above). New imports: `import type { Scope } from "#/nav/scope"; import { parseStreamId } from "#/nav/scope"; import { MachineTab } from "#/timeline/MachineTab";`. CSS additions:

```css
.noState {
  padding: 12px;
  color: var(--dim);
  font-size: 12px;
}

.changedMark {
  margin-left: 6px;
  color: var(--warn);
  font-size: 11px;
}
```

`InspectorApp.tsx`: pass `scope={ALL_SCOPE} dev={presentState.dev} onInvokeIntent={onInvokeIntent} onPinIntent={pinTimelineAtIntent}` to `<ContextPane>`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/devtools-app test && pnpm --filter @rtc/devtools-app typecheck && npx biome ci packages/devtools-app && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/devtools-app/src
git commit -m "feat(devtools-app): ContextPane narrows State to the scope, marks machines ≠ live, adds the Machine tab"
```

---

### Task 9: `InspectorApp` — NavTree in the rail, lenses retired, keyboard routing, wire probe, Esc precedence

The swap. `MachinesPanel`, `WirePanel`, `LensStrip`, the rail counters and their tests go; `NavTree` + `useNavigation` come in; the `keydown` listener binds once and routes by focus.

**Files:**
- Modify: `packages/devtools-app/src/InspectorApp.tsx`
- Modify: `packages/devtools-app/src/InspectorApp.module.css`
- Delete: `packages/devtools-app/src/panels/MachinesPanel.tsx`, `MachinesPanel.module.css`, `WirePanel.tsx`, `WirePanel.module.css`, `src/__tests__/MachinesPanel.test.tsx`, `MachinesPanelInject.test.tsx`, `WirePanel.test.tsx`
- Modify: `packages/devtools-app/src/__tests__/InspectorApp.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: `InspectorAppProps` unchanged (`store`, `onInvokeIntent?`). Rail = badge + mismatch + `NavTree`. Main = `RecordingToolbar` + split (`TimelinePane` | `ContextPane`). Shortcuts (outside inputs and outside the tree): `ArrowUp`/`ArrowDown` step, `/` focus search, `c` clear, `Escape` per spec §3.1 precedence: (1) `navigation.popScope()` succeeded → also `timeline.clearRadius()`; (2) pinned → `resume()`; (3) `!tailAttached` → `setTailAttached(true)`.

- [ ] **Step 1: Rewrite the journey test in `InspectorApp.test.tsx`**

Replace "timeline lens, pin/Escape, and the machines/wire lenses — the full journey" with:

```tsx
test("tree scoping, pin/Escape, Machine tab, Clear, and the wire probe — the full journey", () => {
  Element.prototype.animate = vi.fn(() => {
    return { cancel: () => {} };
  }) as unknown as typeof Element.prototype.animate;

  const store = new InspectorStore({ coalesce: false });
  render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({
      kind: "snapshot",
      streams: [],
      machines: [
        { machineId: "m1", machineKind: "tileExecution", args: ["EURUSD"], state: { phase: "idle" }, disposed: false, createdAt: 0 },
      ],
    });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }

    store.apply({
      kind: "batch",
      events: [
        { kind: "machine:state", seq: 4, ts: 1004, machineId: "m1", state: { phase: "busy" }, coalesced: 1 },
        { kind: "wire:in", seq: 5, ts: 1005, msgType: "PRICE", payload: null },
      ],
    });
  });

  expect(screen.getByTestId("connection-badge").textContent).toBe("rtc-web");
  expect(screen.getAllByTestId("timeline-row").length).toBe(5);

  // Scope to the fx presenter: only its emissions remain, State narrows.
  fireEvent.click(navNode("presenter:fx"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(3);
  expect(screen.queryByTestId("devtools-machine-row")).toBeNull();

  // Pin via keyboard from follow mode; State@seq differs from live.
  fireEvent.keyDown(window, { key: "ArrowUp" });
  fireEvent.keyDown(window, { key: "ArrowUp" });
  fireEvent.keyDown(window, { key: "ArrowUp" });
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();
  fireEvent.click(screen.getByTestId("context-tab-state"));
  expect(screen.getByText("≠ live")).toBeTruthy();

  // Wire probe: scope jumps to All with a ±100ms radius; Esc restores fx.
  fireEvent.click(screen.getByText("wire ±100ms", { selector: "[data-testid='pinned-bar'] button" }));
  expect(navNode("all").dataset.selected).toBe("true");
  expect(screen.getByText("±100ms ✕")).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(navNode("presenter:fx").dataset.selected).toBe("true");
  expect(screen.queryByText("±100ms ✕")).toBeNull();
  expect(screen.getByTestId("pinned-bar")).toBeTruthy(); // still pinned

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByTestId("pinned-bar")).toBeNull();

  // Machines branch: the kind node scopes to machine rows; the Machine tab appears for an instance.
  fireEvent.click(navNode("machineKind:tileExecution"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(1);
  expect(screen.getByTestId("devtools-machine-row").textContent).toContain("tileExecution");
  fireEvent.click(
    navNode("machineKind:tileExecution").parentElement?.querySelector(
      "[aria-label='Expand']",
    ) as HTMLElement,
  );
  fireEvent.click(navNode("machine:m1"));
  fireEvent.click(screen.getByTestId("context-tab-machine"));
  expect(screen.getByText("Intents (0)")).toBeTruthy();

  // Wire branch: State is unavailable.
  fireEvent.click(navNode("msgType:PRICE"));
  expect(screen.getByText("wire messages carry no state")).toBeTruthy();

  // Clear (keyboard) empties every scope and zeroes the All badge; Unclear restores.
  fireEvent.click(navNode("all"));
  fireEvent.keyDown(window, { key: "c" });
  expect(screen.queryAllByTestId("timeline-row")).toEqual([]);
  expect(navNode("all").textContent).toContain("0");
  fireEvent.click(screen.getByTestId("unclear-log"));
  expect(screen.getAllByTestId("timeline-row").length).toBe(5);
});

function navNode(id: string): HTMLElement {
  const match = screen.getAllByTestId("nav-node").find((el) => {
    return el.dataset.scopeId === id;
  });

  if (match === undefined) {
    throw new Error(`no nav-node ${id}`);
  }

  return match;
}
```

Also add:

```tsx
test("shortcuts are ignored while the tree has focus, and the keydown listener is bound once", () => {
  const store = new InspectorStore({ coalesce: false });
  const addSpy = vi.spyOn(window, "addEventListener");
  const { rerender } = render(<InspectorApp store={store} />);

  act(() => {
    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    store.apply({ kind: "snapshot", streams: [], machines: [] });

    for (const frame of emissionBatches()) {
      store.apply(frame);
    }
  });

  rerender(<InspectorApp store={store} />);
  rerender(<InspectorApp store={store} />);
  expect(
    addSpy.mock.calls.filter(([type]) => {
      return type === "keydown";
    }).length,
  ).toBe(1);

  const tree = screen.getByTestId("nav-tree");

  tree.focus();
  fireEvent.keyDown(tree, { key: "ArrowUp" });
  expect(screen.queryByTestId("pinned-bar")).toBeNull();

  fireEvent.keyDown(window, { key: "ArrowUp" });
  expect(screen.getByTestId("pinned-bar")).toBeTruthy();
});
```

The other tests in the file (`pinButton` = first `button` inside a `timeline-row`) keep working unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rtc/devtools-app exec vitest run src/__tests__/InspectorApp.test.tsx`
Expected: FAIL — no `nav-node`s.

- [ ] **Step 3: Rewrite `InspectorApp.tsx`**

```tsx
// packages/devtools-app/src/InspectorApp.tsx
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

import type { InspectorState, InspectorStore, LogRow } from "@rtc/devtools-core";
import { LiveHistory, projectSnapshot } from "@rtc/devtools-core";

import styles from "#/InspectorApp.module.css";
import type { NavNode } from "#/nav/buildNavTree";
import { buildNavTree } from "#/nav/buildNavTree";
import { NavTree } from "#/nav/NavTree";
import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";
import type { NavigationModel } from "#/nav/useNavigation";
import { useNavigation } from "#/nav/useNavigation";
import { RecordingToolbar } from "#/recording/RecordingToolbar";
import { useRecording } from "#/recording/useRecording";
import { ContextPane } from "#/timeline/ContextPane";
import { TimelinePane } from "#/timeline/TimelinePane";
import { logAfterSeq, seqOfMachineIntent } from "#/timeline/timelineModel";
import type { TimelineModel } from "#/timeline/useTimeline";
import { useTimeline } from "#/timeline/useTimeline";
import { useInspectorState } from "#/useInspectorState";

/** The devtools panel shell (spec §3): a rail holding the connection badge
 * and the navigation tree, beside a main column of recording toolbar and
 * the scoped split — actions list | context pane. One selection (the
 * scope) drives everything: the tree owns it, `useTimeline` compiles it
 * into a filter, the context pane narrows State to it. Importing a
 * recording swaps the datasource wholesale (log, history, present state)
 * and resets the scope, pin and radius. */
export function InspectorApp({
  store,
  onInvokeIntent,
}: InspectorAppProps): ReactElement {
  const liveState = useInspectorState(store);

  // Build-exactly-once instance, NOT a cache (see the tap effect below).
  const liveHistoryRef = useRef<LiveHistory | null>(null);

  if (liveHistoryRef.current === null) {
    liveHistoryRef.current = new LiveHistory();
  }

  const liveHistory = liveHistoryRef.current;
  const seededHistoryRef = useRef<LiveHistory | null>(null);

  useEffect((): (() => void) => {
    if (seededHistoryRef.current !== liveHistory) {
      liveHistory.record(projectSnapshot(store.getSnapshot()));
      seededHistoryRef.current = liveHistory;
    }

    return store.tap((msg) => {
      liveHistory.record(msg);
    });
  }, [store, liveHistory]);

  const recording = useRecording(store, liveHistory, liveState.appId);

  const activeLog = recording.imported?.state.log ?? liveState.log;
  const activeHistory = recording.imported?.history ?? liveHistory;
  const presentState = recording.imported?.state ?? liveState;

  const navigation = useNavigation();
  const timeline = useTimeline(activeLog, activeHistory, navigation.scope, presentState);
  const visibleLog = logAfterSeq(activeLog, timeline.filter.clearedBeforeSeq);
  const navTree = buildNavTree(presentState, visibleLog);

  // A datasource swap is a new timeline: drop the pin, radius and scope.
  // Ref comparison, not just deps — `timeline`/`navigation` are fresh objects
  // every render (see the previous version's note); firing on mount is
  // harmless.
  const previousHistoryRef = useRef<LiveHistory | null>(null);

  useEffect((): void => {
    if (previousHistoryRef.current !== activeHistory) {
      previousHistoryRef.current = activeHistory;
      timeline.resume();
      timeline.clearRadius();
      navigation.select(ALL_SCOPE);
    }
  }, [activeHistory, timeline, navigation]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  function probeWireAroundRow(row: LogRow): void {
    navigation.pushScope(ALL_SCOPE);
    timeline.pin(row);
    timeline.setRadiusAround(row);
  }

  function showPinnedInAll(): void {
    navigation.select(ALL_SCOPE);
  }

  function pinTimelineAtIntent(machineId: string, name: string, ts: number): void {
    const seq = seqOfMachineIntent(activeLog, machineId, name, ts);
    const row =
      seq === null
        ? undefined
        : activeLog.find((r) => {
            return r.seq === seq;
          });

    if (row !== undefined) {
      timeline.pin(row);
    }
  }

  function escapeTimeline(): void {
    if (navigation.popScope()) {
      timeline.clearRadius();

      return;
    }

    if (timeline.selection.mode === "pinned") {
      timeline.resume();

      return;
    }

    if (!timeline.tailAttached) {
      timeline.setTailAttached(true);
    }
  }

  useWindowShortcuts({
    stepPrev: timeline.selectPrev,
    stepNext: timeline.selectNext,
    escape: escapeTimeline,
    clear: timeline.clear,
    focusSearch: (): void => {
      searchInputRef.current?.focus();
    },
  });

  return (
    <div className={styles.app}>
      <ConnectionRail state={presentState} nodes={navTree} navigation={navigation} />
      <div className={styles.main}>
        <RecordingToolbar model={recording} />
        <div className={styles.split}>
          <TimelinePane
            model={timeline}
            scope={navigation.scope}
            searchInputRef={searchInputRef}
            onProbeWire={probeWireAroundRow}
            onShowInAll={showPinnedInAll}
          />
          <ContextPane
            model={timeline}
            log={activeLog}
            presentState={presentState}
            scope={navigation.scope}
            dev={presentState.dev}
            onInvokeIntent={onInvokeIntent}
            onPinIntent={pinTimelineAtIntent}
          />
        </div>
      </div>
    </div>
  );
}

export interface InspectorAppProps {
  store: InspectorStore;
  onInvokeIntent?: (machineId: string, name: string, args: readonly unknown[]) => void;
}

interface Shortcuts {
  stepPrev: () => void;
  stepNext: () => void;
  escape: () => void;
  clear: () => void;
  focusSearch: () => void;
}

/** One window `keydown` listener for the life of the app (not one per
 * render — the STATUS "re-binds per render" item). The latest handlers
 * live in a ref the listener reads at dispatch time. Routing by focus:
 * inside an input/textarea only Escape acts (blur); inside the tree
 * (`[data-nav-tree]`) nothing acts — the tree has its own keys (§3.1). */
function useWindowShortcuts(shortcuts: Shortcuts): void {
  const shortcutsRef = useRef(shortcuts);

  shortcutsRef.current = shortcuts;

  useEffect((): (() => void) => {
    function dispatchInspectorShortcut(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const current = shortcutsRef.current;

      if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        if (e.key === "Escape") {
          target.blur();
        }

        return;
      }

      if (target !== null && target.closest("[data-nav-tree]") !== null) {
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        current.stepPrev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        current.stepNext();
      } else if (e.key === "Escape") {
        current.escape();
      } else if (e.key === "/") {
        e.preventDefault();
        current.focusSearch();
      } else if (e.key === "c") {
        current.clear();
      }
    }

    window.addEventListener("keydown", dispatchInspectorShortcut);

    return (): void => {
      window.removeEventListener("keydown", dispatchInspectorShortcut);
    };
  }, []);
}

interface ConnectionRailProps {
  state: InspectorState;
  nodes: readonly NavNode[];
  navigation: NavigationModel;
}

function ConnectionRail({ state, nodes, navigation }: ConnectionRailProps): ReactElement {
  function selectScope(scope: Scope): void {
    navigation.select(scope);
  }

  return (
    <aside className={styles.rail}>
      <div className={styles.railHeader}>
        <span
          className={state.connected ? styles.dotConnected : styles.dotDisconnected}
          aria-hidden="true"
        />
        <span data-testid="connection-badge" className={styles.appId}>
          {state.connected ? state.appId : "disconnected"}
        </span>
      </div>
      {state.protocolMismatch !== null ? (
        <p className={styles.mismatch}>Protocol mismatch: app v{state.protocolMismatch}</p>
      ) : null}
      <NavTree nodes={nodes} scope={navigation.scope} onSelect={selectScope} />
    </aside>
  );
}
```

(`TimelineModel` import is kept only if still referenced; drop it if unused — knip/biome will say.)

`InspectorApp.module.css`: `.rail { flex: 0 0 220px; }`; delete the `.counts`, `.count`, `.count dt`, `.count dd`, `.lensStrip`, `.tab`, `.tabActive`, `.panel` rules.

Delete the four panel files and the three panel tests. Grep the package for any remaining `MachinesPanel`/`WirePanel`/`FilterControls`/`lens-` references (`README.md` in the package mentions lenses — update its wording to "navigation tree" in the same commit).

- [ ] **Step 4: Run everything for the package**

Run: `pnpm --filter @rtc/devtools-app test && pnpm --filter @rtc/devtools-app typecheck && pnpm --filter @rtc/devtools-app build && npx biome ci packages/devtools-app && pnpm lint && pnpm knip`
Expected: PASS; knip reports no unused files/exports in `devtools-app` (if `seqOfMachineIntent` or `TimelineFamily` are flagged, they are still used — check; if `pillKey` is now unused, delete it and its test line).

- [ ] **Step 5: Per-file coverage**

Run: `pnpm --filter @rtc/devtools-app exec vitest run --coverage --coverage.include='src/**' --coverage.exclude='src/main.tsx'`
Expected: every file under `src/nav/` and `src/timeline/` ≥ 95% statements; list any below and add the missing test before committing.

- [ ] **Step 6: Commit**

```bash
git add -A packages/devtools-app
git commit -m "feat(devtools-app): store-first navigation — NavTree rail, lenses retired, focus-routed shortcuts, wire probe"
```

---

### Task 10: E2E — tree scoping, Clear, machine node (react + solid)

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (the `devtools` block)
- Modify: `tests/browser/page-objects/contracts/Inspector.ts`
- Modify: `tests/browser/page-objects/playwright/Inspector.ts`
- Modify: `tests/browser/scenarios/devtools.ts`
- Modify: `tests/browser/playwright/devtools.spec.ts`

**Interfaces:**
- `TESTIDS.devtools`: remove `lensMachines`; add `navNode: "nav-node"`, `clearLog: "clear-log"`, `unclearLog: "unclear-log"`.
- `InspectorPO`: remove `openMachinesLens`; add
  ```ts
  /** Click the tree node whose `data-scope-id` is `nodeId` (e.g. "presenter:blotter",
   *  "machineKind:tileExecution", "all"). Waits for the node to exist first — machine
   *  nodes only appear once the app has birthed that machine. */
  selectNavNode(nodeId: string, timeoutMs: number): Promise<void>;
  /** Assert at least one timeline row is listed and EVERY listed row's text contains
   *  `text` — the scoped list shows only the selected node's rows. */
  waitTimelineRowsAllContain(text: string, timeoutMs: number): Promise<void>;
  /** Click Clear. Returns the highest `data-seq` among the rows listed just before the
   *  click — the watermark the caller asserts against. Under a live stream new rows
   *  arrive within ~66 ms of the click, so "the list is empty" is not a stable
   *  assertion; "every listed row is newer than the watermark" is. */
  clearTimeline(timeoutMs: number): Promise<number>;
  /** Assert the Unclear affordance is visible and that at least one row is listed whose
   *  `data-seq` exceeds `watermark`, with none at or below it. */
  waitTimelineClearedPast(watermark: number, timeoutMs: number): Promise<void>;
  ```

- [ ] **Step 1: Contract + testids**

Apply the interface changes above. Each new method gets the docstring shown.

- [ ] **Step 2: Playwright implementation**

In `tests/browser/page-objects/playwright/Inspector.ts` replace `openMachinesLens` with:

```ts
  async selectNavNode(nodeId: string, timeoutMs: number): Promise<void> {
    const node = this.page()
      .getByTestId(TESTIDS.devtools.navNode)
      .and(this.page().locator(`[data-scope-id="${nodeId}"]`));

    await node.waitFor({ state: "visible", timeout: timeoutMs });
    // Tree rows never remount (keyed by stable node id) and their only
    // animation is an opacity flash, so a plain click is stable here —
    // unlike timeline rows under a live stream.
    await node.click({ timeout: timeoutMs });
  }

  async waitTimelineRowsAllContain(text: string, timeoutMs: number): Promise<void> {
    const rows = this.page().getByTestId(TESTIDS.devtools.timelineRow);

    await expect(rows.first()).toBeAttached({ timeout: timeoutMs });
    await expect(rows.filter({ hasNotText: text })).toHaveCount(0, {
      timeout: timeoutMs,
    });
  }

  async clearTimeline(timeoutMs: number): Promise<number> {
    const rows = this.page().getByTestId(TESTIDS.devtools.timelineRow);

    await expect(rows.first()).toBeAttached({ timeout: timeoutMs });

    const seqs = await rows.evaluateAll((elements) => {
      return elements.map((el) => {
        return Number((el as HTMLElement).dataset.seq);
      });
    });
    const watermark = Math.max(...seqs);

    await this.page()
      .getByTestId(TESTIDS.devtools.clearLog)
      .click({ timeout: timeoutMs });

    return watermark;
  }

  async waitTimelineClearedPast(watermark: number, timeoutMs: number): Promise<void> {
    await expect(this.page().getByTestId(TESTIDS.devtools.unclearLog)).toBeVisible({
      timeout: timeoutMs,
    });

    const rows = this.page().getByTestId(TESTIDS.devtools.timelineRow);

    await expect
      .poll(
        async () => {
          const seqs = await rows.evaluateAll((elements) => {
            return elements.map((el) => {
              return Number((el as HTMLElement).dataset.seq);
            });
          });

          // Until a post-clear row arrives, report the watermark itself so the
          // poll keeps waiting; any row AT or BELOW it is a real failure.
          return seqs.length === 0 ? watermark : Math.min(...seqs);
        },
        { timeout: timeoutMs },
      )
      .toBeGreaterThan(watermark);
  }
```

- [ ] **Step 3: Scenarios**

In `tests/browser/scenarios/devtools.ts` replace `openMachinesLens` with:

```ts
/** Select a navigation-tree node by its scope id (spec §3.2) — e.g.
 *  `presenter:blotter` scopes the actions list and State to that presenter;
 *  `machineKind:tileExecution` to that machine kind. `seconds` bounds both the
 *  wait for the node to exist and the click. */
export async function selectNavNode(
  ctx: TestContext,
  nodeId: string,
  seconds: number,
): Promise<void> {
  await inspector(ctx).selectNavNode(nodeId, seconds * 1_000);
}

/** Assert the scoped actions list shows only rows whose text contains
 *  `text` (row summaries carry the stream id), within 10s. */
export async function expectOnlyRowsContaining(
  ctx: TestContext,
  text: string,
): Promise<void> {
  await inspector(ctx).waitTimelineRowsAllContain(text, 10_000);
}

/** Clear (Redux "Commit"): hide everything before now. Returns the watermark
 *  seq so the caller can assert the refill is strictly newer. */
export async function clearTimeline(ctx: TestContext): Promise<number> {
  return inspector(ctx).clearTimeline(10_000);
}

/** Assert Unclear is offered and the list has refilled with rows strictly
 *  newer than `watermark`, within 15s. */
export async function expectTimelineClearedPast(
  ctx: TestContext,
  watermark: number,
): Promise<void> {
  await inspector(ctx).waitTimelineClearedPast(watermark, 15_000);
}
```

- [ ] **Step 4: The spec body**

Replace the block from the `expectStreamRow` step to the `expectMachineOfKind` step in `devtools.spec.ts` with:

```ts
    // Following live under All: the context pane's state tree shows a stream
    // row for the blotter trades stream.
    await devtools.expectStreamRow(ctx, "blotter.trades$");

    // Store-first scoping (spec §3): pick the blotter presenter in the tree
    // and only its rows are listed. Row summaries carry the stream id, so a
    // text assertion is exact.
    await devtools.selectNavNode(ctx, "presenter:blotter", 15);
    await devtools.expectOnlyRowsContaining(ctx, "blotter.");

    // Back to All for the pin journey (blotter traffic is sparse; the pin
    // step wants a busy tail).
    await devtools.selectNavNode(ctx, "all", 15);

    // Timeline pin-and-inspect journey: pin the newest row (ArrowUp — the
    // deterministic way to grab a moment out of a live tail), confirm the
    // inspector freezes at that moment, and Esc resumes the live tail.
    await devtools.pinLatestTimelineRow(ctx);
    await devtools.expectPinnedBar(ctx);
    await devtools.resumeViaEscape(ctx);
    await devtools.expectNoPinnedBar(ctx);

    // Clear (spec §5): everything before now is hidden; the list refills
    // with strictly newer rows and Unclear is offered.
    const watermark = await devtools.clearTimeline(ctx);
    await devtools.expectTimelineClearedPast(ctx, watermark);

    // Machines branch: the tileExecution kind node exists once the FX tiles
    // have birthed their machines; selecting it lists that kind's instances
    // in the State tab.
    await devtools.selectNavNode(ctx, "machineKind:tileExecution", 15);
    await devtools.expectMachineOfKind(ctx, "tileExecution");
```

and update the test title to `"connects to the same-origin app, scopes by store, clears, and lists machines"`.

- [ ] **Step 5: Run both clients**

```bash
pnpm --filter @rtc/devtools-app build          # the dev server serves the BUILT inspector at /devtools/
pnpm --filter @rtc/tests test:browser:playwright devtools.spec.ts --repeat-each=3
pnpm --filter @rtc/tests test:browser:playwright:solid devtools.spec.ts
```

Expected: all green, ~3–6 s per run. If `presenter:blotter` scoping flakes because no blotter row has arrived within 10 s, widen that single wait to 20 s — the simulator emits `blotter.activity$` continuously, so the row exists; do not switch the assertion to a busier presenter.

- [ ] **Step 6: Lint + commit**

```bash
npx biome ci tests && pnpm lint
git add tests/browser
git commit -m "test(e2e): devtools journey — tree scoping, Clear watermark, machine-kind node replace the lens click"
```

---

### Task 11: Docs, STATUS, and the full gauntlet

**Files:**
- Modify: `docs/architecture/20-devtools.md` (new §20.12 after §20.11, before the closing `---`)
- Modify: `docs/STATUS.md`
- Modify: `CLAUDE.md` (the `devtools-app` line in Package Structure)
- Modify: `packages/devtools-app/README.md` (if it still describes lenses — grep `lens`)

- [ ] **Step 1: §20.12**

Append before the final `---` of `docs/architecture/20-devtools.md`:

```markdown
### 20.12 Store-first navigation (v3)

Full design: [`2026-08-29-devtools-store-first-navigation-design.md`](../superpowers/specs/2026-08-29-devtools-store-first-navigation-design.md).
v2 fixed *indexing* (the pinned moment is the unit of navigation); v3 fixes
*scope*. The rail is now a **navigation tree** with four roots — **All**,
**Presenters → streams**, **Machines → kind → instance**, **Wire → msgType**
— and the inspector has one selection, the `Scope`
(`packages/devtools-app/src/nav/scope.ts`). Redux's mapping: a presenter is
the store, its streams are the slices, the scoped actions list is that
store's inputs, and Clear is Commit.

**Scope compiles to the filter.** `useTimeline(log, history, scope, state)`
calls `compileScope` every render and spreads the result into the
`TimelineFilter` it already had — `families` and `pills` stopped being user
state and became compiled output; free text, the ±100 ms radius and the
Clear watermark remain user state. A presenter scope becomes one `stream`
pill per member stream; a machine kind becomes one `machine` pill per
instance. `pills: null` is unconstrained and `[]` matches nothing, so a
presenter whose streams were evicted cannot silently widen to every stream.
Stream identity is parsed from the id string by `parseStreamId`
(`key.prop[JSON-args]`, the `instrumentPresenters` convention) — the one
helper a future protocol with first-class identity would delete.

**Context pane per scope.** State shows only the selected node's slices
(the presenter's streams, the single stream, the kind's instances, the
machine's state); it is disabled under wire scopes ("wire messages carry no
state"). `≠ live` marks now cover machines. A fourth **Machine** tab
(`timeline/MachineTab.tsx`) carries what the retired Machines lens's detail
column had — state, transitions, intent history, the dev-only injector.

**Clear = `clearedBeforeSeq`.** A watermark in the filter (`filterLog` slices
the seq-sorted log by binary search); every scope's list and every tree
badge reset, the store and `LiveHistory` are untouched, a moment pinned
before the clear still reconstructs and says so, and **Unclear** restores the
rows. A hard reset that drops buffers is deliberately absent.

**Follow is scroll-anchored.** `TimelinePane` auto-scrolls only while the
pane is at the bottom; scrolling up detaches, a "⤓ live" chip re-attaches,
and the 500-row render window anchors to the first visible row while
detached so rows stop remounting under the cursor. That is what made the
whole row a safe click target — the moving-target race that flaked the e2e
(PR #325) is gone at the source.

**The pinned row is captured.** `TimelineSelection` carries the `LogRow`
itself, so the Event and Diff tabs survive the row leaving the 5000-row log;
the pinned bar says "(evicted from log)" when it has.

**Deviation from v2's lens model.** The Machines and Wire lenses were
retired into tree branches rather than kept beside the tree: two navigation
models (a scope tree and lens tabs) would have reproduced the "four
dashboards" problem the timeline spec diagnosed. The wire lens's health line
(in/s, out/s, reconnects) lives on the Wire root; its never-shipped
"last-message age" metric was dropped.
```

- [ ] **Step 2: STATUS.md**

- Delete the **Devtools store-first navigation (v3)** entry from `🔴 Designed, not built` (it shipped).
- In the **Devtools timeline UX — post-ship polish** entry, delete these clauses/bullets: `wire-lens "last-message age" metric (spec'd, not shipped) + header hidden in wire-empty state`; `≠-live marks and state-search cover streams only, not machines`; `keyboard listener re-binds per render and ↑/↓ act on the timeline even from the Machines/Wire lens`; the whole **BUG (highest-value fix): pinned-row log-cap eviction** bullet; the **Cosmetic:** long-source-label bullet; the whole **UX: scroll-detached follow mode** bullet. Keep the rest (importRecording try, LiveHistory.trim, DiffView tokens, reconstructError test, radius pill center ts, import-mode badge, seed-from-flushed-snapshot, React DevTools interference, Chrome tab-freeze note).
- Bump `**Last updated:**` to the merge date; run `pnpm check:doc-links`.

- [ ] **Step 3: CLAUDE.md + README**

`CLAUDE.md` package line: `devtools-app/ @rtc/devtools-app — Inspector SPA (store-first: navigation tree All/Presenters/Machines/Wire → scoped actions list + Event/State/Diff/Machine context pane, Clear watermark), served same-origin at /devtools/. Depends on devtools-core (+ react, react-dom).` Update the Current Status paragraph's "timeline-first" wording the same way. In `packages/devtools-app/README.md`, replace any lens description with two sentences on the tree + scope.

- [ ] **Step 4: Full gauntlet**

Run `/rtc:gauntlet full` (typecheck, unit, both ≥95% ui:contract gates, type-aware ESLint, lint-warnings ledger, build, post-build `/devtools/` check). Then both e2e devtools runs from Task 10 once more against the final tree. Expected: all green; no new entries in the lint-warnings ledger.

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md packages/devtools-app/README.md
git commit -m "docs(devtools): §20.12 store-first navigation; STATUS folds shipped polish items; CLAUDE.md package line"
```

Then ship per `shipping-repo-changes`: push, PR, CI loop, Rule 3 triage, `--merge`, confirm, clean up. Live-accept before merging: `pnpm dev:react:fs`, open `/devtools/`, and walk the spec's §3 mockup — select `priceStream`, expand it, pick one pair, pin a row, Diff, `wire ±100ms`, Esc twice, Clear, Unclear, `c`, scroll up and watch the ⤓ live chip.

---

## Self-review (run by the plan author before handoff)

**Spec coverage.** §3 layout/tree → Tasks 4, 5, 9. §3.2 Scope/parseStreamId/shortLabel → Task 1. §4.1 compile table → Task 1 + 2. §4.2 rows, per-row actions, wire probe, Esc one-deep history → Tasks 6, 5 (`pushScope`/`popScope`), 9. §4.3 context pane (State per scope, machine ≠ live, Diff unchanged, Machine tab, pin across scopes with "show in All") → Tasks 7, 8, 6. §5 Clear/Unclear/import → Tasks 2, 3, 6, 9 (`c`). §6.1 scroll-anchored follow → Task 6. §6.2 captured pin → Task 3 (+ bar copy in Task 6). §7 deletions → Tasks 6, 9. §8 tests → each task; e2e → Task 10. §9 docs/STATUS → Task 11. §3.1 Esc precedence → Task 9 `escapeTimeline`. §3.1 tree flash → Task 5.

**Type consistency.** `pin(row: LogRow)` everywhere (Tasks 3, 6, 8, 9). `TimelinePaneProps.searchInputRef` (Task 6) is what Task 9 passes. `ContextPaneProps` (Task 8) matches Task 9's call. `NavTreeProps.onSelect(scope)` (Task 5) matches Task 9's `selectScope`. `buildNavTree(state, visibleLog)` (Task 4) matches Task 9. `ScopeFilter.pills: readonly SourcePill[] | null` (Task 1) matches `TimelineFilter.pills` (Task 2). `wireHealthLine` output string format is the same in Tasks 4 and 5's fixtures.
