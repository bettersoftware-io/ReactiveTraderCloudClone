# One class per file + filename === class name — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one class per file and filename === class name across the repo, via ESLint core `max-classes-per-file` plus a new custom rule `rtc/class-filename-match`, and migrate the handful of violators.

**Architecture:** `max-classes-per-file: ["error", 1]` is added to the base ESLint block. A new custom rule `eslint-rules/class-filename-match.mjs` (reusing the RuleTester + root-vitest infra from newspaper-order) fires on every top-level `ClassDeclaration` and requires its name to equal the filename's first dot-segment. Both rules are wired into `eslint.config.mjs`; `newspaper-order` stays test-file-scoped while `class-filename-match` applies to all `.ts/.tsx`. Violators are then split / extracted / inline-disabled.

**Tech Stack:** ESLint 10.5 (flat config), `typescript-eslint` 8.61 parser, vitest 4 (RuleTester driver), Biome 2.5.

## Global Constraints

- **Named export only:** the rule module is `eslint-rules/class-filename-match.mjs` exporting `export const classFilenameMatch` (no default export; `.mjs` escapes the TS-only ESLint block + Biome `useExplicitType`).
- **`newspaper-order` must stay scoped to `**/*.{spec,test}.{ts,tsx}`** — do NOT broaden it (the `__contracts__` PortContract suites call `describe`/`it` at top level and would be wrongly reordered).
- **Rule B fires on every top-level class, exported or not.** Nested classes (inside functions / `it()` blocks) are ignored.
- **Biome zero-findings, no disables** except the four sanctioned migration `eslint-disable`s named in Task 6.
- **`*.testHelpers.ts` files are excluded from coverage** (Task 5).
- **CI-only gate:** always run `pnpm lint:eslint:types` locally — a new root-level `.ts` or a missed type error only shows there, not in `pnpm lint:eslint`.
- **Behaviour preserved:** every split/extract/move keeps `pnpm test` + `pnpm typecheck` green.
- The custom-rule RuleTester suite is auto-gated by the existing `test:rules` CI step (`eslint-rules/**/*.test.mjs`); no workflow change.

---

### Task 1: Custom rule `rtc/class-filename-match` + RuleTester matrix

**Files:**
- Create: `eslint-rules/class-filename-match.mjs`
- Create: `eslint-rules/class-filename-match.test.mjs`

**Interfaces:**
- Produces: `export const classFilenameMatch` — an ESLint rule object `{ meta, create }`, `meta.messages.mismatch`, NOT fixable. Imported by `eslint.config.mjs` in Task 2.

- [ ] **Step 1: Create the rule skeleton (no-op) so the test can import it**

`eslint-rules/class-filename-match.mjs`:
```js
function create() {
  return {};
}

export const classFilenameMatch = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A top-level class must live in a file whose name matches the class name.",
    },
    schema: [],
    messages: {
      mismatch:
        "Class '{{className}}' must match its filename — the file's name should start with '{{className}}', but it is '{{base}}'. Give the class its own file named '{{className}}.ts' (or '{{className}}.testHelpers.ts' for an extracted test double), or for a small/local double add `// eslint-disable-next-line rtc/class-filename-match -- <reason>`.",
    },
  },
  create,
};
```

- [ ] **Step 2: Write the failing test matrix**

`eslint-rules/class-filename-match.test.mjs`:
```js
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { classFilenameMatch } from "./class-filename-match.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2023,
    sourceType: "module",
  },
});

ruleTester.run("class-filename-match", classFilenameMatch, {
  valid: [
    {
      name: "exported class matches filename",
      filename: "AnalyticsPresenter.ts",
      code: "export class AnalyticsPresenter {}\n",
    },
    {
      name: "testHelpers sub-extension: first segment matches the class",
      filename: "MockWebSocket.testHelpers.ts",
      code: "export class MockWebSocket {}\n",
    },
    {
      name: "abstract class matches filename",
      filename: "MountedComponent.ts",
      code: "export abstract class MountedComponent {}\n",
    },
    {
      name: "non-exported class that matches is fine",
      filename: "MemoryStorage.ts",
      code: "class MemoryStorage {}\n",
    },
    {
      name: ".tsx file with a matching class",
      filename: "WsAdapter.tsx",
      code: "export class WsAdapter {}\n",
    },
    {
      name: "nested class is ignored (not top-level)",
      filename: "WsAdapter.test.ts",
      code: "it('x', () => {\n  class Local {}\n  return Local;\n});\n",
    },
    {
      name: "file with no class is never flagged",
      filename: "helpers.ts",
      code: "export function f(): number {\n  return 1;\n}\n",
    },
  ],
  invalid: [
    {
      name: "non-exported top-level double mismatches its test filename",
      filename: "WsAdapter.test.ts",
      code: "class MockWebSocket {}\n",
      errors: [
        {
          messageId: "mismatch",
          data: { className: "MockWebSocket", base: "WsAdapter" },
        },
      ],
    },
    {
      name: "exported class mismatches a plural module filename",
      filename: "MetricsPresenters.ts",
      code: "export class LatencyPresenter {}\n",
      errors: [
        {
          messageId: "mismatch",
          data: { className: "LatencyPresenter", base: "MetricsPresenters" },
        },
      ],
    },
    {
      name: "camelCase module name does not match its class",
      filename: "creditReferenceDataSimulator.ts",
      code: "export class InstrumentSimulator {}\n",
      errors: [
        {
          messageId: "mismatch",
          data: {
            className: "InstrumentSimulator",
            base: "creditReferenceDataSimulator",
          },
        },
      ],
    },
  ],
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `pnpm test:rules`
Expected: FAIL — the no-op rule reports nothing, so the invalid cases fail with "Should have 1 error but had 0".

- [ ] **Step 4: Implement the rule core**

Replace the `function create()` no-op in `eslint-rules/class-filename-match.mjs` with:
```js
function isTopLevel(node) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  if (parent.type === "Program") {
    return true;
  }
  return (
    (parent.type === "ExportNamedDeclaration" ||
      parent.type === "ExportDefaultDeclaration") &&
    parent.parent?.type === "Program"
  );
}

function baseSegment(filename) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.split(".")[0];
}

function create(context) {
  const filename = context.filename;
  return {
    ClassDeclaration(node) {
      if (!node.id || !isTopLevel(node)) {
        return;
      }
      const base = baseSegment(filename);
      const className = node.id.name;
      if (className !== base) {
        context.report({
          node: node.id,
          messageId: "mismatch",
          data: { className, base },
        });
      }
    },
  };
}
```
(Keep the existing `export const classFilenameMatch` block unchanged.)

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm test:rules`
Expected: PASS (all newspaper-order cases AND all class-filename-match cases — the runner picks up both `eslint-rules/*.test.mjs`).

- [ ] **Step 6: Confirm the rule file is Biome-clean**

Run: `pnpm exec biome check eslint-rules/class-filename-match.mjs eslint-rules/class-filename-match.test.mjs`
Expected: no errors. If only formatting differs, run with `--write` and re-check.

- [ ] **Step 7: Commit**

```bash
git add eslint-rules/class-filename-match.mjs eslint-rules/class-filename-match.test.mjs
git commit -m "feat(lint): add rtc/class-filename-match rule + RuleTester matrix"
```

---

### Task 2: Wire both rules into ESLint config

**Files:**
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: `classFilenameMatch` from Task 1; `newspaperOrder` (already imported).

- [ ] **Step 1: Import the new rule**

In `eslint.config.mjs`, after the existing
`import { newspaperOrder } from "./eslint-rules/newspaper-order.mjs";` line, add:
```js
import { classFilenameMatch } from "./eslint-rules/class-filename-match.mjs";
```
(Biome `organizeImports` may insert a blank line between the npm-import group and the local-rule group — accept that with `--write` in Step 5; it is formatting-only.)

- [ ] **Step 2: Define a shared `rtc` plugin object**

Immediately before `export default tseslint.config(`, add:
```js
// Both custom rules ship under the `rtc` plugin namespace. A single shared
// plugin object lets two config blocks reference it (newspaper-order stays
// test-file-scoped; class-filename-match applies to all ts/tsx) without
// "Cannot redefine plugin" — flat config accepts the same object reference in
// multiple blocks.
const rtcPlugin = {
  rules: {
    "newspaper-order": newspaperOrder,
    "class-filename-match": classFilenameMatch,
  },
};
```

- [ ] **Step 3: Add `max-classes-per-file` to the base block**

In the block `files: ["**/*.{ts,tsx}"]` (the one with `func-style`, `padding-line-between-statements`, `no-restricted-syntax`), add to its `rules` object:
```js
      "max-classes-per-file": ["error", 1],
```

- [ ] **Step 4: Point the newspaper block at the shared plugin and add the class-filename block**

Find the existing newspaper-order block:
```js
  {
    files: ["**/*.{spec,test}.{ts,tsx}"],
    plugins: { rtc: { rules: { "newspaper-order": newspaperOrder } } },
    rules: { "rtc/newspaper-order": "error" },
  },
```
Replace its `plugins` value with the shared object, and add a new block right after it:
```js
  {
    files: ["**/*.{spec,test}.{ts,tsx}"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/newspaper-order": "error" },
  },
  {
    // One class per file: a top-level class must live in a file named after it
    // (filename's first dot-segment === class name). Applies to ALL ts/tsx;
    // fires only when a top-level class exists, so non-class modules are
    // untouched. Sanctioned exceptions use a per-line eslint-disable.
    files: ["**/*.{ts,tsx}"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/class-filename-match": "error" },
  },
```

- [ ] **Step 5: Biome-format the config**

Run: `pnpm exec biome check --write eslint.config.mjs`
Expected: clean after write (import-group blank line normalised).

- [ ] **Step 6: Verify the rules now flag exactly the known violators**

Run: `pnpm exec eslint packages/domain/src/simulators/creditReferenceDataSimulator.ts packages/client-react/src/app/presenters/MetricsPresenters.ts 2>&1 | tail -20`
Expected: errors reported — `max-classes-per-file` on both files, and `rtc/class-filename-match` on `InstrumentSimulator`/`DealerSimulator` and `ThroughputMetricPresenter`/`LatencyPresenter`/`ErrorRatePresenter`. (A non-zero exit here is EXPECTED — the migration in Tasks 3-6 clears these.) Confirm there is NO "Cannot redefine plugin" config error.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs
git commit -m "feat(lint): enable max-classes-per-file + rtc/class-filename-match"
```

---

### Task 3: Split `creditReferenceDataSimulator.ts` (production)

**Files:**
- Create: `packages/domain/src/simulators/InstrumentSimulator.ts`
- Create: `packages/domain/src/simulators/DealerSimulator.ts`
- Delete: `packages/domain/src/simulators/creditReferenceDataSimulator.ts`
- Create: `packages/domain/src/simulators/InstrumentSimulator.test.ts`
- Create: `packages/domain/src/simulators/DealerSimulator.test.ts`
- Delete: `packages/domain/src/simulators/creditReferenceDataSimulator.test.ts`
- Modify: `packages/domain/src/simulators/index.ts`
- Modify: `packages/domain/src/simulators/InstrumentSimulator.contract.test.ts`
- Modify: `packages/domain/src/simulators/DealerSimulator.contract.test.ts`
- Modify: `packages/domain/src/simulators/CreditRfqSimulator.test.ts`
- Modify: `packages/domain/src/simulators/CreditRfqSimulator.contract.test.ts`

**Context:** `creditReferenceDataSimulator.ts` exports `INSTRUMENTS_CATALOG` + `InstrumentSimulator` and `DEALERS_CATALOG` + `DealerSimulator`. The domain barrel (`packages/domain/src/index.ts`) re-exports these via `./simulators/index.js`, so `index.ts` needs NO change. `portFactory.ts` and `serviceContainer.ts` import `DEALERS_CATALOG` from the `@rtc/domain` barrel — also NO change.

- [ ] **Step 1: Create `InstrumentSimulator.ts`**

Move `INSTRUMENTS_CATALOG` (the const) and `class InstrumentSimulator` from `creditReferenceDataSimulator.ts` into a new `InstrumentSimulator.ts` with only the imports it needs:
```ts
import { type Observable, of } from "rxjs";

import type { Instrument } from "../credit/instrument.js";
import type { InstrumentPort } from "../ports/instrumentPort.js";
```
followed by the verbatim `export const INSTRUMENTS_CATALOG: readonly Instrument[] = [ ... ];` block and the verbatim `export class InstrumentSimulator implements InstrumentPort { ... }` class.

- [ ] **Step 2: Create `DealerSimulator.ts`**

Move `DEALERS_CATALOG` and `class DealerSimulator` into a new `DealerSimulator.ts`:
```ts
import { type Observable, of } from "rxjs";

import type { Dealer } from "../credit/dealer.js";
import type { DealerPort } from "../ports/dealerPort.js";
```
followed by the verbatim `export const DEALERS_CATALOG: readonly Dealer[] = [ ... ];` and `export class DealerSimulator implements DealerPort { ... }`.

- [ ] **Step 3: Delete the old source file**

```bash
git rm packages/domain/src/simulators/creditReferenceDataSimulator.ts
```

- [ ] **Step 4: Update the simulators barrel**

In `packages/domain/src/simulators/index.ts`, replace the single re-export block:
```ts
export {
  DEALERS_CATALOG,
  DealerSimulator,
  INSTRUMENTS_CATALOG,
  InstrumentSimulator,
} from "./creditReferenceDataSimulator.js";
```
with two:
```ts
export { DEALERS_CATALOG, DealerSimulator } from "./DealerSimulator.js";
export {
  INSTRUMENTS_CATALOG,
  InstrumentSimulator,
} from "./InstrumentSimulator.js";
```
(Biome will sort/format; run `biome check --write` in Step 8 if needed.)

- [ ] **Step 5: Repoint the direct importers**

- `InstrumentSimulator.contract.test.ts:4` — change `from "./creditReferenceDataSimulator.js"` to `from "./InstrumentSimulator.js"`.
- `DealerSimulator.contract.test.ts:4` — change to `from "./DealerSimulator.js"`.
- `CreditRfqSimulator.test.ts:9` — `import { DEALERS_CATALOG } from "./creditReferenceDataSimulator.js";` → `from "./DealerSimulator.js";`.
- `CreditRfqSimulator.contract.test.ts:9` — same change to `from "./DealerSimulator.js";`.

- [ ] **Step 6: Split the unit test along its two describe blocks**

`creditReferenceDataSimulator.test.ts` has `describe("InstrumentSimulator", …)` and `describe("DealerSimulator", …)`. Create:

`InstrumentSimulator.test.ts` — shared imports plus the InstrumentSimulator describe:
```ts
import { firstValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { INSTRUMENTS_CATALOG, InstrumentSimulator } from "./InstrumentSimulator.js";
```
followed by the verbatim `describe("InstrumentSimulator", () => { ... });` block.

`DealerSimulator.test.ts`:
```ts
import { firstValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { DEALERS_CATALOG, DealerSimulator } from "./DealerSimulator.js";
```
followed by the verbatim `describe("DealerSimulator", () => { ... });` block.

Then delete the original:
```bash
git rm packages/domain/src/simulators/creditReferenceDataSimulator.test.ts
```

- [ ] **Step 7: Verify behaviour + rule clearance for these files**

Run: `pnpm --filter @rtc/domain test`
Expected: green (instrument + dealer suites pass under their new names).
Run: `pnpm --filter @rtc/domain typecheck`
Expected: green.
Run: `pnpm exec eslint packages/domain/src/simulators/InstrumentSimulator.ts packages/domain/src/simulators/DealerSimulator.ts`
Expected: 0 errors (each file = one class, filename matches).

- [ ] **Step 8: Biome + commit**

Run: `pnpm exec biome check --write packages/domain/src/simulators/`
```bash
git add -A packages/domain/src/simulators/
git commit -m "refactor(domain): split creditReferenceDataSimulator into Instrument/Dealer files"
```

---

### Task 4: Split `MetricsPresenters.ts` (production)

**Files:**
- Create: `packages/client-react/src/app/presenters/windowedSamples.ts`
- Create: `packages/client-react/src/app/presenters/ThroughputMetricPresenter.ts`
- Create: `packages/client-react/src/app/presenters/LatencyPresenter.ts`
- Create: `packages/client-react/src/app/presenters/ErrorRatePresenter.ts`
- Delete: `packages/client-react/src/app/presenters/MetricsPresenters.ts`
- Modify: `packages/client-react/src/app/composition.ts`
- Modify: `packages/client-react/src/app/presenters/__tests__/MetricsPresenters.test.ts`

**Context:** the three presenters share `WINDOW` (a const) and `windowedSamples()` (a helper). Extract those into a `windowedSamples.ts` module (no class → Rule B does not fire) so the three presenter files stay DRY.

- [ ] **Step 1: Create the shared helper `windowedSamples.ts`**

```ts
import { type Observable, shareReplay } from "rxjs";
import { scan, startWith } from "rxjs/operators";

import type { MetricSample } from "@rtc/domain";

/** Rolling window size — number of MetricSamples retained per chart series. */
export const WINDOW = 60;

export function windowedSamples(
  source$: Observable<MetricSample>,
): Observable<readonly MetricSample[]> {
  return source$.pipe(
    scan(
      (acc, s) => {
        return [...acc, s].slice(-WINDOW) as readonly MetricSample[];
      },
      [] as readonly MetricSample[],
    ),
    startWith([] as readonly MetricSample[]),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}
```

- [ ] **Step 2: Create the three presenter files**

`ThroughputMetricPresenter.ts`:
```ts
import type { Observable } from "rxjs";

import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/**
 * Throughput chart series — rolls the last WINDOW samples from
 * TelemetryPort.throughput$() in oldest-first order.
 */
export class ThroughputMetricPresenter {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.throughput$());
  }
}
```
`LatencyPresenter.ts` — identical shape, JSDoc says "Latency chart series … TelemetryPort.latency$()", class `LatencyPresenter`, body `windowedSamples(port.latency$())`.
`ErrorRatePresenter.ts` — identical shape, JSDoc "Error-rate chart series … TelemetryPort.errorRate$()", class `ErrorRatePresenter`, body `windowedSamples(port.errorRate$())`.

- [ ] **Step 3: Delete the old file**

```bash
git rm packages/client-react/src/app/presenters/MetricsPresenters.ts
```

- [ ] **Step 4: Update `composition.ts`**

Replace the import block (the `import { ErrorRatePresenter, LatencyPresenter, ThroughputMetricPresenter } from "./presenters/MetricsPresenters";`) with three single-name imports:
```ts
import { ErrorRatePresenter } from "./presenters/ErrorRatePresenter";
import { LatencyPresenter } from "./presenters/LatencyPresenter";
import { ThroughputMetricPresenter } from "./presenters/ThroughputMetricPresenter";
```
(No other change — the `new ThroughputMetricPresenter(...)` / type-annotation usages keep working. Biome will sort the import block.)

- [ ] **Step 5: Update the test imports**

In `packages/client-react/src/app/presenters/__tests__/MetricsPresenters.test.ts`, replace:
```ts
import {
  ErrorRatePresenter,
  LatencyPresenter,
  ThroughputMetricPresenter,
  WINDOW,
} from "../MetricsPresenters";
```
with:
```ts
import { ErrorRatePresenter } from "../ErrorRatePresenter";
import { LatencyPresenter } from "../LatencyPresenter";
import { ThroughputMetricPresenter } from "../ThroughputMetricPresenter";
import { WINDOW } from "../windowedSamples";
```
(The test has no top-level class, so it needs no rename — keep `MetricsPresenters.test.ts`.)

- [ ] **Step 6: Verify behaviour + rule clearance**

Run: `pnpm --filter @rtc/client-react test:app`
Expected: green (the MetricsPresenters suite passes against the split files).
Run: `pnpm --filter @rtc/client-react typecheck`
Expected: green.
Run: `pnpm exec eslint packages/client-react/src/app/presenters/ThroughputMetricPresenter.ts packages/client-react/src/app/presenters/LatencyPresenter.ts packages/client-react/src/app/presenters/ErrorRatePresenter.ts packages/client-react/src/app/presenters/windowedSamples.ts`
Expected: 0 errors.

- [ ] **Step 7: Biome + commit**

Run: `pnpm exec biome check --write packages/client-react/src/app/`
```bash
git add -A packages/client-react/src/app/
git commit -m "refactor(client): split MetricsPresenters into per-presenter files + windowedSamples helper"
```

---

### Task 5: Extract `MountedComponent`, `MockWebSocket`, `FakeWs` + coverage excludes

**Files:**
- Create: `packages/client-react/tests/ui/contract/shared/harness/MountedComponent.ts`
- Modify: `packages/client-react/tests/ui/contract/shared/harness/component.ts`
- Create: `packages/client-react/src/app/adapters/MockWebSocket.testHelpers.ts`
- Modify: `packages/client-react/src/app/adapters/WsAdapter.test.ts`
- Create: `packages/server/src/ws/FakeWs.testHelpers.ts`
- Modify: `packages/server/src/ws/wsHandler.test.ts`
- Modify: `packages/server/vitest.config.ts`
- Modify: `packages/client-react/vitest.app.coverage.config.ts`

**Context:** three extractions, each "move a class to its own correctly-named file." `MountedComponent` is harness infra (plain `.ts`); the two doubles use the `*.testHelpers.ts` convention.

- [ ] **Step 1: Extract `MountedComponent` (with `PageContext`)**

In `component.ts`, the declarations are: imports → `export interface PageContext<P>` → `export abstract class MountedComponent<P>` → `export interface ComponentToken<…>` → `export function component<…>`. `MountedComponent` depends on `PageContext` and the imports; `ComponentToken`/`component` depend on `MountedComponent`. To avoid an import cycle, move `PageContext` AND `MountedComponent` together.

Create `MountedComponent.ts` containing: the imports those two declarations need (copy the `import type { … } from "@rtc/domain";`, the three `import type … from "#/app/presenters/…"`, and `import type { CommandLog, HookValues, MetricsView } from "./world";` lines — keep only the names actually referenced by `PageContext`/`MountedComponent`), then the verbatim `export interface PageContext<P> { … }` and `export abstract class MountedComponent<P> { … }`.

- [ ] **Step 2: Rewire `component.ts`**

In `component.ts`: delete the moved `PageContext` interface and `MountedComponent` class. At the top of the declarations (after the existing imports), add:
```ts
import { MountedComponent, type PageContext } from "./MountedComponent.js";
```
and re-export so the 69 existing importers of `…/harness/component` keep working:
```ts
export { MountedComponent, type PageContext };
```
Keep `ComponentToken` and the `component()` factory as-is (they reference `MountedComponent`, now imported). Remove any now-unused imports from `component.ts` (whatever only `PageContext`/`MountedComponent` used) — `pnpm typecheck` and `biome check` will flag leftovers.

- [ ] **Step 2b: Verify `component.ts` declares no class now**

Run: `pnpm exec eslint packages/client-react/tests/ui/contract/shared/harness/component.ts packages/client-react/tests/ui/contract/shared/harness/MountedComponent.ts`
Expected: 0 errors (`component.ts` has no top-level class; `MountedComponent.ts` matches its filename).

- [ ] **Step 3: Extract `MockWebSocket` (live-binding `lastMock`)**

Create `packages/client-react/src/app/adapters/MockWebSocket.testHelpers.ts`:
```ts
import { vi } from "vitest";

export let lastMock: MockWebSocket;

export class MockWebSocket {
  static OPEN = 1;

  static constructed = 0;

  readyState = 0;

  onopen: ((ev: Event) => void) | null = null;

  onclose: ((ev: CloseEvent) => void) | null = null;

  onmessage: ((ev: MessageEvent) => void) | null = null;

  onerror: ((ev: Event) => void) | null = null;

  send = vi.fn();

  close = vi.fn();

  constructor() {
    MockWebSocket.constructed++;
    lastMock = this;
  }
}
```
(`export let lastMock` reassigned in the constructor is an ESM live binding — verified lint-clean in both ESLint and Biome.)

In `WsAdapter.test.ts`: delete the `let lastMock: MockWebSocket;` line and the entire `class MockWebSocket { … }` block, and add to the imports:
```ts
import { lastMock, MockWebSocket } from "./MockWebSocket.testHelpers";
```
All existing `lastMock` and `MockWebSocket` references in the test body stay unchanged (live binding).

- [ ] **Step 4: Extract `FakeWs`**

Create `packages/server/src/ws/FakeWs.testHelpers.ts`:
```ts
import { EventEmitter } from "node:events";

import { type WsMessage } from "./protocol.js";
```
followed by the verbatim `/** Minimal stand-in … */ class FakeWs extends EventEmitter { … }` block, changed to `export class FakeWs extends EventEmitter`.

In `wsHandler.test.ts`: delete the `class FakeWs … { }` block (and its `// ── Fake ws socket ──` banner comment if it now reads oddly), and add to the imports:
```ts
import { FakeWs } from "./FakeWs.testHelpers";
```
`WsMessage` is already imported in the test from `./protocol.js`; leave that import as-is (the test still uses it elsewhere — `biome check` / knip will flag if it becomes unused).

- [ ] **Step 5: Exclude `*.testHelpers.ts` from coverage**

In `packages/server/vitest.config.ts`, add to the `coverage.exclude` array:
```ts
        "**/*.testHelpers.ts", // extracted test doubles, not production source
```
In `packages/client-react/vitest.app.coverage.config.ts`, add to its `coverage.exclude` array the same entry:
```ts
          "**/*.testHelpers.ts", // extracted test doubles, not production source
```
(`packages/domain/vitest.config.ts` gets no `.testHelpers.ts` file in this migration, so leave it unchanged.)

- [ ] **Step 6: Verify behaviour + rule clearance**

Run: `pnpm --filter @rtc/client-react test:app` → green (WsAdapter suite passes against the extracted mock).
Run: `pnpm --filter @rtc/server test` → green (wsHandler suite passes against the extracted FakeWs).
Run: `pnpm --filter @rtc/client-react test:ui:contract` → green (Page objects still resolve `MountedComponent` via the re-export).
Run: `pnpm typecheck` → green.
Run: `pnpm exec eslint packages/client-react/src/app/adapters/MockWebSocket.testHelpers.ts packages/server/src/ws/FakeWs.testHelpers.ts` → 0 errors.

- [ ] **Step 7: Biome + commit**

Run: `pnpm exec biome check --write packages/`
```bash
git add -A
git commit -m "refactor(test): extract MountedComponent + MockWebSocket/FakeWs test doubles to own files"
```

---

### Task 6: Inline disables + final green verification

**Files:**
- Modify: `packages/client-react/tests/setup/jsdom-storage.ts`
- Modify: `packages/client-react/src/ui/fx/blotter/csvExport.test.ts`
- Modify: `packages/domain/src/simulators/AnalyticsSimulator.minimalHistory.contract.test.ts`
- Modify: `packages/client-react/tests/ui/contract/specs/credit/blotter/CreditBlotter.contract.spec.ts`

- [ ] **Step 1: Disable Rule B on the small / internal top-level doubles**

Directly above the `class MemoryStorage implements Storage {` line in `jsdom-storage.ts`, add:
```ts
// eslint-disable-next-line rtc/class-filename-match -- internal shim class in a purpose-named vitest setup module (registered by path in setupFiles)
```
Directly above the top-level `class RecordingBlob extends RealBlob {` in `csvExport.test.ts`, add:
```ts
// eslint-disable-next-line rtc/class-filename-match -- small local Blob test double; file is named after the system under test
```
Directly above `class SingleEntryAnalyticsStub implements AnalyticsPort {` in `AnalyticsSimulator.minimalHistory.contract.test.ts`, add:
```ts
// eslint-disable-next-line rtc/class-filename-match -- small local AnalyticsPort stub; file is named after the system under test
```

- [ ] **Step 2: Disable `max-classes-per-file` on the two-double contract spec**

`CreditBlotter.contract.spec.ts` declares two local `RecordingBlob` classes in separate `it()` blocks. Add a file-level disable as the FIRST line of the file:
```ts
/* eslint-disable max-classes-per-file -- two local RecordingBlob doubles in separate it() blocks */
```
(The nested classes do not trip `rtc/class-filename-match`, so only `max-classes-per-file` needs disabling.)

- [ ] **Step 3: Full lint is now green**

Run: `pnpm lint:eslint`
Expected: 0 errors (every violator split / extracted / disabled; no unused-disable warnings — each disable is now load-bearing).
Run: `pnpm lint:eslint:types`
Expected: 0 errors (CI-only gate; the new `.testHelpers.ts` files are under `src/**`/`tests/**`, already covered by `tsconfig.eslint.json`).
Run: `pnpm exec biome ci .`
Expected: 0 errors.

- [ ] **Step 4: Full behaviour + dead-code green**

Run: `pnpm test`
Expected: all packages green.
Run: `pnpm typecheck`
Expected: green.
Run: `pnpm lint:dead`
Expected: green (the re-export in `component.ts`, the new files, and the `windowedSamples` helper are all reachable).
Run: `pnpm test:rules`
Expected: green (both RuleTester suites).

- [ ] **Step 5: Confirm no class-rule violations remain (regression probe)**

Run:
```bash
rg -n --no-heading -g '!**/dist/**' -g '*.ts' -g '*.tsx' '^(export )?(default )?(abstract )?class ' packages | wc -l
pnpm exec eslint . 2>&1 | rg -c "rtc/class-filename-match|max-classes-per-file" || echo "0 rule violations remaining"
```
Expected: `0 rule violations remaining`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(test): inline-disable sanctioned class exceptions; lint green"
```

---

## Self-Review

**Spec coverage:**
- Rule A `max-classes-per-file: 1` → Task 2 Step 3. ✅
- Rule B custom `rtc/class-filename-match`, top-level only, exported-or-not, nested ignored, `.testHelpers` accepted, not fixable → Task 1 (rule + matrix incl. non-exported & nested cases). ✅
- Both repo-wide; newspaper-order stays test-scoped → Task 2 Step 4 (separate blocks). ✅
- `*.testHelpers.ts` convention + coverage exclude → Task 5 Steps 3-5. ✅
- Split `creditReferenceDataSimulator` (2) → Task 3; split `MetricsPresenters` (3, found post-Phase-5 merge) → Task 4. ✅
- Extract `MountedComponent`/`MockWebSocket`/`FakeWs` → Task 5. ✅
- Inline-disable `MemoryStorage`/`RecordingBlob`(csvExport)/`SingleEntryAnalyticsStub` (Rule B) + `CreditBlotter` (max-classes) → Task 6. ✅
- Testing: RuleTester + full suite/typecheck/lint/dead green; `test:rules` CI gate (no workflow change) → Tasks 1, 6. ✅

**Placeholder scan:** none — every step has exact paths, code, commands, expected output. Moves of large verbatim blocks (catalogs, the 91-line `MountedComponent`) are described precisely with exact import headers; the body is relocated unchanged, and `typecheck`/`biome` guard against a missed dependency.

**Type/name consistency:** `classFilenameMatch` (export), `messageId: "mismatch"`, `data.{className,base}`, `rtc/class-filename-match` (rule id), `rtcPlugin` (shared object), `windowedSamples`/`WINDOW`, `lastMock`/`MockWebSocket.testHelpers`, `FakeWs.testHelpers` — used identically across tasks. ✅
