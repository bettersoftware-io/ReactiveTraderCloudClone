# Language-neutral core contract (scenarios as data) — design

**Date:** 2026-10-05 · **Status:** approved 2026-10-05; amended the same day by the plan's classification of the 66 cases (the `lookup` step, the `pattern` matcher, author-declared `time`, schema-backed parsing)
**Plan:** [the implementation plan](../plans/2026-10-05-language-neutral-core-contract.md)
**Workstream:** native mobile experiment, step 1 of 3.
**Builds on:** [the pluggable application core](../../architecture/22-pluggable-application-core.md) (§22) and its behavioural tier, `@rtc/core-contract`.

## Intent

**What the user asked for.** After React vs Solid (one core, two view
layers) and RxJS vs async vs Effect (one UI, three cores), go one level
further and try what Shopify did in 2026: rebuild a React Native app as
native Swift and Kotlin, with coding agents doing the porting and a shared
verification suite proving the result
([Shopify's write-up](https://shopify.engineering/back-to-native)).

**Why this step comes first.** A native client can import none of the
TypeScript core, so the core is rewritten per platform. Today nothing could
witness such a core: `@rtc/core-api` is TypeScript types and
`@rtc/core-contract` is a vitest suite. Shopify's two enablers were a
verification suite shared across languages and business logic that runs
headless on the desktop. This step builds the first for this repo.

**Decided with the user (2026-10-05):**

- **The experiment is an iOS-first vertical slice** (login, FX tiles, trade
  ticket, blotter), not a full port. React Native stays as the reference
  client.
- **Step 1 covers the slice's members only.** The other suites stay
  vitest-only until a native client needs them.
- **Approach A: scenarios as data.** The slice's contract cases become
  declarative scenarios in JSON, replayed by one interpreter per language.
  Recorded traces (approach B) are kept on file as an alternative and a
  possible later add-on; see [Alternatives considered](#alternatives-considered).
- **Scenarios are authored in typed TypeScript and emitted to JSON.** The
  TypeScript is the authored source. The JSON is the contract artefact: the
  only thing any runner reads.
- **A Gherkin rendering is generated from the same source**, for people to
  read. Nothing parses or executes it.

**Success looks like:**

1. The three TypeScript cores pass the slice's contract by replaying the
   committed JSON files, with the imperative suites for those members
   deleted.
2. Every mutant the old imperative suite killed is still killed.
3. Changing one expected literal in a JSON file turns all three cores red.
4. The format is defined well enough (a reference document plus a JSON
   Schema) that a runner can be written in Swift without reading any
   TypeScript.

**Out of scope:**

- Any Swift or Kotlin code. That is step 2 (the iOS slice), with its own
  spec.
- The wire contract (DTO schemas and frame fixtures for a native
  `WsAdapter`). Independent of this work; its own short spec.
- The 60 suite files outside the slice, which include the cross-member
  `portDiscipline` and `dispose` suites. `transportGate` is in.
- Approach B's recorded traces.

## What exists today

`@rtc/core-contract` holds 377 vitest cases in 73 suite files. Each core has
one runner file that builds a `CoreHarness` (`app`, `machines`, `driver`,
`teardown`) and calls `describeCoreContract`. A case interleaves three kinds
of statement:

- **inputs:** a `ScriptedDriver` verb (`h.driver.tickPrice(tick)`), a
  presenter method (`auth.login(...)`) or a machine intent
  (`m.intents.execute(...)`);
- **waits:** `settle()`, or under `withFakeClock`, `clock.settle()` and
  `clock.advance(ms)`;
- **assertions:** on values gathered by `collect(stream)`, or on a driver
  query (`h.driver.pendingExecutions()`), often through a projection such as
  `c.values.map(mid)`.

The slice is 13 suites and 66 cases (measured 2026-10-05):

| Suite | Cases | Virtual time | Turn counts | Identity checks |
|---|---|---|---|---|
| `presenters.auth` | 12 | 12 | | |
| `presenters.connection` | 5 | | | |
| `commands.reconnect` | 1 | | | |
| `transportGate` (cross-member) | 4 | 4 | | |
| `presenters.currencyPairs` | 2 | | | |
| `presenters.priceStream` | 10 | 3 | 2 | 2 |
| `presenters.priceHistory` | 5 | 1 | 1 | 2 |
| `machines.staleFlag` | 3 | | | |
| `machines.tileExecution` | 7 | 7 | | |
| `machines.notional` | 4 | | | |
| `presenters.execution` | 5 | | | |
| `presenters.blotter` | 5 | | | |
| `machines.rowHighlight` | 3 | 3 | | |
| **Total** | **66** | **30** | **3** | **4** |

The React Native client today reaches a subset of these (`auth`,
`connection`, `currencyPairs`, `priceStream`, `tileExecution`, `notional`,
`blotter`, plus `powerSaver`). The slice here is the FX vertical as the
contract defines it; step 2 decides which members the Swift core implements,
and [skips are counted](#skips-are-never-silent).

Two findings from reading the suites:

- **Slice suites reach outside the slice.** `priceStream` cases call
  `presenters.powerSaver.setLevel("calm")`, and `auth` reads
  `presenters.loginWaitPreferences`. The emitter records which members each
  scenario touches.
- **The assertion vocabulary is small.** The 13 suites use `toEqual`,
  `toBe`, `toMatchObject`, `toHaveLength` and `toBeNull`, and no other
  matcher.

## Design

### 1. The artefact

One JSON file per member in `packages/core-contract/scenarios/`, outside
`src/` like the `@rtc/ui-contract` goldens, with its Gherkin rendering
beside it:

```
packages/core-contract/scenarios/
  scenario.schema.json
  presenters.priceStream.json
  presenters.priceStream.feature
  machines.tileExecution.json
  machines.tileExecution.feature
  …
```

A file holds its member's scenarios. The example is abbreviated: a real
file carries every field of each value.

```json
{
  "formatVersion": 1,
  "member": "presenters.priceStream",
  "scenarios": [
    {
      "name": "each tick is enriched with movement against the previous mid",
      "touches": ["presenters.priceStream"],
      "steps": [
        { "step": "subscribe", "as": "c",
          "from": { "stream": "presenters.priceStream.price$", "args": [{ "symbol": "EURUSD", "ratePrecision": 5, "pipsPosition": 4 }] } },
        { "step": "expect", "read": { "collector": "c", "field": "values" }, "equals": [] },
        { "step": "drive", "verb": "tickPrice", "args": [{ "symbol": "EURUSD", "bid": 1.09995, "ask": 1.10005, "mid": 1.1, "valueDate": "2026-01-03", "creationTimestamp": 0 }] },
        { "step": "settle" },
        { "step": "expect", "read": { "collector": "c", "field": "values" },
          "pick": ["mid", "movementType"],
          "equals": [[1.1, "NONE"]] }
      ]
    }
  ]
}
```

Scenario-level fields:

| Field | Meaning |
|---|---|
| `name` | Unique within the member. Every runner uses it as the test name. |
| `touches` | The contract members the steps reach. Derived by the emitter, never written by hand. |
| `seed` | Optional. State the world must hold before the app is composed (today's `HarnessSeed`). |
| `time` | `"virtual"` when the scenario runs on a clock the runner controls. Declared by the author; required when the scenario uses `advance` or `now`. |
| `now` | Optional, virtual time only. The wall clock in epoch milliseconds at composition. |

The app is composed at the start of every scenario and torn down at its
end, whatever happened. Teardown is the runner's job and is not a step.

### 2. Steps

| `step` | Fields | Meaning |
|---|---|---|
| `drive` | `verb`, `args` | Call one scripted-port verb (the `ScriptedDriver` vocabulary). |
| `call` | `target`, `args` | Call a presenter method, a command, or a machine intent. |
| `machine` | `as`, `factory`, `args` | Create a machine instance under an alias. |
| `dispose` | `of` | Dispose a machine. |
| `lookup` | `as`, `stream`, `args?` | Name a stream under an alias without subscribing to it. |
| `subscribe` | `as`, `from`, `countTurns?` | Start collecting a stream's values and errors under an alias. `from` is a stream reference. |
| `unsubscribe` | `of` | Stop collecting. |
| `settle` | | Let everything the core has scheduled that needs no passage of time finish. |
| `advance` | `ms`, `note?` | Move virtual time forward and run everything that falls due, in order. |
| `markTurns` | `of` | Reset a collector's turn count to zero. |
| `expect` | `read`, `path?`, `pick?`, one matcher, `note?` | Read something, optionally project it, compare with a literal. |

A `target` or `stream` is a dotted path whose first segment is
`presenters`, `commands`, `driver`, or a machine alias
(`presenters.auth.login`, `m.intents.execute`, `m.state$`,
`driver.connectionEvents$`).

A stream reference is either inline, `{ "stream": path, "args"?: [...] }`,
or `{ "ref": alias }` for a stream an earlier `lookup` step named. `lookup`
exists because one case asserts that nothing happens between obtaining a
stream and subscribing to it (`execution`: "the port sees a request only
once the result is subscribed").

An `expect` reads one of three things:

- `{ "collector": "c", "field": "values" | "errors" | "turns" }`
- `{ "driver": "pendingExecutions", "args": [] }`, a scripted-port query
- `{ "identical": [streamRef, streamRef] }`, whether two lookups return the
  same stream object

and applies exactly one matcher: `equals` (deep equality), `matches` (every
key in the literal is present and deeply equal; extra keys are allowed),
`length`, or `pattern` (the value is a string matching a regular
expression; one `blotter` case checks a clock stamp this way).

**The vocabulary grows only on evidence.** All 66 cases were classified
against this table while the plan was written. A step kind or matcher is
added only when a named case needs it; `lookup` and `pattern` were added
that way.

**Steps between two waits run in one turn.** A runner must not yield
between steps except at `settle` and `advance`. Several contract cases
depend on this: a burst is six `drive` steps in a row, and "a late
subscriber gets the current value synchronously" is a `subscribe` followed
at once by an `expect`.

### 3. Values

**Arguments and expectations are fully literal.** Fixture helpers
(`createTick`, `EURUSD`) and domain constants (`CONFIRMATION_DISMISS_MS - 1`)
are evaluated when the JSON is emitted. No other language ports a fixture
library, and a core that hard-codes a wrong constant fails a scenario. An
`advance` or `expect` step may carry a `note` naming where a number came
from; runners ignore it and the Gherkin rendering prints it.

**Comparison happens in JSON space.** A runner encodes what it observed
into a canonical form, then compares structurally:

| Observed | Canonical form |
|---|---|
| a set | an array, in iteration order |
| a map | an array of `[key, value]` pairs, in iteration order |
| an error | `{ "$error": "<message>" }` |
| an absent or undefined property | omitted |
| a number | a JSON number, compared exactly as a double; `NaN` and infinities are not allowed and fail emission |

The same `{ "$error": … }` form carries an error into a `drive` step
(`failPrice`); the runner turns it into its native error.

**Projection.** `path` is a small grammar: `.name`, `[n]`, `[-1]` and
`[*]` (which maps the rest of the path over an array). `pick` is a list of
paths applied to each element of an array, or to a single value, giving a
tuple per element.

**Two rules against silent passes:**

- A `path` or `pick` that resolves to nothing fails the step. It never
  compares "missing" with "missing".
- A runner asserts the exact number of scenarios per member, so an empty or
  missing file fails.

### 4. Three meanings each runner must define

The format names these; each runner states its concrete definition in its
own README.

| Concept | Cases | The format's definition | The TypeScript runner |
|---|---|---|---|
| Virtual time | 30 | `advance(n)` moves the core's clock by n ms and runs everything due, in order. `settle` never moves time. `now` is the wall clock at composition. | vitest fake timers, as `withFakeClock` does today. Scenarios without `time` keep the real `settle()`. |
| Turn count | 3 | A turn is one opportunity for the UI to render. A collector with `countTurns` reports how many turns delivered at least one value. | A turn ends at the next microtask checkpoint, as `collectTurns` does today. |
| Stream identity | 4 assertions | Two lookups return the same stream object. | Reference equality. |

A consequence for every future core: time must be injectable. The contract
defines timer behaviour only against a clock the runner controls.

The TypeScript runner does not change what the three cores are tested
under. A scenario that ran on real timers still does.

### Skips are never silent

A later runner may lack a step kind (a runtime with no reference identity
for streams) or a member in `touches`. It must print the name of every
scenario it skips and pin the count in its own source. The TypeScript
runner supports everything and asserts zero skips.

### 5. Authoring

Scenarios are written in `packages/core-contract/src/scenarios/<member>.ts`
with a recording builder. It is typed against `Presenters`,
`MachineFactories` and `ScriptedDriver`, so a wrong member, verb or
argument type is a compile error. It records steps and executes nothing:

```ts
scenario("each tick is enriched with movement against the previous mid", (s) => {
  const c = s.subscribe(s.stream.presenters.priceStream.price$(EURUSD));
  c.values.equals([]);
  s.drive.tickPrice(createTick("EURUSD", 1.1));
  s.settle();
  c.values.pick("mid", "movementType").equals([[1.1, PriceMovementType.NONE]]);
});
```

The builder separates what names a stream (`s.stream.…`, which records
nothing) from what acts (`s.call.…`, `s.drive.…`), because at run time a
recorded call cannot tell the two apart. Scenario options (`time`, `now`,
`seed`) are given by a first call, `s.given({...})`.

Paths inside `at(...)` and `pick(...)` are plain strings. They are checked when the
scenario is replayed, by the rule that an unresolved path fails.

The cost of this choice is that adding a scenario needs the TypeScript
toolchain. That is accepted while TypeScript holds the reference cores.

### 6. Emission and the drift check

One pure function turns the authored scenarios into every output file's
content (JSON and Gherkin). Two things use it:

- **A regenerate command** (`pnpm contract:scenarios`) writes the files.
- **A drift test** inside `@rtc/core-contract`'s own vitest suite, beside
  `registry.test.ts`, re-emits in memory and fails when a committed file
  differs or is missing, or when an unexpected file sits in `scenarios/`.
  It also validates every emitted JSON file against
  `scenario.schema.json`.

The drift test runs wherever `pnpm test` runs, which is CI and
`/rtc:gauntlet full`. (The conversation proposed a separate
`check:contract-scenarios` gate; a test in the package is the repo's
existing pattern for this and needs no new CI step.)

Schema validation needs a validator. The repo has none today, so `ajv`
becomes a dependency of `@rtc/core-contract`. It is a runtime dependency
of that (dev-only) package, because the parser every runner uses validates
with the schema rather than with a second, hand-written definition.

The regenerate command builds the package first and runs the emitter from
`dist`, since the source uses `#/` imports that plain `node` cannot
resolve.

### 7. The TypeScript runner

`CONTRACT_SUITES` points each converted member at `scenarioSuite(member)`.
That suite reads the member's JSON **from disk**, validates it against the
schema (an unknown step kind or an unknown key is an error) and interprets
each scenario against a `CoreHarness`. It does not import the authored
TypeScript, so the three cores replay the same bytes a Swift runner will
read.

The three core runner files do not change. `describeCoreContract` still
runs everything.

A converted member's imperative suite file is deleted in the same change
that lands its scenarios.

### 8. Cases the vocabulary cannot express

A case that does not fit stays in vitest. Its member's suite file shrinks
to those cases, and a `TS_ONLY_CASES` registry lists each with a reason and
pins the total. The registry runs both the scenario suite and the residue
for that member.

**Stop rule:** if the classification puts more than 6 of the 66 cases (10%)
in the TypeScript-only set, work stops before any rewrite and the
vocabulary is revisited with the user.

**Result (2026-10-05):** 2 residue cases, and 68 scenarios from the 66
cases.

- `currencyPairs` asserts that the emitted roster is the very object the
  port delivered. Reference identity of a value has no meaning in JSON
  space; the scenario asserts deep equality and the identity check stays in
  vitest.
- `transportGate` asserts that `app.ports.transport` is the transport the
  app was given. That is the shape of the TypeScript `App` object, not
  behaviour a subscriber observes.
- Two `auth` cases each build two apps. A scenario has one, so each becomes
  two scenarios.

### 9. The Gherkin rendering

`<member>.feature` is generated beside each JSON file and covered by the
same drift test.

```gherkin
Feature: presenters.priceStream

  Scenario: each tick is enriched with movement against the previous mid
    Given a subscriber to the EURUSD price stream
    Then it has received nothing
    When the price feed ticks EURUSD at 1.1
    And the core settles
    Then it has received, as mid and movement:
      | 1.1 | NONE |
```

- **Mapping.** A seed and the first subscriptions render as `Given`;
  `drive`, `call`, `advance` and `settle` as `When`; `expect` as `Then`.
- **A phrase per verb, target and stream.** `tickPrice` renders as "the
  price feed ticks {symbol} at {mid}". A missing phrase fails emission, so a
  raw identifier never reaches the output.
- **Large values are summarised** (a trade renders as its id, pair and
  status). The JSON remains the complete record.
- **Notes are printed**, so `4999` reads "4999 ms (CONFIRMATION_DISMISS_MS − 1)".
- **Nothing parses it.** No step definitions exist in any language.

Who it serves: a developer or a technical product person reads all of it
easily. A non-developer follows the trading cases (execute, reject,
timeout) but not the plumbing ones (memoisation, teardown, one-turn
delivery).

### 10. Units

| Unit (`packages/core-contract/src/scenario/`) | Does | Depends on |
|---|---|---|
| `format.ts` | The types of the JSON: file, scenario, step, matcher. | nothing |
| `encode.ts` | Canonical encoding of observed values; decoding of `$error` arguments. | `format` |
| `path.ts` | Parses and applies `path` / `pick`. | nothing |
| `builder.ts` | The typed recording builder. | `format`, `@rtc/core-api` types |
| `parse.ts` | Reads a scenario file and validates it against the schema. | `format`, `ajv` |
| `interpret.ts` | Runs one parsed scenario against a `CoreHarness`. | `parse`, `encode`, `path`, the harness |
| `suite.ts` | `scenarioSuite(member)`: reads the file, declares one vitest case per scenario. | `interpret` |
| `render.ts` + `phrases.ts` | Scenario → Gherkin text, and the phrase table it needs. | `format` |
| `emit.ts` | All authored scenarios → a map of file name to content; and the drift comparison. | `render` |
| `write.ts` | Writes the emitted files. Run from `dist`. | `emit` |

Each unit except `suite.ts` and `write.ts` has its own unit tests. The
interpreter's tests run against a small fake harness, not a real core.

`@rtc/core-contract` keeps its dependency rule: `@rtc/core-api`,
`@rtc/domain` and `rxjs`, never a core.

## Proving it

**The conversion is faithful.** Per member, with the existing
`scripts/mutation-check.mts`:

1. Before converting, write a mutant spec against the core's source with at
   least one mutant per case, and record that the imperative suite kills
   each one.
2. After converting, run the same spec against the scenario suite. Every
   mutant killed before must still be killed.

Mutant specs are committed under `packages/core-contract/mutants/`, so the
kill table can be reproduced. A mutant in a package the core reads through
`dist` (`@rtc/core-logic`) needs that package rebuilt inside the mutant's
test command.

**The runner reads the artefact.** Change one expected literal in a
committed JSON file and run each core's runner: all three must fail. This
is run once per batch and recorded in the PR.

**The gates that already exist still hold.** The ≥95% coverage gates on
`@rtc/client-core-async` and `@rtc/client-core-effect` are fed by these
suites and must pass after every batch.

## Delivery

Two pull requests, in order:

1. **Machinery and pilot.** The units in §10; the drift test and schema;
   one member converted end to end: `presenters.priceStream`, because it
   alone exercises virtual time, turn counts and identity; the format
   reference (`packages/core-contract/scenarios/README.md`), written for
   someone implementing a runner in another language; the
   `@rtc/core-contract` README.
2. **The remaining 12 members**, in three batches, each with its kill
   tables; then architecture §22, `CLAUDE.md` where it describes the
   contract tier, and `docs/STATUS.md`.

## Risks

- **The interpreter changes timing.** Hand-written cases run several
  statements in one turn by construction. The interpreter must do the same
  (§2). The burst and replay cases in the pilot are the witnesses.
- **The vocabulary is too small.** Bounded by the classification and the
  stop rule in §8.
- **Literal JSON is verbose.** A file of full trade objects is long. That
  is the price of needing no fixture library elsewhere; the Gherkin
  rendering is the readable view.
- **The turn count is the least portable concept.** Its meaning on a
  platform with a different scheduler is that platform's decision. The
  format only names the promise (§22 guarantee 5).

## Alternatives considered

### B. Recorded traces (kept on file)

Keep the vitest suites. Instrument the harness to log every action and
every value each collector receives, export that log from the RxJS core,
and have other runners replay the actions and compare the whole log.

- **For:** no rewrite; the suites stay readable TypeScript; a new runner
  gets a contract for all 377 cases at once.
- **Against:** it over-specifies. The suites leave things unasserted on
  purpose (`priceStream` notes that a pending trailing value "is
  uncontracted"), and a full recording pins whatever RxJS emitted there, so
  it needs masks. Expected values come from an implementation, not a
  specification. The suite and the trace are two sources that can drift.
- **Where it could return.** A full recording is a differential
  instrument: replayed across the three cores, it would show behaviour they
  disagree on that no suite asserts. That is a possible later add-on beside
  the scenarios, not a replacement for them.

### C. Hand-ported suites

An agent translates each vitest suite into XCTest with the TypeScript
version as reference. No infrastructure, and the tests are idiomatic in
each language. Rejected because nothing mechanical witnesses that the
Swift test asserts the same thing, and it drifts whenever a TypeScript
suite changes.

### D. Hand-authored JSON as the source

Truly language-neutral authoring, with no emitter and no drift test.
Rejected because it loses compile-time checking of member names, verbs and
argument types, and every case would repeat full literal values by hand.

### E. Gherkin as the executable source

Rejected because each language would need step definitions that parse
prose, which is the glue the JSON format exists to avoid.

## Follow-ups

- **The wire contract:** JSON Schemas for the `@rtc/shared` DTOs and frame
  fixtures exported as JSON, for a native `WsAdapter`.
- **Step 2, the iOS slice:** a Swift core and SwiftUI client for login, FX
  tiles, ticket and blotter, gated by a Swift scenario runner and the
  existing Maestro flows; then measured against the React Native client.
- **Approach B as a differential tier** across the three TypeScript cores.
