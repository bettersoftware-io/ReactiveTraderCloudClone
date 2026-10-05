# Language-Neutral Core Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the FX slice's 13 core-contract suites (66 cases) into JSON scenarios that all three TypeScript cores replay from disk, with a generated Gherkin rendering, so a core in another language can later be witnessed by the same files.

**Architecture:** Scenarios are authored with a typed recording builder in `@rtc/core-contract` and emitted to committed JSON plus `.feature` files under `packages/core-contract/scenarios/`. A scenario suite reads the JSON, validates it against a JSON Schema, and interprets it against the existing `CoreHarness`; `CONTRACT_SUITES` points converted members at it, so the three core runner files do not change. A drift test keeps the committed files equal to what the authored source emits.

**Tech Stack:** TypeScript, vitest 5 (fake timers), `ajv` 8 (JSON Schema draft-07), RxJS types from `@rtc/core-api`, the existing `scripts/mutation-check.mts`.

**Spec:** [docs/superpowers/specs/2026-10-05-language-neutral-core-contract-design.md](../specs/2026-10-05-language-neutral-core-contract-design.md)

## Global Constraints

- **Runners read the JSON from disk.** The scenario suite never imports the authored TypeScript.
- **Steps between two waits run in one turn.** The interpreter awaits only at `settle` and `advance`.
- **Comparison happens in JSON space**, after canonical encoding (set → array, map → pairs, error → `{"$error": message}`, undefined property → omitted).
- **A path or pick that resolves to nothing fails.** It never compares "missing" with "missing".
- **The vocabulary grows only on evidence.** A step kind or matcher is added only when a named case needs it.
- **The three core runner files do not change**, and a scenario keeps the timers its case ran on: fake-timer cases declare `time: "virtual"`, the rest keep the real `settle()`.
- **A converted member's imperative suite is deleted in the same change** that lands its scenarios.
- **The Gherkin rendering is never parsed or executed.** A verb, target, stream or seed key with no phrase fails emission.
- `@rtc/core-contract` depends on `@rtc/core-api`, `@rtc/domain`, `rxjs` and (new) `ajv`. It never imports a core.
- **Stop rule:** more than 6 TypeScript-only cases stops the work. The classification below found 2.
- Repo rules that bind every file: one import statement per module, `#/` alias imports, block bodies with explicit `return` in arrow functions, braces on every control statement, exported functions above their helpers (`rtc/newspaper-order`), functions named for their effect, `create*` for fixture factories in tests. Run `pnpm exec eslint <files>` and `pnpm exec biome ci <files>` on the final tree of every task and fix what they report.
- **Never run two builds in one checkout at once.**
- Outward steps (push, PR, merge) run only in the two closing batches, each as its own Bash call.

## Review Focus

1. **A runner that yields between steps weakens the "synchronous replay" cases.** An interpreter that awaited between `subscribe` and `expect` would let a core that replays late pass. Pinned in Task 5 ("an expectation right after subscribe sees only what arrived synchronously").
2. **A truncated or emptied JSON file must fail, not pass with zero cases.** Pinned in Task 6 (the count pin) and Task 8 (the drift test's "missing file" and "unexpected file" cases).
3. **A typo in a pick path must fail.** Pinned in Task 2 ("a missing property fails").
4. **A hand-edited JSON file with an unknown step or key must be rejected.** Pinned in Task 3 (schema negatives).
5. **A value JSON cannot carry (NaN, a function, a class instance) must fail at emission**, not silently become `null` or `{}`. Pinned in Task 1.

---

## Classification of the 66 cases (done 2026-10-05, while planning)

Every case was read against the spec's step table. Result: **68 scenarios, 2 TypeScript-only residue cases.**

**Vocabulary the cases need beyond the spec's first table** (the spec is amended in the same commit as this plan):

| Addition | Named case that needs it |
|---|---|
| `lookup` step: name a stream without subscribing | `presenters.execution` "execute() is lazy — the port sees a request only once the result is subscribed" |
| `pattern` matcher (regular expression on a string) | `presenters.blotter` "activity$ … with a clock stamp" (`/^\d{2}:\d{2}:\d{2}$/`) |
| `time: "virtual"` is declared by the author | `presenters.priceStream` "while not calm, every tick passes through at once" runs on fake timers without `advance` or `now` |

**Cases that become two scenarios** (each builds two harnesses; a scenario has one):

| Case | Scenarios |
|---|---|
| `auth` "lock is ignored while signed out, and locks a signed-in session" | "lock is ignored while signed out" · "lock locks a signed-in session" |
| `auth` "unlock with nobody signed in — from the start, or after logout — makes no login call" | "unlock with nobody signed in from the start makes no login call" · "unlock after logout makes no login call" |

**TypeScript-only residue** (the rest of each case is a scenario):

| Case | What stays in vitest | Why |
|---|---|---|
| `currencyPairs` "delivers the roster itself" | `expect(c.values[0]).toBe(roster)` | Reference identity between an emitted value and a port argument has no meaning in JSON space. The scenario asserts deep equality. |
| `transportGate` "with no stored session…" | `h.app.ports.transport?.connect()` lands in the scripted log | It asserts the shape of the TypeScript `App` object (`app.ports`), not behaviour a subscriber observes. |

**Per-member notes** (how specific statements translate):

| Member | Scenarios | Notes |
|---|---|---|
| `presenters.priceStream` | 10 | Pilot. Virtual time ×3, turn counts ×2 (`markTurns` for the later burst), `identical` ×2. Touches `presenters.powerSaver`. |
| `presenters.priceHistory` | 5 | `c.values.map(mids)` is `at("[*][*].mid")`. The 50-tick loop is a TypeScript loop that records 50 `drive` steps. `mids(last)[0]` is `at("[-1][0].mid")`. |
| `presenters.currencyPairs` | 2 | One residue (above). |
| `presenters.connection` | 5 | `failConnection(new Error("gateway"))` carries `{"$error": "gateway"}`. |
| `commands.reconnect` | 1 | Subscribes to `driver.connectionEvents$`. |
| `presenters.execution` | 5 | `lookup` for the lazy case; `s.read.pendingExecutions().at("[0].spotRate")`. |
| `presenters.blotter` | 5 | Sets encode as arrays: `newTradeIds$` values compare as `[[]]`, then `at("[-1]")` equals `[2]`. `ids(...)` is `at("[-1][*].trade.tradeId")`. `pattern` for the clock stamp. |
| `machines.staleFlag` | 3 | A second `subscribe` after `dispose`. |
| `machines.notional` | 4 | Two machines in one scenario (`m1`, `m2`). |
| `machines.rowHighlight` | 3 | Virtual time; `advance` notes name `BLOTTER_ROW_HIGHLIGHT_MS`. |
| `machines.tileExecution` | 7 | Virtual time; `statuses(c.values)` is `at("[*].status")`; the `expect.fail` narrowing becomes two expectations on `[-1].status` and `[-1].executionStatus`. |
| `presenters.auth` | 14 | Every scenario is `given({ time: "virtual", now: NOW, … })`. `storedSession()?.token` is `s.read.storedSession().at(".token")`. Touches `presenters.loginWaitPreferences`. |
| `transportGate` | 4 | Seeds `{ transport: true, session }`. One residue (above). Not a `CONTRACT_SUITES` member: wired in `index.ts`. |

---

## File Structure

```
packages/core-contract/
  scenarios/                         generated + committed (JSON, .feature), plus two hand-written files
    scenario.schema.json             hand-written: the format's JSON Schema
    README.md                        hand-written: the format reference for runner authors
    presenters.priceStream.json      generated
    presenters.priceStream.feature   generated
  mutants/
    presenters.priceStream.json      mutant spec for scripts/mutation-check.mts
  src/scenario/
    format.ts        the JSON's TypeScript types
    encode.ts        canonical encoding / argument decoding
    path.ts          path + pick projection
    parse.ts         read + schema-validate a scenario file
    builder.ts       the typed recording builder
    interpret.ts     run one scenario against a CoreHarness
    suite.ts         scenarioSuite(member) + SCENARIO_COUNTS
    phrases.ts       the phrase table for the Gherkin rendering
    render.ts        scenario file → Gherkin text
    emit.ts          authored scenarios → file name → content
    write.ts         writes the emitted files (run from dist)
    *.test.ts        one per unit, plus drift.test.ts
  src/scenarios/
    index.ts         SCENARIO_FILES: every authored scenario file
    priceStream.ts   authored scenarios for presenters.priceStream
```

The work ships as two PRs. **PR A** (Tasks 1–9): machinery, pilot, format reference, plus this plan and the spec. **PR B** (Tasks 10–13): the other 12 members and the architecture docs, on a fresh worktree after PR A merges.

All commands run from the worktree root: `/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/native-core-contract`. It is already installed and built.

---

# PR A — machinery and pilot

### Task 1: Format types and canonical encoding

**Files:**
- Create: `packages/core-contract/src/scenario/format.ts`
- Create: `packages/core-contract/src/scenario/encode.ts`
- Test: `packages/core-contract/src/scenario/encode.test.ts`

**Interfaces:**
- Produces: `Json`, `StreamRef`, `Read`, `Matcher`, `Step`, `ExpectStep`, `Scenario`, `ScenarioFile`, `FORMAT_VERSION` from `format.ts`; `encodeValue(value: unknown): Json`, `decodeArgument(value: Json): unknown`, `describeError(error: unknown): Json` from `encode.ts`.

- [ ] **Step 1: Write `format.ts`**

```ts
/** The scenario file format, version 1 — what `scenarios/*.json` holds. The
 * normative definition is `scenarios/scenario.schema.json`; these types are
 * its TypeScript mirror, used by the builder (to emit) and the interpreter
 * (to replay). */
export const FORMAT_VERSION = 1;

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

/** A stream named inline by its dotted path, or one an earlier `lookup`
 * step remembered under an alias. */
export type StreamRef =
  | { readonly stream: string; readonly args?: readonly Json[] }
  | { readonly ref: string };

export type Read =
  | {
      readonly collector: string;
      readonly field: "values" | "errors" | "turns";
    }
  | { readonly driver: string; readonly args: readonly Json[] }
  | { readonly identical: readonly [StreamRef, StreamRef] };

export type Matcher =
  | { readonly equals: Json }
  | { readonly matches: Json }
  | { readonly length: number }
  | { readonly pattern: string };

export type ExpectStep = {
  readonly step: "expect";
  readonly read: Read;
  readonly path?: string;
  readonly pick?: readonly string[];
  readonly note?: string;
} & Matcher;

export type Step =
  | {
      readonly step: "drive";
      readonly verb: string;
      readonly args: readonly Json[];
    }
  | {
      readonly step: "call";
      readonly target: string;
      readonly args: readonly Json[];
    }
  | {
      readonly step: "machine";
      readonly as: string;
      readonly factory: string;
      readonly args: readonly Json[];
    }
  | { readonly step: "dispose"; readonly of: string }
  | {
      readonly step: "lookup";
      readonly as: string;
      readonly stream: string;
      readonly args?: readonly Json[];
    }
  | {
      readonly step: "subscribe";
      readonly as: string;
      readonly from: StreamRef;
      readonly countTurns?: true;
    }
  | { readonly step: "unsubscribe"; readonly of: string }
  | { readonly step: "settle" }
  | { readonly step: "advance"; readonly ms: number; readonly note?: string }
  | { readonly step: "markTurns"; readonly of: string }
  | ExpectStep;

export interface Scenario {
  readonly name: string;
  readonly touches: readonly string[];
  readonly time?: "virtual";
  readonly now?: number;
  readonly seed?: Json;
  readonly steps: readonly Step[];
}

export interface ScenarioFile {
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly member: string;
  readonly scenarios: readonly Scenario[];
}
```

- [ ] **Step 2: Write the failing test `encode.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { decodeArgument, describeError, encodeValue } from "#/scenario/encode";

describe("encodeValue", () => {
  it("passes JSON values through and omits undefined properties", () => {
    expect(encodeValue({ a: 1, b: undefined, c: [true, null, "x"] })).toEqual({
      a: 1,
      c: [true, null, "x"],
    });
    expect(Object.keys(encodeValue({ a: 1, b: undefined }) as object)).toEqual([
      "a",
    ]);
  });

  it("encodes a set as an array and a map as pairs, in iteration order", () => {
    expect(encodeValue(new Set([3, 1, 2]))).toEqual([3, 1, 2]);
    expect(
      encodeValue(
        new Map([
          ["b", 1],
          ["a", 2],
        ]),
      ),
    ).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("encodes an error as its message, and an undefined array slot as null", () => {
    expect(encodeValue(new Error("feed"))).toEqual({ $error: "feed" });
    expect(encodeValue([undefined])).toEqual([null]);
    expect(encodeValue(undefined)).toBeNull();
  });

  it("refuses what JSON cannot carry, naming where it found it", () => {
    expect(() => {
      return encodeValue({ price: { mid: Number.NaN } });
    }).toThrow("$.price.mid: cannot encode NaN");
    expect(() => {
      return encodeValue([() => {}]);
    }).toThrow("$[0]: cannot encode a function");
    expect(() => {
      return encodeValue({ at: new Date(0) });
    }).toThrow("$.at: cannot encode a Date instance");
  });
});

describe("decodeArgument", () => {
  it("turns an encoded error back into an Error, at any depth", () => {
    const decoded = decodeArgument({ cause: { $error: "bust" } }) as {
      cause: Error;
    };
    expect(decoded.cause).toBeInstanceOf(Error);
    expect(decoded.cause.message).toBe("bust");
  });

  it("leaves every other value as it is", () => {
    expect(decodeArgument([1, { a: "x" }, null])).toEqual([1, { a: "x" }, null]);
  });
});

describe("describeError", () => {
  it("describes an Error by message and anything else by its string form", () => {
    expect(describeError(new Error("gateway"))).toEqual({ $error: "gateway" });
    expect(describeError("plain")).toEqual({ $error: "plain" });
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/encode.test.ts`
Expected: FAIL — cannot resolve `#/scenario/encode`.

- [ ] **Step 4: Write `encode.ts`**

```ts
import type { Json } from "#/scenario/format";

/** The canonical JSON form of a value a runner observed or an author wrote.
 * Every comparison in a scenario happens between two values in this form. */
export function encodeValue(value: unknown): Json {
  return encodeAt(value, "$");
}

/** The inverse for step arguments: an encoded error becomes a real `Error`,
 * everything else is already what the port or presenter takes. */
export function decodeArgument(value: Json): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeArgument);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const record = value as { readonly [key: string]: Json };

  if (typeof record.$error === "string" && Object.keys(record).length === 1) {
    return new Error(record.$error);
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      return [key, decodeArgument(entry)];
    }),
  );
}

/** An entry of a collector's error log. Lenient on purpose: a core may wrap
 * a failure in its own error type, and the contract asserts how many errors
 * arrived, not their class. */
export function describeError(error: unknown): Json {
  return { $error: error instanceof Error ? error.message : String(error) };
}

function encodeAt(value: unknown, where: string): Json {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${where}: cannot encode ${String(value)}`);
    }

    return value;
  }

  if (value instanceof Error) {
    return { $error: value.message };
  }

  if (Array.isArray(value) || value instanceof Set) {
    return [...value].map((entry, index) => {
      return encodeAt(entry, `${where}[${index}]`);
    });
  }

  if (value instanceof Map) {
    return [...value].map(([key, entry], index) => {
      return [
        encodeAt(key, `${where}[${index}][0]`),
        encodeAt(entry, `${where}[${index}][1]`),
      ];
    });
  }

  if (typeof value === "object") {
    return encodeRecord(value, where);
  }

  throw new Error(`${where}: cannot encode a ${typeof value}`);
}

function encodeRecord(value: object, where: string): Json {
  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(
      `${where}: cannot encode a ${value.constructor.name} instance`,
    );
  }

  const encoded: Record<string, Json> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      encoded[key] = encodeAt(entry, `${where}.${key}`);
    }
  }

  return encoded;
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/encode.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Lint the two source files and the test, fix what is reported, commit**

```bash
pnpm exec eslint packages/core-contract/src/scenario
pnpm exec biome ci packages/core-contract/src/scenario
git add packages/core-contract/src/scenario
git commit -m "feat(core-contract): scenario format types and canonical encoding"
```

---

### Task 2: Path and pick projection

**Files:**
- Create: `packages/core-contract/src/scenario/path.ts`
- Test: `packages/core-contract/src/scenario/path.test.ts`

**Interfaces:**
- Consumes: `Json` from `#/scenario/format`.
- Produces: `applyPath(value: Json, path: string): Json`, `applyPick(value: Json, picks: readonly string[]): Json`. Both throw an `Error` whose message starts with the path when a segment does not resolve.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { applyPath, applyPick } from "#/scenario/path";

const PRICES = [
  { mid: 1.1, movementType: "NONE" },
  { mid: 1.2, movementType: "UP" },
];

describe("applyPath", () => {
  it("reads a property, an index, and a negative index from the end", () => {
    expect(applyPath({ a: { b: 2 } }, ".a.b")).toBe(2);
    expect(applyPath(PRICES, "[0].mid")).toBe(1.1);
    expect(applyPath(PRICES, "[-1].mid")).toBe(1.2);
  });

  it("maps the rest of the path over an array at [*], keeping nesting", () => {
    expect(applyPath(PRICES, "[*].mid")).toEqual([1.1, 1.2]);
    expect(
      applyPath(
        [[{ mid: 1 }], [{ mid: 1 }, { mid: 2 }]],
        "[*][*].mid",
      ),
    ).toEqual([[1], [1, 2]]);
    expect(applyPath([], "[*].mid")).toEqual([]);
  });

  it("accepts a first property without its leading dot", () => {
    expect(applyPath({ trade: { tradeId: 7 } }, "trade.tradeId")).toBe(7);
  });

  it("a missing property fails", () => {
    expect(() => {
      return applyPath(PRICES, "[0].typo");
    }).toThrow('[0].typo: no property "typo"');
  });

  it("an index out of range fails, and so does indexing a non-array", () => {
    expect(() => {
      return applyPath(PRICES, "[2]");
    }).toThrow("[2]: index 2 is out of range (length 2)");
    expect(() => {
      return applyPath([], "[-1]");
    }).toThrow("[-1]: index -1 is out of range (length 0)");
    expect(() => {
      return applyPath({ a: 1 }, "[0]");
    }).toThrow("[0]: not an array");
  });

  it("a path that does not parse fails", () => {
    expect(() => {
      return applyPath(PRICES, "[0]..mid");
    }).toThrow('[0]..mid: cannot parse from "..mid"');
  });
});

describe("applyPick", () => {
  it("turns each element of an array into a tuple of the picked paths", () => {
    expect(applyPick(PRICES, ["mid", "movementType"])).toEqual([
      [1.1, "NONE"],
      [1.2, "UP"],
    ]);
  });

  it("turns a single value into one tuple", () => {
    expect(applyPick(PRICES[0], ["mid"])).toEqual([1.1]);
  });

  it("a picked path that resolves to nothing fails", () => {
    expect(() => {
      return applyPick(PRICES, ["mid", "spread"]);
    }).toThrow('spread: no property "spread"');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/path.test.ts`
Expected: FAIL — cannot resolve `#/scenario/path`.

- [ ] **Step 3: Write `path.ts`**

```ts
import type { Json } from "#/scenario/format";

type Segment =
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "index"; readonly index: number }
  | { readonly kind: "each" };

const SEGMENT = /\.?([A-Za-z_$][\w$]*)|\[(-?\d+)\]|\[(\*)\]/y;

/** Project `value` through `path`: `.name`, `[n]`, `[-1]`, `[*]`. A segment
 * that does not resolve throws — a scenario never compares "missing" with
 * "missing". */
export function applyPath(value: Json, path: string): Json {
  return walk(value, parsePath(path), path);
}

/** Each element of an array (or a single value) becomes a tuple holding the
 * picked paths, in order. */
export function applyPick(value: Json, picks: readonly string[]): Json {
  if (Array.isArray(value)) {
    return value.map((element: Json) => {
      return pickTuple(element, picks);
    });
  }

  return pickTuple(value, picks);
}

function pickTuple(value: Json, picks: readonly string[]): Json {
  return picks.map((pick) => {
    return applyPath(value, pick);
  });
}

function parsePath(path: string): Segment[] {
  const segments: Segment[] = [];
  let position = 0;

  while (position < path.length) {
    SEGMENT.lastIndex = position;
    const match = SEGMENT.exec(path);

    if (match === null || (match[1] !== undefined && isDoubledDot(path, position))) {
      throw new Error(`${path}: cannot parse from "${path.slice(position)}"`);
    }

    segments.push(toSegment(match));
    position = SEGMENT.lastIndex;
  }

  return segments;
}

function isDoubledDot(path: string, position: number): boolean {
  return path.startsWith("..", position);
}

function toSegment(match: RegExpExecArray): Segment {
  if (match[1] !== undefined) {
    return { kind: "name", name: match[1] };
  }

  if (match[2] !== undefined) {
    return { kind: "index", index: Number(match[2]) };
  }

  return { kind: "each" };
}

function walk(value: Json, segments: readonly Segment[], path: string): Json {
  const [head, ...rest] = segments;

  if (head === undefined) {
    return value;
  }

  if (head.kind === "name") {
    return walk(readProperty(value, head.name, path), rest, path);
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path}: not an array`);
  }

  if (head.kind === "each") {
    return value.map((element: Json) => {
      return walk(element, rest, path);
    });
  }

  const index = head.index < 0 ? value.length + head.index : head.index;

  if (index < 0 || index >= value.length) {
    throw new Error(
      `${path}: index ${head.index} is out of range (length ${value.length})`,
    );
  }

  return walk(value[index], rest, path);
}

function readProperty(value: Json, name: string, path: string): Json {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.hasOwn(value, name)
  ) {
    throw new Error(`${path}: no property "${name}"`);
  }

  return (value as { readonly [key: string]: Json })[name];
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/path.test.ts`
Expected: PASS, 9 tests. If the "does not parse" case fails because the regex consumed `.` then `.mid`, keep the `isDoubledDot` guard and adjust only until that test passes; the other eight define the behaviour.

- [ ] **Step 5: Lint, fix, commit**

```bash
pnpm exec eslint packages/core-contract/src/scenario
pnpm exec biome ci packages/core-contract/src/scenario
git add packages/core-contract/src/scenario
git commit -m "feat(core-contract): path and pick projection for scenario expectations"
```

---

### Task 3: The JSON Schema and the validating parser

**Files:**
- Create: `packages/core-contract/scenarios/scenario.schema.json`
- Create: `packages/core-contract/src/scenario/parse.ts`
- Test: `packages/core-contract/src/scenario/parse.test.ts`
- Modify: `packages/core-contract/package.json` (add `ajv`, `@types/node`)
- Modify: the root Biome config's `files.includes` (exclude the generated directory)

**Interfaces:**
- Consumes: `ScenarioFile` from `#/scenario/format`.
- Produces: `parseScenarioFile(text: string, label: string): ScenarioFile` (throws when the text is not a valid scenario file), `readScenarioFile(member: string): ScenarioFile`, `SCENARIOS_DIR: URL`.

- [ ] **Step 1: Add the dependencies**

Check freshness first: `npm view ajv version time.modified` (8.20.0 on 2026-10-05, published 2026-04-24, so past any cooldown).

In `packages/core-contract/package.json` add to `dependencies`: `"ajv": "^8.20.0"`, and to `devDependencies`: `"@types/node": "^26.2.0"` (the version `packages/client-core-rxjs/package.json` already uses). Then:

Run: `pnpm install`
Run: `pnpm check:versions`
Expected: both succeed; `pnpm-lock.yaml` changes.

- [ ] **Step 2: Exclude the generated directory from Biome**

`JSON.stringify` output is not Biome's JSON format, and the files are generated. In the root Biome config, append to `files.includes`, after the `docs/presentations` entry:

```jsonc
      // Generated scenario artefacts (JSON + Gherkin) of @rtc/core-contract,
      // kept byte-equal to the emitter's output by that package's drift
      // test. Out of scope for the formatter, like dist.
      "!packages/core-contract/scenarios"
```

- [ ] **Step 3: Write `scenarios/scenario.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/bettersoftware-io/ReactiveTraderCloudClone/packages/core-contract/scenarios/scenario.schema.json",
  "title": "Core contract scenario file, format version 1",
  "type": "object",
  "additionalProperties": false,
  "required": ["formatVersion", "member", "scenarios"],
  "properties": {
    "formatVersion": { "const": 1 },
    "member": { "type": "string", "minLength": 1 },
    "scenarios": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/definitions/scenario" }
    }
  },
  "definitions": {
    "alias": { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9]*$" },
    "args": { "type": "array" },
    "streamRef": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["stream"],
          "properties": {
            "stream": { "type": "string", "minLength": 1 },
            "args": { "$ref": "#/definitions/args" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["ref"],
          "properties": { "ref": { "$ref": "#/definitions/alias" } }
        }
      ]
    },
    "read": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["collector", "field"],
          "properties": {
            "collector": { "$ref": "#/definitions/alias" },
            "field": { "enum": ["values", "errors", "turns"] }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["driver", "args"],
          "properties": {
            "driver": { "type": "string", "minLength": 1 },
            "args": { "$ref": "#/definitions/args" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["identical"],
          "properties": {
            "identical": {
              "type": "array",
              "minItems": 2,
              "maxItems": 2,
              "items": { "$ref": "#/definitions/streamRef" }
            }
          }
        }
      ]
    },
    "scenario": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "touches", "steps"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "touches": { "type": "array", "items": { "type": "string" } },
        "time": { "const": "virtual" },
        "now": { "type": "integer" },
        "seed": { "type": "object" },
        "steps": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/definitions/step" }
        }
      }
    },
    "step": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "verb", "args"],
          "properties": {
            "step": { "const": "drive" },
            "verb": { "type": "string", "minLength": 1 },
            "args": { "$ref": "#/definitions/args" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "target", "args"],
          "properties": {
            "step": { "const": "call" },
            "target": { "type": "string", "minLength": 1 },
            "args": { "$ref": "#/definitions/args" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "as", "factory", "args"],
          "properties": {
            "step": { "const": "machine" },
            "as": { "$ref": "#/definitions/alias" },
            "factory": { "type": "string", "minLength": 1 },
            "args": { "$ref": "#/definitions/args" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "of"],
          "properties": {
            "step": { "enum": ["dispose", "unsubscribe", "markTurns"] },
            "of": { "$ref": "#/definitions/alias" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "as", "stream"],
          "properties": {
            "step": { "const": "lookup" },
            "as": { "$ref": "#/definitions/alias" },
            "stream": { "type": "string", "minLength": 1 },
            "args": { "$ref": "#/definitions/args" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "as", "from"],
          "properties": {
            "step": { "const": "subscribe" },
            "as": { "$ref": "#/definitions/alias" },
            "from": { "$ref": "#/definitions/streamRef" },
            "countTurns": { "const": true }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step"],
          "properties": { "step": { "const": "settle" } }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "ms"],
          "properties": {
            "step": { "const": "advance" },
            "ms": { "type": "integer", "minimum": 0 },
            "note": { "type": "string" }
          }
        },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["step", "read"],
          "properties": {
            "step": { "const": "expect" },
            "read": { "$ref": "#/definitions/read" },
            "path": { "type": "string", "minLength": 1 },
            "pick": {
              "type": "array",
              "minItems": 1,
              "items": { "type": "string", "minLength": 1 }
            },
            "note": { "type": "string" },
            "equals": {},
            "matches": {},
            "length": { "type": "integer", "minimum": 0 },
            "pattern": { "type": "string" }
          },
          "oneOf": [
            { "required": ["equals"] },
            { "required": ["matches"] },
            { "required": ["length"] },
            { "required": ["pattern"] }
          ]
        }
      ]
    }
  }
}
```

- [ ] **Step 4: Write the failing test `parse.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { parseScenarioFile } from "#/scenario/parse";

describe("parseScenarioFile", () => {
  it("accepts a file holding every step kind and every matcher", () => {
    const file = parseScenarioFile(
      JSON.stringify(createEveryStepFile()),
      "every.json",
    );
    expect(file.scenarios[0].steps).toHaveLength(14);
  });

  it("rejects an unknown step kind", () => {
    expect(() => {
      return parseScenarioFile(
        JSON.stringify(createFileWithStep({ step: "sleep", ms: 5 })),
        "bad.json",
      );
    }).toThrow("bad.json: not a valid scenario file");
  });

  it("rejects an unknown key on a known step", () => {
    expect(() => {
      return parseScenarioFile(
        JSON.stringify(createFileWithStep({ step: "settle", extra: true })),
        "bad.json",
      );
    }).toThrow("bad.json: not a valid scenario file");
  });

  it("rejects an expectation with no matcher, and one with two", () => {
    const read = { collector: "c", field: "values" };

    expect(() => {
      return parseScenarioFile(
        JSON.stringify(createFileWithStep({ step: "expect", read })),
        "bad.json",
      );
    }).toThrow("not a valid scenario file");
    expect(() => {
      return parseScenarioFile(
        JSON.stringify(
          createFileWithStep({ step: "expect", read, equals: [], length: 0 }),
        ),
        "bad.json",
      );
    }).toThrow("not a valid scenario file");
  });

  it("rejects another format version, and a file with no scenarios", () => {
    expect(() => {
      return parseScenarioFile(
        JSON.stringify({ ...createFileWithStep({ step: "settle" }), formatVersion: 2 }),
        "bad.json",
      );
    }).toThrow("not a valid scenario file");
    expect(() => {
      return parseScenarioFile(
        JSON.stringify({ formatVersion: 1, member: "m", scenarios: [] }),
        "empty.json",
      );
    }).toThrow("empty.json: not a valid scenario file");
  });

  it("names the file when the text is not JSON at all", () => {
    expect(() => {
      return parseScenarioFile("{", "broken.json");
    }).toThrow("broken.json: not JSON");
  });
});

function createFileWithStep(step: object): object {
  return {
    formatVersion: 1,
    member: "presenters.example",
    scenarios: [{ name: "one", touches: [], steps: [step] }],
  };
}

function createEveryStepFile(): object {
  const stream = { stream: "presenters.example.value$", args: ["EURUSD"] };
  const values = { collector: "c", field: "values" };
  return {
    formatVersion: 1,
    member: "presenters.example",
    scenarios: [
      {
        name: "every step",
        touches: ["presenters.example"],
        time: "virtual",
        now: 1800000000000,
        seed: { transport: true },
        steps: [
          { step: "machine", as: "m", factory: "example", args: [1] },
          { step: "lookup", as: "s", stream: "m.state$" },
          { step: "subscribe", as: "c", from: stream, countTurns: true },
          { step: "drive", verb: "tickPrice", args: [{ mid: 1.1 }] },
          { step: "call", target: "m.intents.change", args: ["2m"] },
          { step: "settle" },
          { step: "advance", ms: 4999, note: "one short of the window" },
          { step: "markTurns", of: "c" },
          { step: "expect", read: values, equals: [] },
          { step: "expect", read: values, path: "[-1]", matches: { a: 1 } },
          { step: "expect", read: values, pick: ["mid"], length: 0 },
          {
            step: "expect",
            read: { driver: "priceObserved", args: ["EURUSD"] },
            pattern: "^x$",
          },
          {
            step: "expect",
            read: { identical: [{ ref: "s" }, stream] },
            equals: false,
          },
          { step: "unsubscribe", of: "c" },
        ],
      },
    ],
  };
}
```

Note for the implementer: the every-step file lists 14 steps but never uses `dispose`; that kind shares its schema branch with `unsubscribe` and `markTurns`.

- [ ] **Step 5: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/parse.test.ts`
Expected: FAIL — cannot resolve `#/scenario/parse`.

- [ ] **Step 6: Write `parse.ts`**

```ts
import { readFileSync } from "node:fs";

import { Ajv, type ValidateFunction } from "ajv";

import type { ScenarioFile } from "#/scenario/format";

/** Where the committed scenario files live. Resolves the same from
 * `src/scenario/` (this package's own tests) and from `dist/scenario/` (a
 * core's runner, which imports the built package). */
export const SCENARIOS_DIR = new URL("../../scenarios/", import.meta.url);

let cachedValidator: ValidateFunction<ScenarioFile> | undefined;

/** Read and validate one member's committed scenario file. */
export function readScenarioFile(member: string): ScenarioFile {
  const name = `${member}.json`;
  return parseScenarioFile(
    readFileSync(new URL(name, SCENARIOS_DIR), "utf8"),
    name,
  );
}

/** Parse scenario-file text. The JSON Schema is the only definition of what
 * is valid: an unknown step kind or an unknown key is an error, never
 * ignored. */
export function parseScenarioFile(text: string, label: string): ScenarioFile {
  const data = parseJson(text, label);
  const validate = loadValidator();

  if (!validate(data)) {
    const reasons = (validate.errors ?? [])
      .map((error) => {
        return `${error.instancePath || "/"} ${error.message ?? ""}`;
      })
      .join("; ");
    throw new Error(`${label}: not a valid scenario file: ${reasons}`);
  }

  return data;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: not JSON`, { cause: error });
  }
}

function loadValidator(): ValidateFunction<ScenarioFile> {
  if (cachedValidator === undefined) {
    const schema: unknown = JSON.parse(
      readFileSync(new URL("scenario.schema.json", SCENARIOS_DIR), "utf8"),
    );
    cachedValidator = new Ajv({ allErrors: true }).compile<ScenarioFile>(
      schema as object,
    );
  }

  return cachedValidator;
}
```

- [ ] **Step 7: Run the test and see it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/parse.test.ts`
Expected: PASS, 6 tests.

If Ajv's strict mode rejects the schema, fix the schema. Do not pass `strict: false`. If `import { Ajv } from "ajv"` does not typecheck under this repo's module settings, use the default import (`import Ajv from "ajv"`) and keep the rest.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
pnpm --filter @rtc/core-contract typecheck
pnpm exec eslint packages/core-contract/src/scenario
pnpm exec biome ci packages/core-contract
git add packages/core-contract pnpm-lock.yaml biome.json*
git commit -m "feat(core-contract): scenario JSON Schema and the validating parser"
```

---

### Task 4: The typed recording builder

**Files:**
- Create: `packages/core-contract/src/scenario/builder.ts`
- Test: `packages/core-contract/src/scenario/builder.test.ts`

**Interfaces:**
- Consumes: `encodeValue` (Task 1); the format types (Task 1); `Presenters`, `MachineFactories`, `AppCommands`, `Stream` from `@rtc/core-api`; `ScriptedDriver`, `HarnessSeed` from `#/harness/scriptedPorts`.
- Produces: `defineScenarios(member, define): ScenarioFile`; the types `ScenarioBuilder`, `ScenarioOptions`, `StreamHandle<T>`, `CollectorHandle`, `MachineHandle<M>`, `Expectation`.

The builder's surface, which every authored scenario uses:

| Call | Records |
|---|---|
| `s.given({ time, now, seed })` | scenario options; must be the first call, at most once |
| `s.stream.presenters.<member>.<stream>` / `.<method>(...args)` | nothing; returns a `StreamHandle` |
| `s.stream.driver.connectionEvents$()` | nothing; returns a `StreamHandle` |
| `s.call.presenters.<member>.<method>(...args)` | a `call` step |
| `s.call.commands.<name>(...args)` | a `call` step |
| `s.drive.<verb>(...args)` | a `drive` step (driver methods returning `void`) |
| `s.read.<query>(...args)` | nothing; returns an `Expectation` over a driver query |
| `s.machine.<factory>(...args)` | a `machine` step; returns `{ stream, intents, dispose() }` |
| `s.lookup(handle, as?)` | a `lookup` step; returns a handle that refers to it |
| `s.subscribe(handle, { as?, countTurns? })` | a `subscribe` step; returns a `CollectorHandle` |
| `s.identical(a, b)` | nothing; returns an `Expectation` |
| `s.settle()` / `s.advance(ms, note?)` | a `settle` / `advance` step |
| `collector.values` / `.errors` / `.turns` | nothing; each is an `Expectation` |
| `collector.markTurns()` / `.unsubscribe()` | a `markTurns` / `unsubscribe` step |
| `expectation.at(path)` / `.pick(...paths)` / `.note(text)` | nothing; returns a refined `Expectation` |
| `expectation.equals(v)` / `.matches(v)` / `.hasLength(n)` / `.matchesPattern(source)` | an `expect` step |

- [ ] **Step 1: Write the failing test `builder.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { PriceMovementType } from "@rtc/domain";

import { createTick, EURUSD, GBPUSD } from "#/harness/fixtures";
import { defineScenarios } from "#/scenario/builder";

describe("defineScenarios", () => {
  it("records subscribe, drive, settle and a picked expectation as literal steps", () => {
    const file = defineScenarios("presenters.priceStream", (scenario) => {
      scenario("each tick is enriched", (s) => {
        const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD));
        c.values.equals([]);
        s.drive.tickPrice(createTick("EURUSD", 1.1));
        s.settle();
        c.values
          .pick("mid", "movementType")
          .equals([[1.1, PriceMovementType.NONE]]);
      });
    });

    expect(file.formatVersion).toBe(1);
    expect(file.member).toBe("presenters.priceStream");
    expect(file.scenarios[0].touches).toEqual(["presenters.priceStream"]);
    expect(file.scenarios[0].steps).toEqual([
      {
        step: "subscribe",
        as: "c1",
        from: {
          stream: "presenters.priceStream.price$",
          args: [JSON.parse(JSON.stringify(EURUSD))],
        },
      },
      {
        step: "expect",
        read: { collector: "c1", field: "values" },
        equals: [],
      },
      {
        step: "drive",
        verb: "tickPrice",
        args: [JSON.parse(JSON.stringify(createTick("EURUSD", 1.1)))],
      },
      { step: "settle" },
      {
        step: "expect",
        read: { collector: "c1", field: "values" },
        pick: ["mid", "movementType"],
        equals: [[1.1, PriceMovementType.NONE]],
      },
    ]);
  });

  it("records a property stream without args, and a call on a presenter", () => {
    const file = defineScenarios("presenters.auth", (scenario) => {
      scenario("login", (s) => {
        const c = s.subscribe(s.stream.presenters.auth.state$, { as: "state" });
        s.call.presenters.auth.login("demo", "pw");
        c.values.at("[-1].status").equals("authenticating");
      });
    });

    expect(file.scenarios[0].steps.slice(0, 2)).toEqual([
      {
        step: "subscribe",
        as: "state",
        from: { stream: "presenters.auth.state$" },
      },
      { step: "call", target: "presenters.auth.login", args: ["demo", "pw"] },
    ]);
  });

  it("records a machine, its intents, its stream and its disposal under one alias", () => {
    const file = defineScenarios("machines.notional", (scenario) => {
      scenario("change", (s) => {
        const m = s.machine.notional(1_000_000);
        const c = s.subscribe(m.stream.state$);
        m.intents.change("2m");
        s.settle();
        c.values.at("[-1].numericValue").equals(2_000_000);
        c.unsubscribe();
        m.dispose();
      });
    });

    expect(file.scenarios[0].touches).toEqual(["machines.notional"]);
    expect(file.scenarios[0].steps).toEqual([
      { step: "machine", as: "m1", factory: "notional", args: [1_000_000] },
      { step: "subscribe", as: "c1", from: { stream: "m1.state$" } },
      { step: "call", target: "m1.intents.change", args: ["2m"] },
      { step: "settle" },
      {
        step: "expect",
        read: { collector: "c1", field: "values" },
        path: "[-1].numericValue",
        equals: 2_000_000,
      },
      { step: "unsubscribe", of: "c1" },
      { step: "dispose", of: "m1" },
    ]);
  });

  it("records options, a lookup, an identity check, a driver query, a turn count and an advance with its note", () => {
    const file = defineScenarios("presenters.priceStream", (scenario) => {
      scenario("everything else", (s) => {
        s.given({ time: "virtual", now: 5, seed: { transport: true } });
        const price = s.stream.presenters.priceStream.price$;
        s.identical(price(EURUSD), price(GBPUSD)).equals(false);
        const remembered = s.lookup(price(EURUSD), "eurusd");
        const c = s.subscribe(remembered, { countTurns: true });
        c.markTurns();
        s.advance(4_999, "CONFIRMATION_DISMISS_MS − 1");
        c.turns.equals(0);
        c.errors.hasLength(0);
        s.read.priceObserved("EURUSD").note("the port is held").equals(true);
        s.read.storedSession().matches({ token: "tok" });
        c.values.at("[0].valueDate").matchesPattern("^\\d{4}");
      });
    });
    const scenario = file.scenarios[0];

    expect(scenario.time).toBe("virtual");
    expect(scenario.now).toBe(5);
    expect(scenario.seed).toEqual({ transport: true });
    expect(scenario.steps[1]).toEqual({
      step: "lookup",
      as: "eurusd",
      stream: "presenters.priceStream.price$",
      args: [JSON.parse(JSON.stringify(EURUSD))],
    });
    expect(scenario.steps[2]).toEqual({
      step: "subscribe",
      as: "c1",
      from: { ref: "eurusd" },
      countTurns: true,
    });
    expect(scenario.steps[3]).toEqual({ step: "markTurns", of: "c1" });
    expect(scenario.steps[4]).toEqual({
      step: "advance",
      ms: 4_999,
      note: "CONFIRMATION_DISMISS_MS − 1",
    });
    expect(scenario.steps[5]).toEqual({
      step: "expect",
      read: { collector: "c1", field: "turns" },
      equals: 0,
    });
    expect(scenario.steps[6]).toEqual({
      step: "expect",
      read: { collector: "c1", field: "errors" },
      length: 0,
    });
    expect(scenario.steps[7]).toEqual({
      step: "expect",
      read: { driver: "priceObserved", args: ["EURUSD"] },
      note: "the port is held",
      equals: true,
    });
    expect(scenario.steps[8]).toEqual({
      step: "expect",
      read: { driver: "storedSession", args: [] },
      matches: { token: "tok" },
    });
    expect(scenario.steps[9]).toEqual({
      step: "expect",
      read: { collector: "c1", field: "values" },
      path: "[0].valueDate",
      pattern: "^\\d{4}",
    });
  });

  it("lists every contract member a scenario touches, sorted, once each", () => {
    const file = defineScenarios("presenters.priceStream", (scenario) => {
      scenario("calm", (s) => {
        s.call.presenters.powerSaver.setLevel("calm");
        s.call.commands.reconnect();
        const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD));
        s.subscribe(s.stream.driver.connectionEvents$());
        c.values.equals([]);
      });
    });

    expect(file.scenarios[0].touches).toEqual([
      "commands.reconnect",
      "presenters.powerSaver",
      "presenters.priceStream",
    ]);
  });

  it("refuses a scenario that could not mean what it says", () => {
    const defineWith = (
      build: Parameters<Parameters<typeof defineScenarios>[1]>[0] extends (
        name: string,
        build: infer B,
      ) => void
        ? B
        : never,
    ): (() => unknown) => {
      return () => {
        return defineScenarios("m", (scenario) => {
          scenario("case", build);
        });
      };
    };

    expect(
      defineWith((s) => {
        s.settle();
      }),
    ).toThrow('m: "case" asserts nothing');
    expect(
      defineWith((s) => {
        s.advance(1);
        s.read.pairsObserved().equals(true);
      }),
    ).toThrow('m: "case" advances time without time: "virtual"');
    expect(
      defineWith((s) => {
        s.settle();
        s.given({ time: "virtual" });
        s.read.pairsObserved().equals(true);
      }),
    ).toThrow('m: "case" given() must be the first call, and only once');
    expect(
      defineWith((s) => {
        s.given({ now: 5 });
        s.read.pairsObserved().equals(true);
      }),
    ).toThrow('m: "case" sets now without time: "virtual"');
  });

  it("refuses two scenarios with one name, and a member with none", () => {
    expect(() => {
      return defineScenarios("m", (scenario) => {
        scenario("same", (s) => {
          s.read.pairsObserved().equals(true);
        });
        scenario("same", (s) => {
          s.read.pairsObserved().equals(true);
        });
      });
    }).toThrow('m: duplicate scenario name "same"');
    expect(() => {
      return defineScenarios("m", () => {});
    }).toThrow("m: defines no scenarios");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/builder.test.ts`
Expected: FAIL — cannot resolve `#/scenario/builder`.

- [ ] **Step 3: Write `builder.ts`**

```ts
import type {
  AppCommands,
  MachineFactories,
  Presenters,
  Stream,
} from "@rtc/core-api";

import type { HarnessSeed, ScriptedDriver } from "#/harness/scriptedPorts";
import { encodeValue } from "#/scenario/encode";
import {
  type ExpectStep,
  FORMAT_VERSION,
  type Matcher,
  type Read,
  type Scenario,
  type ScenarioFile,
  type Step,
  type StreamRef,
} from "#/scenario/format";

declare const streamValue: unique symbol;

/** A stream named by path. `T` is for the author's type checking only. */
export interface StreamHandle<T> {
  readonly ref: StreamRef;
  readonly [streamValue]?: T;
}

/** The members of `M` that are streams or return one. */
export type StreamSurface<M> = {
  readonly [K in keyof M as M[K] extends
    | Stream<unknown>
    | ((...args: never[]) => Stream<unknown>)
    ? K
    : never]: M[K] extends Stream<infer V>
    ? StreamHandle<V>
    : M[K] extends (...args: infer A) => Stream<infer V>
      ? (...args: A) => StreamHandle<V>
      : never;
};

/** The methods of `M` that do not return a stream. */
export type CallSurface<M> = {
  readonly [K in keyof M as M[K] extends (...args: never[]) => Stream<unknown>
    ? never
    : M[K] extends (...args: never[]) => unknown
      ? K
      : never]: M[K] extends (...args: infer A) => unknown
    ? (...args: A) => void
    : never;
};

type DriverResult<K extends keyof ScriptedDriver> = ScriptedDriver[K] extends (
  ...args: never[]
) => infer R
  ? R
  : never;

/** Scripted-port verbs: the driver methods that return nothing. */
export type DriveSurface = {
  readonly [K in keyof ScriptedDriver as [DriverResult<K>] extends [void]
    ? K
    : never]: ScriptedDriver[K];
};

/** Scripted-port queries: the driver methods that return a plain value. */
export type ReadSurface = {
  readonly [K in keyof ScriptedDriver as [DriverResult<K>] extends [void]
    ? never
    : DriverResult<K> extends Stream<unknown>
      ? never
      : K]: ScriptedDriver[K] extends (...args: infer A) => unknown
    ? (...args: A) => Expectation
    : never;
};

export interface MachineHandle<M> {
  readonly stream: StreamSurface<M>;
  readonly intents: M extends { readonly intents: infer I }
    ? CallSurface<I>
    : never;
  dispose(): void;
}

export type MachineSurface = {
  readonly [K in keyof MachineFactories]: MachineFactories[K] extends (
    ...args: infer A
  ) => infer M
    ? (...args: A) => MachineHandle<M>
    : never;
};

export interface Expectation {
  /** Project through a path first: `.name`, `[n]`, `[-1]`, `[*]`. */
  at(path: string): Expectation;
  /** Turn each element (or the single value) into a tuple of these paths. */
  pick(...paths: string[]): Expectation;
  /** A remark for readers: where a number came from. Runners ignore it. */
  note(text: string): Expectation;
  equals(expected: unknown): void;
  matches(expected: object): void;
  hasLength(length: number): void;
  matchesPattern(source: string): void;
}

export interface CollectorHandle {
  readonly values: Expectation;
  readonly errors: Expectation;
  readonly turns: Expectation;
  markTurns(): void;
  unsubscribe(): void;
}

export interface ScenarioOptions {
  readonly time?: "virtual";
  readonly now?: number;
  readonly seed?: HarnessSeed;
}

export interface ScenarioBuilder {
  given(options: ScenarioOptions): void;
  readonly stream: {
    readonly presenters: {
      readonly [K in keyof Presenters]: StreamSurface<Presenters[K]>;
    };
    readonly driver: StreamSurface<ScriptedDriver>;
  };
  readonly call: {
    readonly presenters: {
      readonly [K in keyof Presenters]: CallSurface<Presenters[K]>;
    };
    readonly commands: CallSurface<AppCommands>;
  };
  readonly drive: DriveSurface;
  readonly read: ReadSurface;
  readonly machine: MachineSurface;
  lookup<T>(stream: StreamHandle<T>, as?: string): StreamHandle<T>;
  subscribe<T>(
    stream: StreamHandle<T>,
    options?: { readonly as?: string; readonly countTurns?: boolean },
  ): CollectorHandle;
  identical(a: StreamHandle<unknown>, b: StreamHandle<unknown>): Expectation;
  settle(): void;
  advance(ms: number, note?: string): void;
}

export type DefineScenario = (
  name: string,
  build: (s: ScenarioBuilder) => void,
) => void;

/** Author one member's scenarios. Nothing runs: every call on the builder
 * records a step, and the result is the member's scenario file. */
export function defineScenarios(
  member: string,
  define: (scenario: DefineScenario) => void,
): ScenarioFile {
  const scenarios: Scenario[] = [];

  define((name, build) => {
    const taken = scenarios.some((scenario) => {
      return scenario.name === name;
    });

    if (taken) {
      throw new Error(`${member}: duplicate scenario name "${name}"`);
    }

    scenarios.push(recordScenario(member, name, build));
  });

  if (scenarios.length === 0) {
    throw new Error(`${member}: defines no scenarios`);
  }

  return { formatVersion: FORMAT_VERSION, member, scenarios };
}

type RecordStep = (step: Step) => void;
type Leaf = (path: string, record: RecordStep) => unknown;
type AliasKind = "c" | "m" | "s";

function recordScenario(
  member: string,
  name: string,
  build: (s: ScenarioBuilder) => void,
): Scenario {
  const steps: Step[] = [];
  const counts: { [K in AliasKind]: number } = { c: 0, m: 0, s: 0 };
  let options: ScenarioOptions | undefined;
  const record: RecordStep = (step) => {
    steps.push(step);
  };
  const nameAlias = (kind: AliasKind, given?: string): string => {
    if (given !== undefined) {
      return given;
    }

    counts[kind] += 1;
    return `${kind}${counts[kind]}`;
  };

  const builder: ScenarioBuilder = {
    given: (given) => {
      if (options !== undefined || steps.length > 0) {
        throw new Error(
          `${member}: "${name}" given() must be the first call, and only once`,
        );
      }

      options = given;
    },
    stream: {
      presenters: createNamespace("presenters", createStreamLeaf, record),
      driver: createMember("driver", createStreamLeaf, record),
    } as ScenarioBuilder["stream"],
    call: {
      presenters: createNamespace("presenters", createCallLeaf, record),
      commands: createMember("commands", createCallLeaf, record),
    } as ScenarioBuilder["call"],
    drive: createKeyed((verb) => {
      return (...args: unknown[]) => {
        record({ step: "drive", verb, args: args.map(encodeValue) });
      };
    }) as DriveSurface,
    read: createKeyed((query) => {
      return (...args: unknown[]) => {
        return createExpectation(record, {
          driver: query,
          args: args.map(encodeValue),
        });
      };
    }) as ReadSurface,
    machine: createKeyed((factory) => {
      return (...args: unknown[]) => {
        const as = nameAlias("m");
        record({ step: "machine", as, factory, args: args.map(encodeValue) });
        return {
          stream: createMember(as, createStreamLeaf, record),
          intents: createMember(`${as}.intents`, createCallLeaf, record),
          dispose: () => {
            record({ step: "dispose", of: as });
          },
        };
      };
    }) as MachineSurface,
    lookup: (stream, given) => {
      if ("ref" in stream.ref) {
        throw new Error(`${member}: "${name}" looks up a stream twice`);
      }

      const as = nameAlias("s", given);
      record({ step: "lookup", as, ...stream.ref });
      return { ref: { ref: as } };
    },
    subscribe: (stream, subscribeOptions) => {
      const as = nameAlias("c", subscribeOptions?.as);
      record({
        step: "subscribe",
        as,
        from: stream.ref,
        ...(subscribeOptions?.countTurns === true
          ? { countTurns: true as const }
          : {}),
      });
      return createCollector(record, as);
    },
    identical: (a, b) => {
      return createExpectation(record, { identical: [a.ref, b.ref] });
    },
    settle: () => {
      record({ step: "settle" });
    },
    advance: (ms, note) => {
      record({ step: "advance", ms, ...(note === undefined ? {} : { note }) });
    },
  };

  build(builder);
  return assembleScenario(member, name, options ?? {}, steps);
}

function assembleScenario(
  member: string,
  name: string,
  options: ScenarioOptions,
  steps: readonly Step[],
): Scenario {
  const asserts = steps.some((step) => {
    return step.step === "expect";
  });
  const advances = steps.some((step) => {
    return step.step === "advance";
  });

  if (!asserts) {
    throw new Error(`${member}: "${name}" asserts nothing`);
  }

  if (advances && options.time !== "virtual") {
    throw new Error(
      `${member}: "${name}" advances time without time: "virtual"`,
    );
  }

  if (options.now !== undefined && options.time !== "virtual") {
    throw new Error(`${member}: "${name}" sets now without time: "virtual"`);
  }

  return {
    name,
    touches: listTouched(steps),
    ...(options.time === undefined ? {} : { time: options.time }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.seed === undefined ? {} : { seed: encodeValue(options.seed) }),
    steps,
  };
}

function createCollector(record: RecordStep, as: string): CollectorHandle {
  return {
    values: createExpectation(record, { collector: as, field: "values" }),
    errors: createExpectation(record, { collector: as, field: "errors" }),
    turns: createExpectation(record, { collector: as, field: "turns" }),
    markTurns: () => {
      record({ step: "markTurns", of: as });
    },
    unsubscribe: () => {
      record({ step: "unsubscribe", of: as });
    },
  };
}

interface Projection {
  readonly path?: string;
  readonly pick?: readonly string[];
  readonly note?: string;
}

function createExpectation(
  record: RecordStep,
  read: Read,
  projection: Projection = {},
): Expectation {
  const expectWith = (matcher: Matcher): void => {
    const step: ExpectStep = { step: "expect", read, ...projection, ...matcher };
    record(step);
  };

  return {
    at: (path) => {
      return createExpectation(record, read, { ...projection, path });
    },
    pick: (...paths) => {
      return createExpectation(record, read, { ...projection, pick: paths });
    },
    note: (text) => {
      return createExpectation(record, read, { ...projection, note: text });
    },
    equals: (expected) => {
      expectWith({ equals: encodeValue(expected) });
    },
    matches: (expected) => {
      expectWith({ matches: encodeValue(expected) });
    },
    hasLength: (length) => {
      expectWith({ length });
    },
    matchesPattern: (source) => {
      expectWith({ pattern: source });
    },
  };
}

/** A stream leaf is usable both ways: read `.ref` for a property stream, or
 * call it for a stream-returning method. The typed surfaces decide which
 * one the author can see. */
function createStreamLeaf(path: string): unknown {
  const named = (...args: unknown[]): StreamHandle<unknown> => {
    return { ref: { stream: path, args: args.map(encodeValue) } };
  };
  return Object.assign(named, { ref: { stream: path } });
}

function createCallLeaf(path: string, record: RecordStep): unknown {
  return (...args: unknown[]) => {
    record({ step: "call", target: path, args: args.map(encodeValue) });
  };
}

function createNamespace(prefix: string, leaf: Leaf, record: RecordStep): unknown {
  return createKeyed((member) => {
    return createMember(`${prefix}.${member}`, leaf, record);
  });
}

function createMember(prefix: string, leaf: Leaf, record: RecordStep): unknown {
  return createKeyed((key) => {
    return leaf(`${prefix}.${key}`, record);
  });
}

function createKeyed(make: (key: string) => unknown): unknown {
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        return typeof key === "string" ? make(key) : undefined;
      },
    },
  );
}

function listTouched(steps: readonly Step[]): string[] {
  const touched = new Set<string>();
  const touch = (path: string): void => {
    const [root, member] = path.split(".");

    if ((root === "presenters" || root === "commands") && member !== undefined) {
      touched.add(`${root}.${member}`);
    }
  };
  const touchRef = (ref: StreamRef): void => {
    if ("stream" in ref) {
      touch(ref.stream);
    }
  };

  for (const step of steps) {
    if (step.step === "call") {
      touch(step.target);
    } else if (step.step === "machine") {
      touched.add(`machines.${step.factory}`);
    } else if (step.step === "lookup") {
      touch(step.stream);
    } else if (step.step === "subscribe") {
      touchRef(step.from);
    } else if (step.step === "expect" && "identical" in step.read) {
      step.read.identical.forEach(touchRef);
    }
  }

  return [...touched].sort();
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/builder.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Prove the types reject a wrong name**

Add this to the end of `builder.test.ts`, inside the outer `describe`:

```ts
  it("is typed against the contract: a wrong member, verb or argument does not compile", () => {
    defineScenarios("presenters.priceStream", (scenario) => {
      scenario("typed", (s) => {
        // @ts-expect-error -- no such presenter
        s.stream.presenters.priceStreem.price$(EURUSD);
        // @ts-expect-error -- price$ takes a CurrencyPair, not a symbol
        s.stream.presenters.priceStream.price$("EURUSD");
        // @ts-expect-error -- login is a call, not a stream
        s.stream.presenters.auth.login("demo", "pw");
        // @ts-expect-error -- tickPrice takes a tick
        s.drive.tickPrice("EURUSD");
        // @ts-expect-error -- priceObserved is a query, not a verb
        s.drive.priceObserved("EURUSD");
        // @ts-expect-error -- no such machine
        s.machine.tileExecutor(EURUSD);
        s.read.pairsObserved().equals(true);
      });
    });
  });
```

Run: `pnpm --filter @rtc/core-contract typecheck`
Expected: no errors. An "unused `@ts-expect-error`" error means that line compiled when it must not; fix the surface type it names, not the test.

- [ ] **Step 6: Lint, fix, commit**

```bash
pnpm exec eslint packages/core-contract/src/scenario
pnpm exec biome ci packages/core-contract/src/scenario
git add packages/core-contract/src/scenario
git commit -m "feat(core-contract): typed recording builder for contract scenarios"
```

---

### Task 5: The interpreter

**Files:**
- Create: `packages/core-contract/src/scenario/interpret.ts`
- Test: `packages/core-contract/src/scenario/interpret.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `Step`, `ExpectStep`, `Read`, `StreamRef`, `Json` (Task 1); `encodeValue`, `decodeArgument`, `describeError` (Task 1); `applyPath`, `applyPick` (Task 2); `CoreHarness`, `MakeHarness` from `#/harness/harness`; `collect`, `collectTurns`, `settle`, `withFakeClock` from the harness.
- Produces: `runScenario(scenario: Scenario, makeHarness: MakeHarness): Promise<void>`. Resolves when every step held; rejects with an `Error` whose message starts `step <n> (<kind>):`.

- [ ] **Step 1: Write the failing test `interpret.test.ts`**

The fake harness is a hand-built object with only what a scenario reaches. It is cast to `CoreHarness` because the interpreter resolves members by name at run time.

```ts
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { CoreHarness, MakeHarness } from "#/harness/harness";
import type { Scenario, Step } from "#/scenario/format";
import { runScenario } from "#/scenario/interpret";

interface FakeWorld {
  readonly makeHarness: MakeHarness;
  readonly log: string[];
}

describe("runScenario", () => {
  it("drives a port, collects a stream and compares in JSON space", async () => {
    const world = createFakeWorld();

    await runScenario(
      createScenario([
        { step: "subscribe", as: "c", from: { stream: "presenters.ticks.value$" } },
        { step: "drive", verb: "tick", args: [{ mid: 1.1 }] },
        { step: "drive", verb: "tick", args: [{ mid: 1.2 }] },
        { step: "settle" },
        {
          step: "expect",
          read: { collector: "c", field: "values" },
          path: "[*].mid",
          equals: [1.1, 1.2],
        },
        { step: "expect", read: { collector: "c", field: "errors" }, length: 0 },
        { step: "expect", read: { driver: "tickCount", args: [] }, equals: 2 },
      ]),
      world.makeHarness,
    );
    expect(world.log).toContain("teardown");
  });

  it("fails on a wrong expectation, naming the step", async () => {
    const world = createFakeWorld();

    await expect(
      runScenario(
        createScenario([
          { step: "expect", read: { driver: "tickCount", args: [] }, equals: 9 },
        ]),
        world.makeHarness,
      ),
    ).rejects.toThrow("step 1 (expect):");
    expect(world.log).toContain("teardown");
  });

  it("an expectation right after subscribe sees only what arrived synchronously", async () => {
    const world = createFakeWorld();
    const lateReplay: Step[] = [
      { step: "subscribe", as: "c", from: { stream: "presenters.ticks.late$" } },
      {
        step: "expect",
        read: { collector: "c", field: "values" },
        equals: ["late"],
      },
    ];

    await expect(
      runScenario(createScenario(lateReplay), world.makeHarness),
    ).rejects.toThrow("step 2 (expect):");

    const afterSettle: Step[] = [lateReplay[0], { step: "settle" }, lateReplay[1]];
    await runScenario(createScenario(afterSettle), createFakeWorld().makeHarness);
  });

  it("calls a presenter method and a command, and decodes an error argument", async () => {
    const world = createFakeWorld();

    await runScenario(
      createScenario([
        { step: "call", target: "presenters.ticks.rename", args: ["x"] },
        { step: "call", target: "commands.reconnect", args: [] },
        { step: "drive", verb: "fail", args: [{ $error: "feed" }] },
        { step: "expect", read: { driver: "tickCount", args: [] }, equals: 0 },
      ]),
      world.makeHarness,
    );
    expect(world.log).toEqual([
      "rename:x",
      "reconnect",
      "fail:Error:feed",
      "teardown",
    ]);
  });

  it("creates a machine, calls an intent, reads its stream, and disposes what the scenario left alive", async () => {
    const world = createFakeWorld();

    await runScenario(
      createScenario([
        { step: "machine", as: "m", factory: "counter", args: [5] },
        { step: "subscribe", as: "c", from: { stream: "m.state$" } },
        { step: "call", target: "m.intents.add", args: [2] },
        {
          step: "expect",
          read: { collector: "c", field: "values" },
          equals: [5, 7],
        },
      ]),
      world.makeHarness,
    );
    expect(world.log).toEqual(["dispose:counter", "teardown"]);
  });

  it("remembers a lookup, and tells the same stream from another", async () => {
    const world = createFakeWorld();
    const eurusd = { stream: "presenters.ticks.byKey$", args: ["EURUSD"] };

    await runScenario(
      createScenario([
        { step: "lookup", as: "s", stream: eurusd.stream, args: eurusd.args },
        {
          step: "expect",
          read: { identical: [{ ref: "s" }, eurusd] },
          equals: true,
        },
        {
          step: "expect",
          read: {
            identical: [
              eurusd,
              { stream: "presenters.ticks.byKey$", args: ["GBPUSD"] },
            ],
          },
          equals: false,
        },
      ]),
      world.makeHarness,
    );
  });

  it("counts turns from the last mark", async () => {
    const world = createFakeWorld();

    await runScenario(
      createScenario([
        {
          step: "subscribe",
          as: "c",
          from: { stream: "presenters.ticks.value$" },
          countTurns: true,
        },
        { step: "drive", verb: "tick", args: [{ mid: 1 }] },
        { step: "settle" },
        { step: "markTurns", of: "c" },
        { step: "drive", verb: "tick", args: [{ mid: 2 }] },
        { step: "drive", verb: "tick", args: [{ mid: 3 }] },
        { step: "settle" },
        { step: "expect", read: { collector: "c", field: "turns" }, equals: 1 },
      ]),
      world.makeHarness,
    );
  });

  it("applies matches, length, pattern and pick", async () => {
    const world = createFakeWorld();

    await runScenario(
      createScenario([
        { step: "subscribe", as: "c", from: { stream: "presenters.ticks.value$" } },
        { step: "drive", verb: "tick", args: [{ mid: 1.1, at: "09:30:00" }] },
        { step: "settle" },
        {
          step: "expect",
          read: { collector: "c", field: "values" },
          path: "[-1]",
          matches: { mid: 1.1 },
        },
        { step: "expect", read: { collector: "c", field: "values" }, length: 1 },
        {
          step: "expect",
          read: { collector: "c", field: "values" },
          path: "[0].at",
          pattern: "^\\d{2}:\\d{2}:\\d{2}$",
        },
        {
          step: "expect",
          read: { collector: "c", field: "values" },
          pick: ["mid", "at"],
          equals: [[1.1, "09:30:00"]],
        },
      ]),
      world.makeHarness,
    );
  });

  it("runs virtual time: now is set before composition and advance fires what is due", async () => {
    const world = createFakeWorld();

    await runScenario(
      {
        ...createScenario([
          { step: "subscribe", as: "c", from: { stream: "presenters.ticks.value$" } },
          { step: "call", target: "presenters.ticks.tickLater", args: [100] },
          { step: "advance", ms: 99 },
          { step: "expect", read: { collector: "c", field: "values" }, equals: [] },
          { step: "advance", ms: 1 },
          { step: "settle" },
          {
            step: "expect",
            read: { collector: "c", field: "values" },
            path: "[*].mid",
            equals: [0],
          },
          {
            step: "expect",
            read: { driver: "composedAt", args: [] },
            equals: 1_800_000_000_000,
          },
        ]),
        time: "virtual",
        now: 1_800_000_000_000,
      },
      world.makeHarness,
    );
  });

  it("passes the seed to the harness", async () => {
    const world = createFakeWorld();

    await runScenario(
      {
        ...createScenario([
          {
            step: "expect",
            read: { driver: "seed", args: [] },
            equals: { transport: true },
          },
        ]),
        seed: { transport: true },
      },
      world.makeHarness,
    );
  });

  it("names what it cannot resolve", async () => {
    const run = (step: Step): Promise<void> => {
      return runScenario(createScenario([step]), createFakeWorld().makeHarness);
    };

    await expect(
      run({ step: "call", target: "presenters.nope.go", args: [] }),
    ).rejects.toThrow('step 1 (call): presenters.nope.go: no "nope"');
    await expect(
      run({ step: "drive", verb: "nope", args: [] }),
    ).rejects.toThrow('step 1 (drive): driver.nope: no "nope"');
    await expect(run({ step: "unsubscribe", of: "c" })).rejects.toThrow(
      'step 1 (unsubscribe): no collector "c"',
    );
    await expect(run({ step: "advance", ms: 1 })).rejects.toThrow(
      'step 1 (advance): the scenario does not declare time: "virtual"',
    );
    await expect(
      run({ step: "expect", read: { collector: "c", field: "turns" }, equals: 0 }),
    ).rejects.toThrow('step 1 (expect): no collector "c"');
  });
});

function createScenario(steps: readonly Step[]): Scenario {
  return { name: "case", touches: [], steps };
}

function createFakeWorld(): FakeWorld {
  const log: string[] = [];

  const makeHarness: MakeHarness = (seed) => {
    const value$ = new Subject<unknown>();
    const byKey = new Map<string, Observable<unknown>>();
    const composedAt = Date.now();
    let tickCount = 0;

    const harness = {
      app: {
        presenters: {
          ticks: {
            value$,
            late$: new Observable<string>((subscriber) => {
              queueMicrotask(() => {
                subscriber.next("late");
              });
            }),
            byKey$: (key: string) => {
              const known = byKey.get(key) ?? new Subject<unknown>();
              byKey.set(key, known);
              return known;
            },
            rename: (name: string) => {
              log.push(`rename:${name}`);
            },
            tickLater: (ms: number) => {
              setTimeout(() => {
                value$.next({ mid: 0 });
              }, ms);
            },
          },
        },
        commands: {
          reconnect: () => {
            log.push("reconnect");
          },
        },
      },
      machines: {
        counter: (start: number) => {
          const state$ = new BehaviorSubject(start);
          return {
            state$,
            intents: {
              add: (amount: number) => {
                state$.next(state$.value + amount);
              },
            },
            dispose: () => {
              log.push("dispose:counter");
            },
          };
        },
      },
      driver: {
        tick: (tick: unknown) => {
          tickCount += 1;
          value$.next(tick);
        },
        fail: (error: unknown) => {
          log.push(
            `fail:${error instanceof Error ? `Error:${error.message}` : "other"}`,
          );
        },
        tickCount: () => {
          return tickCount;
        },
        composedAt: () => {
          return composedAt;
        },
        seed: () => {
          return seed;
        },
      },
      teardown: async () => {
        log.push("teardown");
      },
    };

    return harness as unknown as CoreHarness;
  };

  return { makeHarness, log };
}
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/interpret.test.ts`
Expected: FAIL — cannot resolve `#/scenario/interpret`.

- [ ] **Step 3: Write `interpret.ts`**

```ts
import { expect, vi } from "vitest";

import type { Stream } from "@rtc/core-api";

import { type FakeClock, withFakeClock } from "#/harness/clock";
import { type Collected, collect } from "#/harness/collect";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import type { HarnessSeed } from "#/harness/scriptedPorts";
import { settle } from "#/harness/settle";
import { type CollectedTurns, collectTurns } from "#/harness/turns";
import { decodeArgument, describeError, encodeValue } from "#/scenario/encode";
import type {
  ExpectStep,
  Json,
  Read,
  Scenario,
  Step,
  StreamRef,
} from "#/scenario/format";
import { applyPath, applyPick } from "#/scenario/path";

interface Disposable {
  dispose(): void;
}

interface LiveCollector {
  readonly collected: Collected<unknown>;
  readonly turns: CollectedTurns<unknown> | undefined;
  turnsAtMark: number;
  live: boolean;
}

interface Run {
  readonly harness: CoreHarness;
  readonly machines: Map<string, { machine: Disposable; live: boolean }>;
  readonly lookups: Map<string, Stream<unknown>>;
  readonly collectors: Map<string, LiveCollector>;
}

type Waits = Pick<FakeClock, "settle"> & Partial<Pick<FakeClock, "advance">>;

/** Replay one scenario against a freshly composed core. Steps run in order
 * and in ONE turn between waits: only `settle` and `advance` yield. That is
 * part of the contract's meaning — a burst is several `drive` steps in a
 * row, and "replays synchronously" is a `subscribe` followed at once by an
 * `expect`. */
export async function runScenario(
  scenario: Scenario,
  makeHarness: MakeHarness,
): Promise<void> {
  if (scenario.time !== "virtual") {
    await replay(scenario, makeHarness, { settle });
    return;
  }

  await withFakeClock(async (clock) => {
    if (scenario.now !== undefined) {
      vi.setSystemTime(scenario.now);
    }

    await replay(scenario, makeHarness, clock);
    await clock.settle();
  });
}

async function replay(
  scenario: Scenario,
  makeHarness: MakeHarness,
  waits: Waits,
): Promise<void> {
  const seed = scenario.seed as HarnessSeed | undefined;
  const run: Run = {
    harness: makeHarness(seed),
    machines: new Map(),
    lookups: new Map(),
    collectors: new Map(),
  };

  try {
    for (const [index, step] of scenario.steps.entries()) {
      try {
        if (step.step === "settle") {
          await waits.settle();
        } else if (step.step === "advance") {
          await advanceBy(waits, step.ms);
        } else {
          applyStep(run, step);
        }
      } catch (error) {
        throw locateFailure(error, index, step);
      }
    }
  } finally {
    releaseRun(run);
    await run.harness.teardown();
  }
}

async function advanceBy(waits: Waits, ms: number): Promise<void> {
  if (waits.advance === undefined) {
    throw new Error('the scenario does not declare time: "virtual"');
  }

  await waits.advance(ms);
}

function locateFailure(error: unknown, index: number, step: Step): unknown {
  const where = `step ${index + 1} (${step.step}): `;

  if (error instanceof Error) {
    error.message = `${where}${error.message}`;
    return error;
  }

  return new Error(`${where}${String(error)}`);
}

function releaseRun(run: Run): void {
  for (const collector of run.collectors.values()) {
    if (collector.live) {
      collector.collected.unsubscribe();
    }
  }

  for (const entry of run.machines.values()) {
    if (entry.live) {
      entry.machine.dispose();
    }
  }
}

function applyStep(run: Run, step: Exclude<Step, { step: "settle" | "advance" }>): void {
  switch (step.step) {
    case "drive": {
      callAt(run, `driver.${step.verb}`, step.args);
      return;
    }
    case "call": {
      callAt(run, step.target, step.args);
      return;
    }
    case "machine": {
      const machine = callAt(run, `machines.${step.factory}`, step.args);
      run.machines.set(step.as, { machine: machine as Disposable, live: true });
      return;
    }
    case "dispose": {
      const entry = run.machines.get(step.of);

      if (entry === undefined) {
        throw new Error(`no machine "${step.of}"`);
      }

      entry.machine.dispose();
      entry.live = false;
      return;
    }
    case "lookup": {
      run.lookups.set(
        step.as,
        resolveStream(run, { stream: step.stream, args: step.args }),
      );
      return;
    }
    case "subscribe": {
      const stream = resolveStream(run, step.from);
      const turns = step.countTurns === true ? collectTurns(stream) : undefined;
      run.collectors.set(step.as, {
        collected: turns ?? collect(stream),
        turns,
        turnsAtMark: 0,
        live: true,
      });
      return;
    }
    case "unsubscribe": {
      const collector = findCollector(run, step.of);
      collector.collected.unsubscribe();
      collector.live = false;
      return;
    }
    case "markTurns": {
      const collector = findCollector(run, step.of);
      collector.turnsAtMark = countTurnsOf(collector, step.of);
      return;
    }
    case "expect": {
      checkExpectation(run, step);
      return;
    }
  }
}

function checkExpectation(run: Run, step: ExpectStep): void {
  let actual = readActual(run, step.read);

  if (step.path !== undefined) {
    actual = applyPath(actual, step.path);
  }

  if (step.pick !== undefined) {
    actual = applyPick(actual, step.pick);
  }

  if ("equals" in step) {
    expect(actual).toEqual(step.equals);
  } else if ("matches" in step) {
    expect(actual).toMatchObject(step.matches as object);
  } else if ("length" in step) {
    expect(actual).toHaveLength(step.length);
  } else {
    expect(actual).toMatch(new RegExp(step.pattern));
  }
}

function readActual(run: Run, read: Read): Json {
  if ("identical" in read) {
    const [a, b] = read.identical;
    return resolveStream(run, a) === resolveStream(run, b);
  }

  if ("driver" in read) {
    return encodeValue(callAt(run, `driver.${read.driver}`, read.args));
  }

  const collector = findCollector(run, read.collector);

  if (read.field === "values") {
    return encodeValue(collector.collected.values);
  }

  if (read.field === "errors") {
    return collector.collected.errors.map(describeError);
  }

  return countTurnsOf(collector, read.collector) - collector.turnsAtMark;
}

function countTurnsOf(collector: LiveCollector, alias: string): number {
  if (collector.turns === undefined) {
    throw new Error(`collector "${alias}" was not subscribed with countTurns`);
  }

  return collector.turns.turnCount();
}

function findCollector(run: Run, alias: string): LiveCollector {
  const collector = run.collectors.get(alias);

  if (collector === undefined) {
    throw new Error(`no collector "${alias}"`);
  }

  return collector;
}

function resolveStream(run: Run, ref: StreamRef): Stream<unknown> {
  if ("ref" in ref) {
    const remembered = run.lookups.get(ref.ref);

    if (remembered === undefined) {
      throw new Error(`no lookup "${ref.ref}"`);
    }

    return remembered;
  }

  const found =
    ref.args === undefined
      ? readAt(run, ref.stream)
      : callAt(run, ref.stream, ref.args);
  return found as Stream<unknown>;
}

function callAt(run: Run, path: string, args: readonly Json[]): unknown {
  const { owner, key } = locate(run, path);
  const method: unknown = owner[key];

  if (typeof method !== "function") {
    throw new Error(`${path}: "${key}" is not callable`);
  }

  return method.apply(owner, args.map(decodeArgument));
}

function readAt(run: Run, path: string): unknown {
  const { owner, key } = locate(run, path);
  return owner[key];
}

type Owner = { readonly [key: string]: unknown };

/** Walk a dotted path to the object that owns its last segment. The first
 * segment is `presenters`, `commands`, `driver`, `machines`, or a machine
 * alias. Every segment must exist: an unknown name is an error, never
 * `undefined`. */
function locate(run: Run, path: string): { owner: Owner; key: string } {
  const [root, ...rest] = path.split(".");
  const key = rest.pop();

  if (key === undefined) {
    throw new Error(`${path}: not a dotted path`);
  }

  let owner = findRoot(run, root, path);

  for (const segment of rest) {
    owner = stepInto(owner, segment, path);
  }

  if (!(key in owner)) {
    throw new Error(`${path}: no "${key}"`);
  }

  return { owner, key };
}

function findRoot(run: Run, root: string, path: string): Owner {
  const roots: Owner = {
    presenters: run.harness.app.presenters,
    commands: run.harness.app.commands,
    driver: run.harness.driver,
    machines: run.harness.machines,
  };
  const found = roots[root] ?? run.machines.get(root)?.machine;

  if (found === undefined || found === null) {
    throw new Error(`${path}: no "${root}"`);
  }

  return found as Owner;
}

function stepInto(owner: Owner, segment: string, path: string): Owner {
  const next = owner[segment];

  if (next === undefined || next === null) {
    throw new Error(`${path}: no "${segment}"`);
  }

  return next as Owner;
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/interpret.test.ts`
Expected: PASS, 11 tests.

Two things to check if a case fails:
- "runs virtual time": `composedAt` must equal `now`, which holds only if `vi.setSystemTime` runs before `makeHarness`. Keep that order.
- "names what it cannot resolve": the exact messages are part of the test; adjust the implementation's wording to them, not the reverse.

- [ ] **Step 5: Lint, fix, commit**

```bash
pnpm --filter @rtc/core-contract typecheck
pnpm exec eslint packages/core-contract/src/scenario
pnpm exec biome ci packages/core-contract/src/scenario
git add packages/core-contract/src/scenario
git commit -m "feat(core-contract): scenario interpreter over CoreHarness"
```

---

### Task 6: The scenario suite and the count pin

**Files:**
- Create: `packages/core-contract/src/scenario/suite.ts`
- Test: `packages/core-contract/src/scenario/suite.test.ts`

**Interfaces:**
- Consumes: `readScenarioFile` (Task 3), `runScenario` (Task 5), `Suite` from `#/harness/harness`.
- Produces: `scenarioSuite(member: string): Suite`; `SCENARIO_COUNTS: Readonly<Record<string, number>>`; `checkScenarioCount(member: string, found: number, counts?: Readonly<Record<string, number>>): void` (throws when the pinned count is missing or differs; `counts` defaults to `SCENARIO_COUNTS`, which starts empty and gains one entry per converted member).

- [ ] **Step 1: Write the failing test `suite.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { checkScenarioCount } from "#/scenario/suite";

const PINNED = { "presenters.example": 10 };

describe("checkScenarioCount", () => {
  it("accepts the pinned count", () => {
    expect(() => {
      checkScenarioCount("presenters.example", 10, PINNED);
    }).not.toThrow();
  });

  it("fails when a file holds fewer or more scenarios than pinned", () => {
    expect(() => {
      checkScenarioCount("presenters.example", 9, PINNED);
    }).toThrow("presenters.example: expected 10 scenarios, the file holds 9");
    expect(() => {
      checkScenarioCount("presenters.example", 11, PINNED);
    }).toThrow("presenters.example: expected 10 scenarios, the file holds 11");
  });

  it("fails for a member with no pinned count", () => {
    expect(() => {
      checkScenarioCount("presenters.unpinned", 3, PINNED);
    }).toThrow("presenters.unpinned: no pinned scenario count");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/suite.test.ts`
Expected: FAIL — cannot resolve `#/scenario/suite`.

- [ ] **Step 3: Write `suite.ts`**

```ts
import { describe, it } from "vitest";

import type { Suite } from "#/harness/harness";
import { runScenario } from "#/scenario/interpret";
import { readScenarioFile } from "#/scenario/parse";

/** How many scenarios each converted member's file must hold. Hand-kept on
 * purpose: a truncated or emptied JSON file then fails every core's runner
 * by name instead of passing with fewer cases. */
export const SCENARIO_COUNTS: Readonly<Record<string, number>> = {};

/** The suite for a member whose contract is a scenario file: one vitest
 * case per scenario, replayed from the JSON on disk. */
export function scenarioSuite(member: string): Suite {
  return (label, makeHarness) => {
    const file = readScenarioFile(member);
    checkScenarioCount(member, file.scenarios.length);

    describe(label, () => {
      for (const scenario of file.scenarios) {
        it(scenario.name, async () => {
          await runScenario(scenario, makeHarness);
        });
      }
    });
  };
}

export function checkScenarioCount(
  member: string,
  found: number,
  counts: Readonly<Record<string, number>> = SCENARIO_COUNTS,
): void {
  const pinned = counts[member];

  if (pinned === undefined) {
    throw new Error(`${member}: no pinned scenario count`);
  }

  if (pinned !== found) {
    throw new Error(
      `${member}: expected ${pinned} scenarios, the file holds ${found}`,
    );
  }
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/suite.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Lint, fix, commit**

```bash
pnpm exec eslint packages/core-contract/src/scenario
pnpm exec biome ci packages/core-contract/src/scenario
git add packages/core-contract/src/scenario
git commit -m "feat(core-contract): scenarioSuite and the per-member count pin"
```

---

### Task 7: The Gherkin rendering

**Files:**
- Create: `packages/core-contract/src/scenario/phrases.ts`
- Create: `packages/core-contract/src/scenario/render.ts`
- Test: `packages/core-contract/src/scenario/render.test.ts`

**Interfaces:**
- Consumes: the format types (Task 1).
- Produces: `renderFeature(file: ScenarioFile, phrases: Phrases): string`; the `Phrases` type and the `PHRASES` table from `phrases.ts`; `summarise(value: Json): string`.

`Phrases` has five tables, each from a name to a function of the encoded arguments:

```ts
export type Phrase = (args: readonly Json[]) => string;

export interface Phrases {
  /** by driver verb: "the price feed ticks EURUSD at 1.1" */
  readonly drive: Readonly<Record<string, Phrase>>;
  /** by call target with a machine alias replaced by its factory:
   * "presenters.powerSaver.setLevel", "machines.tileExecution.intents.execute" */
  readonly call: Readonly<Record<string, Phrase>>;
  /** by stream path, same replacement: "the EURUSD price stream" */
  readonly stream: Readonly<Record<string, Phrase>>;
  /** by driver query: "the pending executions" */
  readonly read: Readonly<Record<string, Phrase>>;
  /** by machine factory: "a tile-execution machine for EURUSD" */
  readonly machine: Readonly<Record<string, Phrase>>;
  /** by seed key: "a stored session for demo" */
  readonly seed: Readonly<Record<string, (value: Json) => string>>;
}
```

- [ ] **Step 1: Write the failing test `render.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import type { ScenarioFile } from "#/scenario/format";
import type { Phrases } from "#/scenario/phrases";
import { renderFeature, summarise } from "#/scenario/render";

const PHRASES: Phrases = {
  drive: {
    tickPrice: ([tick]) => {
      return `the price feed ticks ${summarise(tick)}`;
    },
  },
  call: {
    "machines.notional.intents.change": ([input]) => {
      return `the trader types ${summarise(input)} as the notional`;
    },
  },
  stream: {
    "presenters.priceStream.price$": ([pair]) => {
      return `the ${summarise(pair)} price stream`;
    },
    "machines.notional.state$": () => {
      return "the notional machine's state";
    },
  },
  read: {
    priceObserved: ([symbol]) => {
      return `whether the ${summarise(symbol)} price port is observed`;
    },
  },
  machine: {
    notional: ([initial]) => {
      return `a notional machine starting at ${summarise(initial)}`;
    },
  },
  seed: {
    transport: () => {
      return "a scripted transport";
    },
  },
};

describe("renderFeature", () => {
  it("renders setup as Given, actions as When, expectations as Then, repeating with And", () => {
    const text = renderFeature(createPriceFile(), PHRASES);

    expect(text).toBe(
      [
        "# Generated from packages/core-contract/src/scenarios — do not edit.",
        "# Read-only: nothing parses or executes this file. The contract is the JSON beside it.",
        "Feature: presenters.priceStream",
        "",
        "  Scenario: each tick is enriched",
        "    Given virtual time, with the wall clock at 1800000000000",
        "    And a scripted transport",
        "    And subscriber c1 to the EURUSD price stream",
        "    Then the values c1 received equal []",
        "    When the price feed ticks EURUSD @ 1.1",
        "    And the core settles",
        "    And 4999 ms pass (PRICE_CONFLATION_MS − 1)",
        "    Then the values c1 received, as mid and movementType, equal:",
        "      | 1.1 | NONE |",
        "    And the errors c1 received have length 0",
        "    And whether the EURUSD price port is observed equals true (the port is held)",
        "",
      ].join("\n"),
    );
  });

  it("names a machine by its factory in stream and call phrases", () => {
    const text = renderFeature(createNotionalFile(), PHRASES);

    expect(text).toContain("    Given a notional machine starting at 1000000 (m1)");
    expect(text).toContain("    And subscriber c1 to the notional machine's state");
    expect(text).toContain('    When the trader types "2m" as the notional');
    expect(text).toContain("    Then the values c1 received at [-1].numericValue equal 2000000");
    expect(text).toContain("    When c1 unsubscribes");
    expect(text).toContain("    And machine m1 is disposed");
  });

  it("fails on a verb with no phrase instead of printing the identifier", () => {
    const file = createPriceFile();
    const withoutTick: Phrases = { ...PHRASES, drive: {} };

    expect(() => {
      return renderFeature(file, withoutTick);
    }).toThrow('presenters.priceStream: no phrase for drive "tickPrice"');
  });

  it("fails on a seed key with no phrase", () => {
    expect(() => {
      return renderFeature(createPriceFile(), { ...PHRASES, seed: {} });
    }).toThrow('presenters.priceStream: no phrase for seed "transport"');
  });
});

describe("summarise", () => {
  it("names a pair by symbol, a tick by symbol and mid, a trade by id, pair and status", () => {
    expect(summarise({ symbol: "EURUSD", pipsPosition: 4, ratePrecision: 5 })).toBe(
      "EURUSD",
    );
    expect(summarise({ symbol: "EURUSD", bid: 1, ask: 1.2, mid: 1.1 })).toBe(
      "EURUSD @ 1.1",
    );
    expect(
      summarise({ tradeId: 9, symbol: "EURUSD", status: "Done", notional: 1 }),
    ).toBe("trade #9 (EURUSD, Done)");
  });

  it("prints other values as compact JSON, cut at 80 characters", () => {
    expect(summarise("2m")).toBe('"2m"');
    expect(summarise([1, 2])).toBe("[1,2]");
    expect(summarise({ text: "x".repeat(200) })).toHaveLength(81);
    expect(summarise({ text: "x".repeat(200) }).endsWith("…")).toBe(true);
  });
});

function createPriceFile(): ScenarioFile {
  const pair = { symbol: "EURUSD", pipsPosition: 4, ratePrecision: 5 };
  const values = { collector: "c1", field: "values" } as const;
  return {
    formatVersion: 1,
    member: "presenters.priceStream",
    scenarios: [
      {
        name: "each tick is enriched",
        touches: ["presenters.priceStream"],
        time: "virtual",
        now: 1_800_000_000_000,
        seed: { transport: true },
        steps: [
          {
            step: "subscribe",
            as: "c1",
            from: { stream: "presenters.priceStream.price$", args: [pair] },
          },
          { step: "expect", read: values, equals: [] },
          {
            step: "drive",
            verb: "tickPrice",
            args: [{ symbol: "EURUSD", bid: 1.09995, ask: 1.10005, mid: 1.1 }],
          },
          { step: "settle" },
          { step: "advance", ms: 4_999, note: "PRICE_CONFLATION_MS − 1" },
          {
            step: "expect",
            read: values,
            pick: ["mid", "movementType"],
            equals: [[1.1, "NONE"]],
          },
          {
            step: "expect",
            read: { collector: "c1", field: "errors" },
            length: 0,
          },
          {
            step: "expect",
            read: { driver: "priceObserved", args: ["EURUSD"] },
            note: "the port is held",
            equals: true,
          },
        ],
      },
    ],
  };
}

function createNotionalFile(): ScenarioFile {
  return {
    formatVersion: 1,
    member: "machines.notional",
    scenarios: [
      {
        name: "change",
        touches: ["machines.notional"],
        steps: [
          { step: "machine", as: "m1", factory: "notional", args: [1_000_000] },
          { step: "subscribe", as: "c1", from: { stream: "m1.state$" } },
          { step: "call", target: "m1.intents.change", args: ["2m"] },
          {
            step: "expect",
            read: { collector: "c1", field: "values" },
            path: "[-1].numericValue",
            equals: 2_000_000,
          },
          { step: "unsubscribe", of: "c1" },
          { step: "dispose", of: "m1" },
        ],
      },
    ],
  };
}
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/render.test.ts`
Expected: FAIL — cannot resolve `#/scenario/render`.

- [ ] **Step 3: Write `phrases.ts`** with the type above and the pilot's phrases

```ts
import type { Json } from "#/scenario/format";
import { summarise } from "#/scenario/render";

export type Phrase = (args: readonly Json[]) => string;

export interface Phrases {
  readonly drive: Readonly<Record<string, Phrase>>;
  readonly call: Readonly<Record<string, Phrase>>;
  readonly stream: Readonly<Record<string, Phrase>>;
  readonly read: Readonly<Record<string, Phrase>>;
  readonly machine: Readonly<Record<string, Phrase>>;
  readonly seed: Readonly<Record<string, (value: Json) => string>>;
}

/** One phrase per verb, target, stream, query, machine and seed key that any
 * authored scenario uses. Emission fails on a missing entry, so a raw
 * identifier never reaches a `.feature` file. Add the phrase in the same
 * change that first uses the name. */
export const PHRASES: Phrases = {
  drive: {
    tickPrice: ([tick]) => {
      return `the price feed ticks ${summarise(tick)}`;
    },
    failPrice: ([symbol, error]) => {
      return `the ${summarise(symbol)} price feed fails with ${summarise(error)}`;
    },
  },
  call: {
    "presenters.powerSaver.setLevel": ([level]) => {
      return `the power-saver level is set to ${summarise(level)}`;
    },
  },
  stream: {
    "presenters.priceStream.price$": ([pair]) => {
      return `the ${summarise(pair)} price stream`;
    },
  },
  read: {
    priceObserved: ([symbol]) => {
      return `whether the ${summarise(symbol)} price port is observed`;
    },
  },
  machine: {},
  seed: {},
};
```

`phrases.ts` imports `summarise` from `render.ts`, and `render.ts` imports the `Phrases` type from `phrases.ts`. The type-only direction makes that legal; if `pnpm check:deps` reports a cycle, move `summarise` into its own file `src/scenario/summarise.ts` and import it from both.

- [ ] **Step 4: Write `render.ts`**

```ts
import type {
  ExpectStep,
  Json,
  Read,
  Scenario,
  ScenarioFile,
  Step,
  StreamRef,
} from "#/scenario/format";
import type { Phrase, Phrases } from "#/scenario/phrases";

const HEADER = [
  "# Generated from packages/core-contract/src/scenarios — do not edit.",
  "# Read-only: nothing parses or executes this file. The contract is the JSON beside it.",
];
const SUMMARY_LIMIT = 80;

type Keyword = "Given" | "When" | "Then";

interface Context {
  readonly member: string;
  readonly phrases: Phrases;
  /** machine alias → factory name, as the scenario declares them */
  readonly factories: Map<string, string>;
  /** lookup alias → the stream it named */
  readonly lookups: Map<string, StreamRef>;
}

/** The human-readable rendering of one member's scenarios. Deterministic
 * text; no runner in any language reads it. */
export function renderFeature(file: ScenarioFile, phrases: Phrases): string {
  const lines = [...HEADER, `Feature: ${file.member}`];

  for (const scenario of file.scenarios) {
    lines.push("", ...renderScenario(file.member, scenario, phrases));
  }

  return `${lines.join("\n")}\n`;
}

/** A short name for a value: a pair by symbol, a tick by symbol and mid, a
 * trade by id, pair and status; anything else as compact JSON. */
export function summarise(value: Json): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as { readonly [key: string]: Json };

    if (typeof record.tradeId === "number") {
      return `trade #${record.tradeId} (${String(record.symbol)}, ${String(record.status)})`;
    }

    if (typeof record.symbol === "string" && typeof record.mid === "number") {
      return `${record.symbol} @ ${record.mid}`;
    }

    if (typeof record.symbol === "string" && "pipsPosition" in record) {
      return record.symbol;
    }

    if (typeof record.$error === "string") {
      return `the error "${record.$error}"`;
    }
  }

  if (typeof value === "string" && /^[A-Z]{6}$/.test(value)) {
    return value;
  }

  const text = JSON.stringify(value);
  return text.length > SUMMARY_LIMIT
    ? `${text.slice(0, SUMMARY_LIMIT)}…`
    : text;
}

function renderScenario(
  member: string,
  scenario: Scenario,
  phrases: Phrases,
): string[] {
  const context: Context = {
    member,
    phrases,
    factories: new Map(),
    lookups: new Map(),
  };
  const lines = [`  Scenario: ${scenario.name}`];
  let previous: Keyword | undefined;
  let acted = false;
  const add = (keyword: Keyword, text: string, table: string[] = []): void => {
    lines.push(`    ${keyword === previous ? "And" : keyword} ${text}`, ...table);
    previous = keyword;
  };

  for (const given of renderOptions(context, scenario)) {
    add("Given", given);
  }

  for (const step of scenario.steps) {
    if (step.step === "expect") {
      const { text, table } = renderExpectation(context, step);
      add("Then", text, table);
      continue;
    }

    const isSetup =
      step.step === "machine" ||
      step.step === "lookup" ||
      step.step === "subscribe";
    add(isSetup && !acted ? "Given" : "When", renderAction(context, step));
    acted = acted || !isSetup;
  }

  return lines;
}

function renderOptions(context: Context, scenario: Scenario): string[] {
  const lines: string[] = [];

  if (scenario.time === "virtual") {
    lines.push(
      scenario.now === undefined
        ? "virtual time"
        : `virtual time, with the wall clock at ${scenario.now}`,
    );
  }

  const seed = (scenario.seed ?? {}) as { readonly [key: string]: Json };

  for (const [key, value] of Object.entries(seed)) {
    const phrase = context.phrases.seed[key];

    if (phrase === undefined) {
      throw new Error(`${context.member}: no phrase for seed "${key}"`);
    }

    lines.push(phrase(value));
  }

  return lines;
}

function renderAction(
  context: Context,
  step: Exclude<Step, ExpectStep>,
): string {
  switch (step.step) {
    case "drive": {
      return phraseFor(context, "drive", step.verb)(step.args);
    }
    case "call": {
      return phraseFor(context, "call", nameByFactory(context, step.target))(
        step.args,
      );
    }
    case "machine": {
      context.factories.set(step.as, step.factory);
      return `${phraseFor(context, "machine", step.factory)(step.args)} (${step.as})`;
    }
    case "dispose": {
      return `machine ${step.of} is disposed`;
    }
    case "lookup": {
      const ref: StreamRef = { stream: step.stream, args: step.args };
      context.lookups.set(step.as, ref);
      return `${step.as} names ${renderStream(context, ref)}`;
    }
    case "subscribe": {
      const counting = step.countTurns === true ? ", counting turns" : "";
      return `subscriber ${step.as} to ${renderStream(context, step.from)}${counting}`;
    }
    case "unsubscribe": {
      return `${step.of} unsubscribes`;
    }
    case "settle": {
      return "the core settles";
    }
    case "advance": {
      return `${step.ms} ms pass${renderNote(step.note)}`;
    }
    case "markTurns": {
      return `${step.of}'s turn count restarts from zero`;
    }
  }
}

function renderExpectation(
  context: Context,
  step: ExpectStep,
): { text: string; table: string[] } {
  const subject = `${renderRead(context, step.read)}${renderProjection(step)}`;
  const note = renderNote(step.note);

  if ("length" in step) {
    return { text: `${subject} have length ${step.length}${note}`, table: [] };
  }

  if ("pattern" in step) {
    return { text: `${subject} matches /${step.pattern}/${note}`, table: [] };
  }

  if ("matches" in step) {
    return { text: `${subject} include ${summarise(step.matches)}${note}`, table: [] };
  }

  if (isTable(step.equals)) {
    return {
      text: `${subject} equal:${note}`,
      table: step.equals.map((row) => {
        return `      | ${row.map(renderCell).join(" | ")} |`;
      }),
    };
  }

  const verb = step.pick === undefined && isScalar(step.equals) ? "equals" : "equal";
  const joined = "collector" in step.read ? "equal" : verb;
  return { text: `${subject} ${joined} ${summarise(step.equals)}${note}`, table: [] };
}

function renderRead(context: Context, read: Read): string {
  if ("identical" in read) {
    const [a, b] = read.identical;
    return `whether ${renderStream(context, a)} and ${renderStream(context, b)} are one stream`;
  }

  if ("driver" in read) {
    return phraseFor(context, "read", read.driver)(read.args);
  }

  if (read.field === "turns") {
    return `the turns ${read.collector}'s values arrived in`;
  }

  return `the ${read.field} ${read.collector} received`;
}

function renderProjection(step: ExpectStep): string {
  const at = step.path === undefined ? "" : ` at ${step.path}`;
  const pick =
    step.pick === undefined ? "" : `, as ${step.pick.join(" and ")},`;
  return `${at}${pick}`;
}

function renderStream(context: Context, ref: StreamRef): string {
  if ("ref" in ref) {
    return ref.ref;
  }

  return phraseFor(context, "stream", nameByFactory(context, ref.stream))(
    ref.args ?? [],
  );
}

/** `m1.intents.execute` → `machines.tileExecution.intents.execute`, so a
 * phrase is keyed by what the machine IS, not by its alias in one scenario. */
function nameByFactory(context: Context, path: string): string {
  const [root, ...rest] = path.split(".");
  const factory = context.factories.get(root);
  return factory === undefined
    ? path
    : ["machines", factory, ...rest].join(".");
}

function phraseFor(
  context: Context,
  table: "drive" | "call" | "stream" | "read" | "machine",
  name: string,
): Phrase {
  const phrase = context.phrases[table][name];

  if (phrase === undefined) {
    throw new Error(`${context.member}: no phrase for ${table} "${name}"`);
  }

  return phrase;
}

function renderNote(note: string | undefined): string {
  return note === undefined ? "" : ` (${note})`;
}

function renderCell(cell: Json): string {
  return typeof cell === "string" ? cell : JSON.stringify(cell);
}

function isScalar(value: Json): boolean {
  return value === null || typeof value !== "object";
}

function isTable(value: Json): value is readonly (readonly Json[])[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((row: Json) => {
      return Array.isArray(row) && row.every(isScalar);
    })
  );
}
```

- [ ] **Step 5: Run the test and make it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/render.test.ts`
Expected: PASS, 6 tests.

The first test pins the exact text. Where the output differs from it (the `equal` / `equals` wording is the likely spot), change `render.ts` until the text matches; the test is the specification of the wording. Simplify the `verb` / `joined` pair into one expression once the test passes: collector reads say "equal", every other read says "equals" for a scalar and "equal" otherwise.

- [ ] **Step 6: Lint, check the dependency graph, commit**

```bash
pnpm exec eslint packages/core-contract/src/scenario
pnpm exec biome ci packages/core-contract/src/scenario
pnpm check:deps
git add packages/core-contract/src/scenario
git commit -m "feat(core-contract): Gherkin rendering of scenario files"
```

---

### Task 8: Emission, the drift test, and the write command

**Files:**
- Create: `packages/core-contract/src/scenario/emit.ts`
- Create: `packages/core-contract/src/scenario/write.ts`
- Create: `packages/core-contract/src/scenarios/index.ts`
- Test: `packages/core-contract/src/scenario/emit.test.ts`
- Test: `packages/core-contract/src/scenario/drift.test.ts`
- Modify: `packages/core-contract/package.json` (script `scenarios:write`)
- Modify: `package.json` (root script `contract:scenarios`)

**Interfaces:**
- Consumes: `ScenarioFile` (Task 1); `renderFeature`, `Phrases` (Task 7); `parseScenarioFile`, `SCENARIOS_DIR` (Task 3).
- Produces: `emitScenarioFiles(files: readonly ScenarioFile[], phrases: Phrases): ReadonlyMap<string, string>` (file name → exact content); `findDrift(emitted: ReadonlyMap<string, string>, committed: ReadonlyMap<string, string>): string[]` (one line per problem; empty when in sync); `SCENARIO_FILES: readonly ScenarioFile[]` from `src/scenarios/index.ts`.

- [ ] **Step 1: Write the failing test `emit.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { emitScenarioFiles, findDrift } from "#/scenario/emit";
import type { ScenarioFile } from "#/scenario/format";
import type { Phrases } from "#/scenario/phrases";

const NO_PHRASES: Phrases = {
  drive: {},
  call: {},
  stream: {},
  read: {
    pairsObserved: () => {
      return "whether the pairs port is observed";
    },
  },
  machine: {},
  seed: {},
};

describe("emitScenarioFiles", () => {
  it("emits a JSON file and a feature file per member, each ending in a newline", () => {
    const emitted = emitScenarioFiles([createFile("presenters.a")], NO_PHRASES);

    expect([...emitted.keys()]).toEqual([
      "presenters.a.json",
      "presenters.a.feature",
    ]);
    expect(emitted.get("presenters.a.json")).toBe(
      `${JSON.stringify(createFile("presenters.a"), null, 2)}\n`,
    );
    expect(emitted.get("presenters.a.feature")?.endsWith("equals true\n")).toBe(
      true,
    );
  });

  it("refuses two files for one member", () => {
    expect(() => {
      return emitScenarioFiles(
        [createFile("presenters.a"), createFile("presenters.a")],
        NO_PHRASES,
      );
    }).toThrow('two scenario files for "presenters.a"');
  });
});

describe("findDrift", () => {
  it("reports nothing when the committed files are what is emitted", () => {
    const emitted = new Map([["a.json", "{}\n"]]);
    expect(findDrift(emitted, new Map(emitted))).toEqual([]);
  });

  it("reports a missing file, a changed file and an unexpected file", () => {
    const emitted = new Map([
      ["a.json", "{}\n"],
      ["b.json", "{}\n"],
    ]);
    const committed = new Map([
      ["b.json", "{ }\n"],
      ["c.json", "{}\n"],
    ]);

    expect(findDrift(emitted, committed)).toEqual([
      "a.json: missing — run `pnpm contract:scenarios`",
      "b.json: differs from what the authored scenarios emit — run `pnpm contract:scenarios`",
      "c.json: not emitted by any authored scenario — delete it",
    ]);
  });
});

function createFile(member: string): ScenarioFile {
  return {
    formatVersion: 1,
    member,
    scenarios: [
      {
        name: "observed",
        touches: [],
        steps: [
          {
            step: "expect",
            read: { driver: "pairsObserved", args: [] },
            equals: true,
          },
        ],
      },
    ],
  };
}
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/emit.test.ts`
Expected: FAIL — cannot resolve `#/scenario/emit`.

- [ ] **Step 3: Write `emit.ts`**

```ts
import type { ScenarioFile } from "#/scenario/format";
import type { Phrases } from "#/scenario/phrases";
import { renderFeature } from "#/scenario/render";

const REGENERATE = "run `pnpm contract:scenarios`";

/** Every file the authored scenarios produce, by name, with its exact
 * content. The one function both the write command and the drift test use,
 * so they cannot disagree. */
export function emitScenarioFiles(
  files: readonly ScenarioFile[],
  phrases: Phrases,
): ReadonlyMap<string, string> {
  const emitted = new Map<string, string>();

  for (const file of files) {
    const json = `${file.member}.json`;

    if (emitted.has(json)) {
      throw new Error(`two scenario files for "${file.member}"`);
    }

    emitted.set(json, `${JSON.stringify(file, null, 2)}\n`);
    emitted.set(`${file.member}.feature`, renderFeature(file, phrases));
  }

  return emitted;
}

/** One line per way the committed directory differs from what is emitted. */
export function findDrift(
  emitted: ReadonlyMap<string, string>,
  committed: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = [];

  for (const [name, content] of emitted) {
    const onDisk = committed.get(name);

    if (onDisk === undefined) {
      problems.push(`${name}: missing — ${REGENERATE}`);
    } else if (onDisk !== content) {
      problems.push(
        `${name}: differs from what the authored scenarios emit — ${REGENERATE}`,
      );
    }
  }

  for (const name of committed.keys()) {
    if (!emitted.has(name)) {
      problems.push(`${name}: not emitted by any authored scenario — delete it`);
    }
  }

  return problems;
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/emit.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `src/scenarios/index.ts`** (empty until Task 9 adds the pilot)

```ts
import type { ScenarioFile } from "#/scenario/format";

/** Every authored scenario file. The emitter writes one JSON and one
 * feature file per entry; the drift test fails when `scenarios/` holds
 * anything else. */
export const SCENARIO_FILES: readonly ScenarioFile[] = [];
```

- [ ] **Step 6: Write `drift.test.ts`**

```ts
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { emitScenarioFiles, findDrift } from "#/scenario/emit";
import { parseScenarioFile, SCENARIOS_DIR } from "#/scenario/parse";
import { PHRASES } from "#/scenario/phrases";
import { SCENARIO_COUNTS } from "#/scenario/suite";
import { SCENARIO_FILES } from "#/scenarios/index";

/** The two hand-written files that live beside the generated ones. */
const HAND_WRITTEN = new Set(["scenario.schema.json", "README.md"]);

describe("committed scenario files", () => {
  it("are exactly what the authored scenarios emit", () => {
    const emitted = emitScenarioFiles(SCENARIO_FILES, PHRASES);
    expect(findDrift(emitted, readCommitted())).toEqual([]);
  });

  it("each validate against the schema", () => {
    for (const [name, content] of readCommitted()) {
      if (name.endsWith(".json")) {
        expect(() => {
          return parseScenarioFile(content, name);
        }).not.toThrow();
      }
    }
  });

  it("have a pinned count for every member, equal to what is authored", () => {
    const authored = Object.fromEntries(
      SCENARIO_FILES.map((file) => {
        return [file.member, file.scenarios.length];
      }),
    );
    expect(SCENARIO_COUNTS).toEqual(authored);
  });
});

function readCommitted(): Map<string, string> {
  const committed = new Map<string, string>();

  for (const name of readdirSync(SCENARIOS_DIR)) {
    if (!HAND_WRITTEN.has(name)) {
      committed.set(name, readFileSync(new URL(name, SCENARIOS_DIR), "utf8"));
    }
  }

  return committed;
}
```

- [ ] **Step 7: Run it and see it pass on the empty set**

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/drift.test.ts`
Expected: PASS, 3 tests. Nothing is authored yet, `scenarios/` holds only the schema, and `SCENARIO_COUNTS` is empty, so all three agree. Task 9 makes each of them bite.

Then prove the first one can fail: create an empty file `packages/core-contract/scenarios/stray.json`, re-run, and expect FAIL with `stray.json: not emitted by any authored scenario — delete it`. Delete the file.

- [ ] **Step 8: Write `write.ts`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";

import { emitScenarioFiles } from "#/scenario/emit";
import { SCENARIOS_DIR } from "#/scenario/parse";
import { PHRASES } from "#/scenario/phrases";
import { SCENARIO_FILES } from "#/scenarios/index";

/** Regenerates `scenarios/*.json` and `*.feature`. Run through the package
 * script, which builds first: this file runs from `dist`. */
mkdirSync(SCENARIOS_DIR, { recursive: true });

for (const [name, content] of emitScenarioFiles(SCENARIO_FILES, PHRASES)) {
  writeFileSync(new URL(name, SCENARIOS_DIR), content);
  console.log(`wrote scenarios/${name}`);
}
```

`write.ts` must not import `interpret.ts` or `suite.ts`: those import vitest, which plain `node` should not load. If `no-console` fires, replace `console.log` with `process.stdout.write(...)`.

- [ ] **Step 9: Add the scripts**

In `packages/core-contract/package.json` `scripts`:

```json
"scenarios:write": "pnpm run build && node dist/scenario/write.js"
```

In the root `package.json` `scripts`, beside the other `check:*` entries:

```json
"contract:scenarios": "pnpm --filter @rtc/core-contract scenarios:write"
```

Run: `pnpm check:scripts`
Expected: passes. If it requires the new package script to be declared somewhere (it validates workspace scripts), follow its message.

- [ ] **Step 10: Lint, commit**

```bash
pnpm --filter @rtc/core-contract typecheck
pnpm exec eslint packages/core-contract/src
pnpm exec biome ci packages/core-contract package.json
git add packages/core-contract package.json
git commit -m "feat(core-contract): scenario emission, drift test and the write command"
```

---

### Task 9: The pilot — `presenters.priceStream`

**Files:**
- Create: `packages/core-contract/mutants/presenters.priceStream.json`
- Create: `packages/core-contract/src/scenarios/priceStream.ts`
- Modify: `packages/core-contract/src/scenarios/index.ts`
- Create (generated): `packages/core-contract/scenarios/presenters.priceStream.json`, `.feature`
- Modify: `packages/core-contract/src/registry.ts`
- Delete: `packages/core-contract/src/suites/priceStream.ts`
- Create: `packages/core-contract/scenarios/README.md`
- Modify: `packages/core-contract/README.md`

**Interfaces:**
- Consumes: `defineScenarios` (Task 4); `scenarioSuite` (Task 6); the write command (Task 8).
- Produces: `PRICE_STREAM_SCENARIOS: ScenarioFile`.

- [ ] **Step 1: Write the mutant spec BEFORE touching the suite**

`packages/core-contract/mutants/presenters.priceStream.json`. Every `test` runs the RxJS core's runner filtered to ONE case: the `-t` pattern is the member plus distinctive words of that case's name. The scenario suite keeps both the describe label and the case names, so the same commands work before and after the conversion and each mutant stays bound to the case it is meant to break. Mutants in `@rtc/domain` rebuild it first, because the core reads it through `dist`. A filter that matches no test makes vitest pass, which shows as `SURVIVED`, never as a false kill.

```json
[
  {
    "name": "price$ is not memoised",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "    this.cache.set(pair.symbol, stream);\n",
    "replace": "",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*is memoised per pair\""
  },
  {
    "name": "every pair shares the first pair's stream",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "const cached = this.cache.get(pair.symbol);",
    "replace": "const cached = [...this.cache.values()][0];",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*is memoised per pair\""
  },
  {
    "name": "movement is detected the wrong way round",
    "file": "packages/domain/src/usecases/PriceStreamUseCase.ts",
    "find": "detectMovement(tick.mid, previousMid)",
    "replace": "detectMovement(previousMid ?? tick.mid, tick.mid)",
    "test": "pnpm --filter @rtc/domain build && pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*each tick enriched\""
  },
  {
    "name": "the spread uses the wrong pip position",
    "file": "packages/domain/src/usecases/PriceStreamUseCase.ts",
    "find": "pair.pipsPosition,",
    "replace": "pair.pipsPosition + 1,",
    "test": "pnpm --filter @rtc/domain build && pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*each tick enriched\""
  },
  {
    "name": "each value of a first burst arrives in its own turn",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "import { type Observable, shareReplay } from \"rxjs\";",
    "replace": "import { asyncScheduler, observeOn, type Observable, shareReplay as realShareReplay } from \"rxjs\";\nconst shareReplay = ((config: never) => { return (source: Observable<never>) => { return source.pipe(observeOn(asyncScheduler), realShareReplay(config)); }; }) as unknown as typeof realShareReplay;",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*reaches the subscriber in one turn\""
  },
  {
    "name": "each value of a later burst arrives in its own turn",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "import { type Observable, shareReplay } from \"rxjs\";",
    "replace": "import { asyncScheduler, observeOn, type Observable, shareReplay as realShareReplay } from \"rxjs\";\nconst shareReplay = ((config: never) => { return (source: Observable<never>) => { return source.pipe(observeOn(asyncScheduler), realShareReplay(config)); }; }) as unknown as typeof realShareReplay;",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*also lands in one turn\""
  },
  {
    "name": "a late subscriber gets no current price",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "PRICE_CONFLATION_MS),\n      shareReplay({ bufferSize: 1, refCount: true }),",
    "replace": "PRICE_CONFLATION_MS),\n      shareReplay({ bufferSize: 0, refCount: true }),",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*a late subscriber gets the current price\""
  },
  {
    "name": "the port is held after the last unsubscribe",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "PRICE_CONFLATION_MS),\n      shareReplay({ bufferSize: 1, refCount: true }),",
    "replace": "PRICE_CONFLATION_MS),\n      shareReplay({ bufferSize: 1, refCount: false }),",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*tears down on the last unsubscribe\""
  },
  {
    "name": "the previous mid survives a teardown",
    "file": "packages/domain/src/usecases/PriceStreamUseCase.ts",
    "find": "    return defer(() => {\n      let previousMid: number | undefined;",
    "replace": "    let previousMid: number | undefined;\n    return defer(() => {",
    "test": "pnpm --filter @rtc/domain build && pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*tears down on the last unsubscribe\""
  },
  {
    "name": "a failing feed is swallowed",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "import { type Observable, shareReplay } from \"rxjs\";",
    "replace": "import { catchError, NEVER, type Observable, shareReplay as realShareReplay } from \"rxjs\";\nconst shareReplay = ((config: never) => { return (source: Observable<never>) => { return source.pipe(catchError(() => { return NEVER; }), realShareReplay(config)); }; }) as unknown as typeof realShareReplay;",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*a failing feed errors the stream\""
  },
  {
    "name": "the conflation window is 1 ms too long",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "conflateWhen(this.powerSaver$, PRICE_CONFLATION_MS)",
    "replace": "conflateWhen(this.powerSaver$, PRICE_CONFLATION_MS + 1)",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*while calm, delivers at most one price\""
  },
  {
    "name": "calm does not conflate",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "      conflateWhen(this.powerSaver$, PRICE_CONFLATION_MS),\n",
    "replace": "",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*while calm, delivers at most one price\""
  },
  {
    "name": "conflation is on when NOT calm",
    "file": "packages/client-core-rxjs/src/presenters/conflateWhen.ts",
    "find": "return on",
    "replace": "return !on",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*while not calm, every tick passes\""
  },
  {
    "name": "calm does not conflate, seen when calm is turned off",
    "file": "packages/client-core-rxjs/src/presenters/PriceStreamPresenter.ts",
    "find": "      conflateWhen(this.powerSaver$, PRICE_CONFLATION_MS),\n",
    "replace": "",
    "test": "pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t \"presenters.priceStream .*turning calm off takes effect\""
  }
]
```

All 10 cases have at least one mutant: 14 mutants in total.

- [ ] **Step 2: Record the baseline against the imperative suite**

Run: `node scripts/mutation-check.mts packages/core-contract/mutants/presenters.priceStream.json --keep-going`
Expected: 14 rows, all `KILLED`.

Then restore the domain build, which the three domain mutants left compiled from mutated source:

Run: `pnpm --filter @rtc/domain build`
Run: `git status --short packages/domain packages/client-core-rxjs`
Expected: no output (the script restored every source file).

Rules for this step:
- A row that says `ERROR` (the `find` matched 0 or 2+ times) means the source moved: fix the `find` string to match the file exactly once, and re-run.
- Before trusting a `KILLED` row, run its `test` command once with no mutant applied and confirm it runs exactly one case and passes. A filter that matches nothing, or a command that fails for another reason, would make the table meaningless.
- A row that says `SURVIVED` is a finding about the **existing** suite. Replace that mutant with one the imperative suite does kill, and note the survivor in the PR description. Do not weaken or delete a case to get a clean table.
- Save the printed table to the session scratchpad as `baseline-priceStream.txt`. It goes in the PR description.

- [ ] **Step 3: Author the scenarios: `src/scenarios/priceStream.ts`**

```ts
import {
  calculateSpread,
  PRICE_CONFLATION_MS,
  PriceMovementType,
} from "@rtc/domain";

import { createTick, EURUSD, GBPUSD } from "#/harness/fixtures";
import { defineScenarios } from "#/scenario/builder";

/** A same-turn burst, standing in for the 50 historical ticks the pricing
 * simulator replays on subscribe. */
const BURST_MIDS = [1.1, 1.2, 1.15, 1.18, 1.17, 1.19];

export const PRICE_STREAM_SCENARIOS = defineScenarios(
  "presenters.priceStream",
  (scenario) => {
    scenario(
      "price$(pair) is memoised per pair: same pair, same stream; another pair, another",
      (s) => {
        const price$ = s.stream.presenters.priceStream.price$;
        s.identical(price$(EURUSD), price$(EURUSD)).equals(true);
        s.identical(price$(EURUSD), price$(GBPUSD)).equals(false);
      },
    );

    scenario(
      "emits nothing until the port ticks, then each tick enriched: movement against the previous mid, a spread string",
      (s) => {
        const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD));
        c.values.equals([]);
        const first = createTick("EURUSD", 1.1);
        s.drive.tickPrice(first);
        s.drive.tickPrice(createTick("EURUSD", 1.2));
        s.drive.tickPrice(createTick("EURUSD", 1.15));
        s.settle();
        c.values.pick("mid", "movementType").equals([
          [1.1, PriceMovementType.NONE],
          [1.2, PriceMovementType.UP],
          [1.15, PriceMovementType.DOWN],
        ]);
        c.values
          .at("[0].spread")
          .note("calculateSpread of the first tick")
          .equals(
            calculateSpread(
              first.bid,
              first.ask,
              EURUSD.pipsPosition,
              EURUSD.ratePrecision,
            ),
          );
        c.errors.equals([]);
      },
    );

    scenario(
      "a burst the port delivers in one turn reaches the subscriber in one turn — every value, in order, but one UI render instead of one per value",
      (s) => {
        const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD), {
          countTurns: true,
        });

        for (const tickMid of BURST_MIDS) {
          s.drive.tickPrice(createTick("EURUSD", tickMid));
        }

        s.settle();
        c.values.at("[*].mid").equals(BURST_MIDS);
        c.turns.equals(1);
        c.errors.equals([]);
      },
    );

    scenario(
      "a burst arriving later, on a stream already live, also lands in one turn",
      (s) => {
        const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD), {
          countTurns: true,
        });
        s.drive.tickPrice(createTick("EURUSD", 1));
        s.settle();
        c.markTurns();

        for (const tickMid of BURST_MIDS) {
          s.drive.tickPrice(createTick("EURUSD", tickMid));
        }

        s.settle();
        c.values.at("[*].mid").equals([1, ...BURST_MIDS]);
        c.turns.equals(1);
      },
    );

    scenario("a late subscriber gets the current price synchronously", (s) => {
      const price$ = s.stream.presenters.priceStream.price$;
      s.subscribe(price$(EURUSD), { as: "first" });
      s.drive.tickPrice(createTick("EURUSD", 1.1));
      s.settle();
      const late = s.subscribe(price$(EURUSD), { as: "late" });
      late.values.at("[*].mid").equals([1.1]);
    });

    scenario(
      "tears down on the last unsubscribe — the port is released, nothing stale is replayed, and the next period's first tick is NONE again",
      (s) => {
        const price$ = s.stream.presenters.priceStream.price$;
        const first = s.subscribe(price$(EURUSD), { as: "first" });
        s.drive.tickPrice(createTick("EURUSD", 1.1));
        s.settle();
        s.read.priceObserved("EURUSD").equals(true);
        first.unsubscribe();
        s.settle();
        s.read.priceObserved("EURUSD").equals(false);
        const again = s.subscribe(price$(EURUSD), { as: "again" });
        again.values.equals([]);
        s.drive.tickPrice(createTick("EURUSD", 1.2));
        s.settle();
        again.values
          .pick("mid", "movementType")
          .equals([[1.2, PriceMovementType.NONE]]);
      },
    );

    scenario(
      "a failing feed errors the stream; a fresh subscriber starts a new period",
      (s) => {
        const price$ = s.stream.presenters.priceStream.price$;
        const c = s.subscribe(price$(EURUSD), { as: "first" });
        s.drive.failPrice("EURUSD", new Error("feed"));
        s.settle();
        c.errors.hasLength(1);
        const again = s.subscribe(price$(EURUSD), { as: "again" });
        s.drive.tickPrice(createTick("EURUSD", 1.3));
        s.settle();
        again.values.at("[*].mid").equals([1.3]);
        again.errors.equals([]);
      },
    );

    scenario(
      "while calm, delivers at most one price per PRICE_CONFLATION_MS: the first at once, the last of a burst at the window's end",
      (s) => {
        s.given({ time: "virtual" });
        s.call.presenters.powerSaver.setLevel("calm");
        s.settle();
        const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD));
        s.drive.tickPrice(createTick("EURUSD", 1.1));
        s.settle();
        c.values.at("[*].mid").equals([1.1]);
        s.drive.tickPrice(createTick("EURUSD", 1.2));
        s.drive.tickPrice(createTick("EURUSD", 1.3));
        s.advance(PRICE_CONFLATION_MS - 1, "PRICE_CONFLATION_MS − 1");
        c.values.at("[*].mid").equals([1.1]);
        s.advance(1, "the window ends");
        s.settle();
        c.values.at("[*].mid").equals([1.1, 1.3]);
      },
    );

    scenario("while not calm, every tick passes through at once", (s) => {
      s.given({ time: "virtual" });
      const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD));
      s.drive.tickPrice(createTick("EURUSD", 1.1));
      s.drive.tickPrice(createTick("EURUSD", 1.2));
      s.drive.tickPrice(createTick("EURUSD", 1.3));
      s.settle();
      c.values.at("[*].mid").equals([1.1, 1.2, 1.3]);
    });

    scenario(
      "turning calm off takes effect immediately: the next tick passes without waiting for a window",
      (s) => {
        s.given({ time: "virtual" });
        s.call.presenters.powerSaver.setLevel("calm");
        s.settle();
        const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD));
        s.drive.tickPrice(createTick("EURUSD", 1.1));
        s.drive.tickPrice(createTick("EURUSD", 1.2));
        s.settle();
        c.values.at("[*].mid").equals([1.1]);
        s.call.presenters.powerSaver.setLevel("off");
        s.settle();
        s.drive.tickPrice(createTick("EURUSD", 1.3));
        s.settle();
        c.values
          .at("[-1].mid")
          .note("the pending trailing 1.2 is uncontracted; 1.3 is not")
          .equals(1.3);
      },
    );
  },
);
```

Pin its count in `src/scenario/suite.ts`:

```ts
export const SCENARIO_COUNTS: Readonly<Record<string, number>> = {
  "presenters.priceStream": 10,
};
```

Then list it in `src/scenarios/index.ts`:

```ts
import type { ScenarioFile } from "#/scenario/format";
import { PRICE_STREAM_SCENARIOS } from "#/scenarios/priceStream";

/** Every authored scenario file. The emitter writes one JSON and one
 * feature file per entry; the drift test fails when `scenarios/` holds
 * anything else. */
export const SCENARIO_FILES: readonly ScenarioFile[] = [PRICE_STREAM_SCENARIOS];
```

- [ ] **Step 4: Generate the files and read them**

Run: `pnpm contract:scenarios`
Expected: `wrote scenarios/presenters.priceStream.json` and `wrote scenarios/presenters.priceStream.feature`.

Read `packages/core-contract/scenarios/presenters.priceStream.feature` in full. Every line must read as a sentence. Where one does not, improve the phrase in `phrases.ts` (or the wording in `render.ts`, updating `render.test.ts` to match) and regenerate.

- [ ] **Step 5: Point the registry at the scenarios and delete the imperative suite**

In `packages/core-contract/src/registry.ts`:
- remove `import { describePriceStreamContract } from "#/suites/priceStream";`
- add `import { scenarioSuite } from "#/scenario/suite";` (in import order)
- change the entry to `"presenters.priceStream": scenarioSuite("presenters.priceStream"),`

Delete the file: `git rm packages/core-contract/src/suites/priceStream.ts`

- [ ] **Step 6: Run the package's own tests**

Run: `pnpm --filter @rtc/core-contract test`
Expected: PASS, including all three drift tests (the count pin now matches).

- [ ] **Step 7: Run all three cores on the JSON**

The cores import `@rtc/core-contract` through `dist`, so build it first.

Run: `pnpm --filter @rtc/core-contract build`
Run: `pnpm --filter @rtc/client-core-rxjs test`
Run: `pnpm --filter @rtc/client-core-async test`
Run: `pnpm --filter @rtc/client-core-effect test`
Expected: all three PASS. Read each exit status directly; do not judge from a tail of the output.

If a scenario fails on one core only, the interpreter is doing something the hand-written case did not. Compare the failing scenario's steps with the deleted case (`git show HEAD:packages/core-contract/src/suites/priceStream.ts`) statement by statement. The usual cause is a `settle` the case had and the scenario lacks, or the reverse. Fix the scenario or the interpreter; never the core.

- [ ] **Step 8: Re-run the mutants against the scenario suite**

Run: `node scripts/mutation-check.mts packages/core-contract/mutants/presenters.priceStream.json --keep-going`
Expected: the same 14 rows, all `KILLED`.

Run: `pnpm --filter @rtc/domain build`

A row that was `KILLED` in Step 2 and is `SURVIVED` now means the conversion lost an assertion. Find which statement of the deleted case that mutant broke and restore its equivalent in the scenario. Save the table as `converted-priceStream.txt` in the scratchpad.

- [ ] **Step 9: Prove the runners read the artefact**

Edit `packages/core-contract/scenarios/presenters.priceStream.json` by hand: in the first `"equals": true` change `true` to `false`. Then:

Run: `pnpm --filter @rtc/client-core-rxjs exec vitest run src/composition.coreContract.test.ts -t "presenters.priceStream"`
Run: `pnpm --filter @rtc/client-core-async exec vitest run src/composition.coreContract.test.ts -t "presenters.priceStream"`
Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/composition.coreContract.test.ts -t "presenters.priceStream"`
Expected: each FAILS on "price$(pair) is memoised per pair…".

Run: `pnpm --filter @rtc/core-contract exec vitest run src/scenario/drift.test.ts`
Expected: FAIL — `presenters.priceStream.json: differs from what the authored scenarios emit`.

Restore: `git checkout packages/core-contract/scenarios/presenters.priceStream.json`

If a core's runner file is not named `src/composition.coreContract.test.ts`, find it with `ls packages/client-core-*/src/*coreContract*` and use that path here and in the mutant spec.

- [ ] **Step 10: Check the coverage gates the suites feed**

Run: `pnpm --filter @rtc/client-core-async test:coverage`
Run: `pnpm --filter @rtc/client-core-effect test:coverage`
Expected: both PASS their ≥95% thresholds.

- [ ] **Step 11: Write the format reference `packages/core-contract/scenarios/README.md`**

This is the document a person (or agent) implementing a runner in another language reads instead of the TypeScript. Write it with these sections, taking every definition from the spec and the code in Tasks 1–6:

1. **What these files are** — the contract artefact; generated; `.feature` files are for reading only; `scenario.schema.json` is normative.
2. **File and scenario fields** — the table from spec §1.
3. **Steps** — the table from spec §2, one row per `step` value with its fields, as the schema defines them.
4. **Stream references, reads, matchers** — the three `read` shapes; `equals` / `matches` / `length` / `pattern` with their exact semantics (`matches`: every key in the literal is present and matches, extra keys allowed, arrays compared element by element at equal length).
5. **Values** — the canonical encoding table; `$error`; numbers compare as doubles.
6. **Paths** — the grammar (`.name`, `[n]`, `[-1]`, `[*]`, bare first name), `pick`, and the rule that an unresolved segment fails.
7. **What a runner must guarantee** — compose at the start, tear down at the end; no yield between steps except at `settle` and `advance`; virtual time semantics; what a turn is on its platform (and that the runner's own README must state it); stream identity; the exact-count rule; skips are printed and pinned.
8. **The TypeScript runner's definitions** — fake timers; a turn ends at a microtask checkpoint; identity is `===`.
9. **Regenerating** — `pnpm contract:scenarios`; the drift test.

Every relative link must resolve: run `pnpm check:doc-links`.

- [ ] **Step 12: Update `packages/core-contract/README.md`**

Add a section "Scenario members" after "What's in here": which members are scenario files today (`presenters.priceStream`), where the authored source and the generated files live, the `scenarioSuite` registry entry, how to add a scenario (author → `pnpm contract:scenarios` → pin the count → add phrases), and a link to `scenarios/README.md`. Add rows to the file table for `src/scenario/*`, `src/scenarios/*`, `scenarios/` and `mutants/`. State the new dependency (`ajv`).

- [ ] **Step 13: Gate the final tree and commit**

```bash
pnpm --filter @rtc/core-contract typecheck
pnpm exec eslint packages/core-contract
pnpm exec biome ci .
pnpm check:deps
pnpm check:doc-links
pnpm check:dist
git add -A packages/core-contract
git commit -m "feat(core-contract): presenters.priceStream contract as JSON scenarios (pilot)"
```

- [ ] **Step 14: Run the full local gauntlet before the closing batch**

Run the repo's `/rtc:gauntlet full` (or, by hand: `pnpm typecheck`, `pnpm test`, `pnpm build`, then the lint commands above).
Expected: green. Fix on the branch and re-run until it is.

---

### PR A closing batch

Each line is its own Bash call, run from inside the worktree, back to back.

- [ ] `git push -u origin worktree-native-core-contract`
- [ ] `gh pr create --base main --head worktree-native-core-contract --title "feat(core-contract): language-neutral contract — scenarios as data, priceStream pilot" --body "<body>"` — the body summarises the machinery, lists the classification result, and includes both kill tables (baseline and converted) and the artefact-mutant result.
- [ ] Poll `gh run list --branch worktree-native-core-contract --workflow CI --json status,conclusion,headSha,databaseId --limit 5` until the run whose `headSha` equals `git rev-parse HEAD` is `completed` / `success`. Check code-scanning alerts on the PR before merging.
- [ ] Triage what landed on `origin/main` (shipping-repo-changes Rule 3), then `gh pr merge <n> --merge --subject "Merge PR #<n>: <title>"`.
- [ ] Confirm `MERGED`, fetch, confirm the commit is an ancestor of `origin/main`, then remove the worktree and branch.

---

# PR B — the remaining 12 members

Start on a fresh worktree after PR A is on `main`: `./scripts/new-worktree.sh native-core-contract-members --ready`, then prove it with `pnpm --filter @rtc/core-contract test`.

Every member follows the same recipe. The recipe is repeated in each task so a task can be read alone.

**The conversion recipe (per member):**

1. **Mutant spec first.** Create `packages/core-contract/mutants/<member>.json` with at least one mutant per case, in the format Task 9 shows, each `test` filtered to its case with `-t "<member> .*<distinctive words of the case name>"`. Mutate the RxJS core's file for that member (`packages/client-core-rxjs/src/presenters/…` or `…/machines/…`), `@rtc/core-logic` or `@rtc/domain` where the rule lives; a mutant outside the core's own package rebuilds that package in its `test` command. Where one edit needs an import, use the import-line wrapper shown in Task 9's last two mutants.
2. **Baseline.** `node scripts/mutation-check.mts packages/core-contract/mutants/<member>.json --keep-going` → every row `KILLED` against the imperative suite. Rebuild any package a mutant recompiled. Save the table.
3. **Author** `packages/core-contract/src/scenarios/<name>.ts` with `defineScenarios("<member>", …)`: one `scenario(...)` per `it(...)`, same name, statements translated by the table below. Add it to `SCENARIO_FILES`.
4. **Phrases.** Add a phrase to `PHRASES` for every verb, target, stream, query, machine and seed key the member introduces.
5. **Generate.** `pnpm contract:scenarios`; read the `.feature` file in full and fix any line that does not read as a sentence.
6. **Pin the count** in `SCENARIO_COUNTS`.
7. **Switch the registry** to `scenarioSuite("<member>")` and `git rm` the imperative suite file (or shrink it to its residue; see Task 10).
8. **Run** `pnpm --filter @rtc/core-contract test`, then build it and run all three cores' tests. Read each exit status.
9. **Re-run the mutants.** Every row killed at baseline is still killed. Save the table.

**Translation table (imperative statement → builder call):**

| Imperative | Builder |
|---|---|
| `await withFakeClock(async (clock) => {…})` | `s.given({ time: "virtual" })` as the first call |
| `vi.setSystemTime(NOW)` before `makeHarness` | `now: NOW` in `s.given` |
| `makeHarness({ … })` | `seed: { … }` in `s.given` |
| `collect(h.app.presenters.x.y$)` | `s.subscribe(s.stream.presenters.x.y$)` |
| `collect(h.app.presenters.x.y$(a))` | `s.subscribe(s.stream.presenters.x.y$(a))` |
| `collectTurns(stream)` | `s.subscribe(stream, { countTurns: true })` |
| `c.turnCount()` after `const before = c.turnCount()` | `c.markTurns()` at the `before` point, then `c.turns` |
| `h.app.presenters.x.method(a)` | `s.call.presenters.x.method(a)` |
| `h.app.commands.reconnect()` | `s.call.commands.reconnect()` |
| `h.driver.verb(a)` | `s.drive.verb(a)` |
| `expect(h.driver.query(a))…` | `s.read.query(a)…` |
| `const m = h.machines.f(a)` | `const m = s.machine.f(a)` |
| `m.intents.i(a)` / `collect(m.state$)` / `m.dispose()` | `m.intents.i(a)` / `s.subscribe(m.stream.state$)` / `m.dispose()` |
| `await settle()` / `await clock.settle()` | `s.settle()` |
| `await clock.advance(N)` | `s.advance(N, "<the constant expression>")` |
| `expect(c.values).toEqual(v)` / `.toBe(v)` | `c.values.equals(v)` |
| `expect(c.values.at(-1)).toEqual(v)` | `c.values.at("[-1]").equals(v)` |
| `expect(c.values.at(-1)?.f).toBe(v)` | `c.values.at("[-1].f").equals(v)` |
| `expect(c.values.map((x) => x.f)).toEqual(v)` | `c.values.at("[*].f").equals(v)` |
| `expect(c.values.map((x) => [x.f, x.g])).toEqual(v)` | `c.values.pick("f", "g").equals(v)` |
| `expect(x).toMatchObject(v)` | `….matches(v)` |
| `expect(x).toHaveLength(n)` | `….hasLength(n)` |
| `expect(x).toBeNull()` | `….equals(null)` |
| `expect(x).toMatch(/re/)` | `….matchesPattern("re")` |
| `expect(a$).toBe(b$)` / `.not.toBe(b$)` on streams | `s.identical(a, b).equals(true)` / `.equals(false)` |
| trailing `c.unsubscribe()`, `m.dispose()`, `h.teardown()` in `finally` | omit: the runner releases what is alive. Keep an `unsubscribe` or `dispose` that later statements depend on. |
| a `for` loop driving the port | the same `for` loop around `s.drive…` |

### Task 10: The TypeScript-only residue, and the six untimed presenters

**Files:**
- Create: `packages/core-contract/src/suites/tsOnly.ts`
- Modify: `packages/core-contract/src/suites/currencyPairs.ts` (shrinks to its residue)
- Create: `src/scenarios/{connection,reconnect,currencyPairs,priceHistory,execution,blotter}.ts`, their mutant specs and generated files
- Modify: `src/scenarios/index.ts`, `src/scenario/phrases.ts`, `src/scenario/suite.ts`, `src/registry.ts`, `src/registry.test.ts`
- Delete: `src/suites/{connection,reconnect,priceHistory,execution,blotter}.ts`

**Interfaces:**
- Consumes: everything PR A produced.
- Produces: `TS_ONLY_CASES: readonly { member: string; name: string; reason: string }[]`; `withResidue(member: string, residue: Suite): Suite` (runs the scenario suite, then the residue suite, under the same label).

- [ ] **Step 1: Write `tsOnly.ts` and its test first**

`src/suites/tsOnly.ts`:

```ts
import type { Suite } from "#/harness/harness";
import { scenarioSuite } from "#/scenario/suite";

/** Contract cases that stay hand-written vitest because the scenario format
 * cannot say them. Each needs a reason a reader in another language would
 * accept. The registry test pins the total. */
export const TS_ONLY_CASES: readonly {
  readonly member: string;
  readonly name: string;
  readonly reason: string;
}[] = [
  {
    member: "presenters.currencyPairs",
    name: "pairs$ delivers the roster object itself, not a copy",
    reason:
      "reference identity between an emitted value and a port argument has no meaning in JSON space",
  },
];

/** A member whose contract is a scenario file plus a hand-written residue. */
export function withResidue(member: string, residue: Suite): Suite {
  return (label, makeHarness) => {
    scenarioSuite(member)(label, makeHarness);
    residue(`${label} (TypeScript-only)`, makeHarness);
  };
}
```

Add to `src/registry.test.ts`:

```ts
  it("pins the TypeScript-only cases: at most 6, each with a reason", () => {
    expect(TS_ONLY_CASES.length).toBe(1);
    expect(TS_ONLY_CASES.length).toBeLessThanOrEqual(6);

    for (const entry of TS_ONLY_CASES) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });
```

(import `TS_ONLY_CASES` from `#/suites/tsOnly`). Task 12 raises the pinned `1` to `2`.

- [ ] **Step 2: Convert `presenters.currencyPairs` (2 scenarios + 1 residue case)**

Follow the recipe. The first case's scenario asserts `c.values.hasLength(1)` and `c.values.at("[0]").equals([EURUSD, GBPUSD])`. `src/suites/currencyPairs.ts` shrinks to one case named exactly as in `TS_ONLY_CASES`, holding the `expect(c.values[0]).toBe(roster)` assertion, exported as `describeCurrencyPairsResidue`. Registry entry: `withResidue("presenters.currencyPairs", describeCurrencyPairsResidue)`.

Mutants: (a) the roster is copied before delivery (kills the residue); (b) the stream does not replay to a fresh subscriber; (c) the port is released at zero subscribers.

- [ ] **Step 3: Convert `presenters.connection` (5) and `commands.reconnect` (1)**

Follow the recipe. `commands.reconnect` subscribes to `s.stream.driver.connectionEvents$()`. Phrases needed: `emitConnection`, `failConnection`, `presenters.connection.status$`, `driver.connectionEvents$`, `commands.reconnect`.

Mutants for `connection`: initial status is not CONNECTING; `gatewayDisconnected` is ignored; `reconnectAttempt` maps to the wrong status; a late subscriber gets no current status; the fold survives the last unsubscribe; a failing source is swallowed. For `reconnect`: the command pushes a different event type.

- [ ] **Step 4: Convert `presenters.priceHistory` (5)**

Follow the recipe. `c.values.map(mids)` is `at("[*][*].mid")`; `expect(last).toHaveLength(PRICE_HISTORY_SIZE)` is `c.values.at("[-1]").hasLength(PRICE_HISTORY_SIZE)`; `mids(last)[0]` is `at("[-1][0].mid")`. The calm case is `given({ time: "virtual" })` with `s.advance(PRICE_HISTORY_CONFLATION_MS - 1, "PRICE_HISTORY_CONFLATION_MS − 1")`.

Mutants: not memoised; the window keeps the oldest ticks instead of the newest; the cap is off by one; a burst is delivered over several turns (import-line wrapper); the window is dropped on the last unsubscribe; the port is held after the last unsubscribe; the conflation window is 1 ms too long.

- [ ] **Step 5: Convert `presenters.execution` (5)**

Follow the recipe. The lazy case uses `const buy = s.lookup(s.stream.presenters.execution.execute({...}))`, then `s.read.pendingExecutions().equals([])`, then `s.subscribe(buy)`. `price.ask` and `price.bid` are evaluated in TypeScript and emitted as numbers; give those expectations a note (`"the ask of the price"`).

Mutants: the request is sent at `execute()` instead of on subscribe; Buy uses bid; the dealt currency is the terms currency; a Rejected trade is reported Done; `executions$` replays to a late subscriber; a failed execution also emits on `executions$`.

- [ ] **Step 6: Convert `presenters.blotter` (5)**

Follow the recipe. `newTradeIds$` values are sets: `c.values.equals([[]])`, then `c.values.at("[-1]").equals([2])`. `ids(c.values.at(-1))` is `at("[-1][*].trade.tradeId")`. The clock stamp is `c.values.at("[-1][0].time").matchesPattern("^\\d{2}:\\d{2}:\\d{2}$")`. The cap case keeps its `for` loop and asserts `at("[-1]").hasLength(ACTIVITY_FEED_CAP)`, `at("[-1][0].trade.tradeId")` and `at("[-1][-1].trade.tradeId")`.

Mutants: `trades$` does not replay; the first snapshot marks its trades new; marked ids are not cleared by the next snapshot; the activity feed lists seeded rows; the feed is oldest-first; the cap keeps the oldest; the feed is dropped at zero subscribers.

- [ ] **Step 7: Gate and commit**

```bash
pnpm --filter @rtc/core-contract typecheck
pnpm --filter @rtc/core-contract test
pnpm --filter @rtc/core-contract build
pnpm --filter @rtc/client-core-rxjs test
pnpm --filter @rtc/client-core-async test
pnpm --filter @rtc/client-core-effect test
pnpm exec eslint packages/core-contract
pnpm exec biome ci .
git add -A packages/core-contract
git commit -m "feat(core-contract): six untimed presenters as JSON scenarios; TypeScript-only residue registry"
```

`SCENARIO_COUNTS` after this task: `presenters.priceStream: 10`, `presenters.currencyPairs: 2`, `presenters.connection: 5`, `commands.reconnect: 1`, `presenters.priceHistory: 5`, `presenters.execution: 5`, `presenters.blotter: 5`.

### Task 11: The four machines

**Files:**
- Create: `src/scenarios/{staleFlag,notional,rowHighlight,tileExecution}.ts`, their mutant specs and generated files
- Modify: `src/scenarios/index.ts`, `src/scenario/phrases.ts`, `src/scenario/suite.ts`, `src/registry.ts`
- Delete: `src/suites/{staleFlag,notional,rowHighlight,tileExecution}.ts`

**Interfaces:**
- Consumes: everything PR A produced; the recipe and translation table above.
- Produces: scenario files for `machines.staleFlag` (3), `machines.notional` (4), `machines.rowHighlight` (3), `machines.tileExecution` (7).

- [ ] **Step 1: Convert `machines.staleFlag` (3)**

Follow the recipe. Keep the settle between a connection event and a price tick exactly where the cases have it (their comments explain why). The third case keeps `c.unsubscribe(); m.dispose();` mid-scenario, then subscribes again as `fresh`.

Mutants: starts stale; the first CONNECTED is not treated as a reconnect; a price does not clear the flag; an idle disconnect is not a disconnect; the machine keeps folding after dispose.

- [ ] **Step 2: Convert `machines.notional` (4)**

Follow the recipe. The first case creates two machines (`m1`, `m2`). `expect(r.values[0]?.isRfq).toBe(true)` is `r.values.at("[0].isRfq").equals(true)`.

Mutants: the RFQ threshold is off; `k` expands like `m`; the default is not marked; a parse failure clears the raw input; max-exceeded drops the value; `reset()` keeps the last value; the machine keeps folding after dispose.

- [ ] **Step 3: Convert `machines.rowHighlight` (3)**

Follow the recipe. Every scenario is `given({ time: "virtual" })`; `s.advance(BLOTTER_ROW_HIGHLIGHT_MS - 1, "BLOTTER_ROW_HIGHLIGHT_MS − 1")` then `s.advance(1, "the highlight ends")`.

Mutants: the highlight lasts 1 ms longer; a row that is not new starts highlighted; the timer survives dispose.

- [ ] **Step 4: Convert `machines.tileExecution` (7)**

Follow the recipe. `PRICE` is `createPrice("EURUSD", 1.1)`; `Direction.Buy` and the trade from `createTrade(...)` are emitted as literals. `statuses(c.values)` is `at("[*].status")`. The Rejected case's narrowing becomes `c.values.at("[-1].status").equals("finished")` and `c.values.at("[-1].executionStatus").equals(ExecutionStatus.Rejected)`. `h.driver.pendingExecutions().map((r) => r.notional)` is `s.read.pendingExecutions().at("[*].notional")`. Advance notes name the constants (`"TOO_LONG_THRESHOLD_MS − 1"`, `"EXECUTION_TIMEOUT_MS − TOO_LONG_THRESHOLD_MS"`, `"CONFIRMATION_DISMISS_MS"`).

Mutants: the confirmation dismisses 1 ms late; a Rejected trade finishes as Done; a failing command lands in the `timeout` state instead of `finished{Timeout}`; `tooLong` fires 1 ms early; a late result after timeout is accepted; finishing does not cancel the escalation; `dismiss()` leaves a timer running; a second `execute()` does not withdraw the first request; a disposed machine still sends a request.

- [ ] **Step 5: Gate and commit**

The same commands as Task 10 Step 7, with the message `feat(core-contract): the four FX machines as JSON scenarios`.

`SCENARIO_COUNTS` gains `machines.staleFlag: 3`, `machines.notional: 4`, `machines.rowHighlight: 3`, `machines.tileExecution: 7`.

### Task 12: `presenters.auth` and `transportGate`

**Files:**
- Create: `src/scenarios/{auth,transportGate}.ts`, their mutant specs and generated files
- Modify: `src/scenarios/index.ts`, `src/scenario/phrases.ts`, `src/scenario/suite.ts`, `src/registry.ts`, `src/registry.test.ts`, `src/index.ts`, `src/suites/tsOnly.ts`
- Modify: `src/suites/transportGate.ts` (shrinks to its residue)
- Delete: `src/suites/auth.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: scenario files for `presenters.auth` (14) and `transportGate` (4); `describeTransportGateResidue: Suite`.

- [ ] **Step 1: Convert `presenters.auth` (12 cases → 14 scenarios)**

Follow the recipe. Every scenario starts `s.given({ time: "virtual", now: NOW, … })`, with `seed: { session: createSession(NOW + 1) }` where the case seeds one. `NOW`, `DEMO`, `SIGNED_OUT`, `NEXT_VARIANT` and `createSession` move into the scenario file unchanged.

Two cases build two harnesses and become two scenarios each, named:

- "lock is ignored while signed out" and "lock locks a signed-in session"
- "unlock with nobody signed in from the start makes no login call" and "unlock after logout makes no login call"

`expect(h.driver.storedSession()?.token).toBe("tok-2")` is `s.read.storedSession().at(".token").equals("tok-2")`. `expect(h.driver.storedSession()).toBeNull()` is `s.read.storedSession().equals(null)`. `h.driver.portCalls("auth.login")` is `s.read.portCalls("auth.login")`. Seed phrase needed: `session`.

Mutants: an unexpired session is not resumed; a session expiring exactly now is resumed; a successful login does not write the session; the wait treatment does not advance per attempt; a pinned style still advances the cycle; "invalid" and "unavailable" show the same error line; `lock()` works while signed out; a failed unlock clears `locked`; a successful unlock does not rewrite the session; `unlock()` with nobody signed in calls the port; `logout()` keeps the stored session; a second successful login signs the user out.

- [ ] **Step 2: Convert `transportGate` (4 scenarios + 1 residue case)**

`transportGate` is not a `CONTRACT_SUITES` member. Its scenario file's member is `"transportGate"`. In `src/index.ts`, `describeCoreContract` replaces `describeTransportGateContract(label, makeHarness)` with:

```ts
  scenarioSuite("transportGate")(`${label} :: transportGate`, makeHarness);
  describeTransportGateResidue(`${label} :: transportGate`, makeHarness);
```

The first scenario keeps the two `transportCalls` expectations and drops the `h.app.ports.transport?.connect()` tail. `src/suites/transportGate.ts` shrinks to one case, "the app exposes the transport it was given", exported as `describeTransportGateResidue`, holding that tail. Add its `TS_ONLY_CASES` entry with the reason "asserts the shape of the TypeScript App object (app.ports), not behaviour a subscriber observes", and raise the pin in `registry.test.ts` from 1 to 2. Keep the public export `describeTransportGateContract` only if a core's runner imports it by name (`grep -rn describeTransportGateContract packages/*/src`); if one does, update that import in the same commit.

Seed phrases needed: `transport`. Mutants: composition with no session connects; a resumed session connects twice; authenticating opens the socket; logout does not disconnect; lock reconnects the transport.

- [ ] **Step 3: Gate and commit**

The same commands as Task 10 Step 7, with the message `feat(core-contract): auth and the transport gate as JSON scenarios`.

`SCENARIO_COUNTS` gains `presenters.auth: 14`, `transportGate: 4`. The total across all members is 68.

### Task 13: Proof, documentation, status

**Files:**
- Modify: `packages/core-contract/README.md`, `packages/core-contract/scenarios/README.md`
- Modify: `docs/architecture/22-pluggable-application-core.md`
- Modify: `CLAUDE.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: The artefact mutant, once for the whole set**

For three files of different kinds (`machines.tileExecution.json`, `presenters.auth.json`, `transportGate.json`): change one expected literal by hand, run each core's runner filtered to that member, confirm all three fail, and restore with `git checkout`. Record the nine results for the PR description.

- [ ] **Step 2: Coverage gates**

Run: `pnpm --filter @rtc/client-core-async test:coverage`
Run: `pnpm --filter @rtc/client-core-effect test:coverage`
Expected: both pass ≥95%.

- [ ] **Step 3: Documentation**

- `packages/core-contract/README.md`: the "Scenario members" section lists all 13; describe `TS_ONLY_CASES` and `withResidue`.
- `docs/architecture/22-pluggable-application-core.md`: in the section on the behavioural tier, add that 13 FX-slice members are scenario files replayed from JSON, why (a core in another language), and link `packages/core-contract/scenarios/README.md`. Verify any new anchor with the real `github-slugger`.
- `CLAUDE.md`: in the `core-contract/` package-structure entry, add one sentence: the FX slice's members are JSON scenarios under `scenarios/` (authored in `src/scenarios/`, regenerated with `pnpm contract:scenarios`, kept in sync by the package's drift test), and the package now depends on `ajv`. Add `pnpm contract:scenarios` to the Build Commands block.
- `docs/STATUS.md`: delete the "Native mobile experiment, step 1" entry from "Designed, not built". Add under "Optional / next step (no plan file yet)": the wire-contract spec, the iOS slice (step 2), and approach B as a differential tier, each one line, no link. Bump "Last updated".

Run: `pnpm check:doc-links`
Expected: passes.

- [ ] **Step 4: Full gauntlet, then commit**

Run `/rtc:gauntlet full`. Then:

```bash
git add -A
git commit -m "docs: the FX slice's core contract is JSON scenarios (native mobile experiment, step 1)"
```

### PR B closing batch

Each line is its own Bash call, from inside the worktree.

- [ ] `git push -u origin worktree-native-core-contract-members`
- [ ] `gh pr create --base main --head worktree-native-core-contract-members --title "feat(core-contract): the FX slice's 13 members as JSON scenarios" --body "<body>"` — the body carries every member's baseline and converted kill tables, the artefact-mutant results, and any existing-suite survivors found.
- [ ] Poll CI by `headSha` until green; check code scanning; triage `origin/main`; merge with `--merge`.
- [ ] Confirm on `origin/main`, then remove the worktree and branch.
