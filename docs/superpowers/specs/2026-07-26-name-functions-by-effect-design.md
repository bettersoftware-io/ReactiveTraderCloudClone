# `rtc/name-functions-by-effect` — design

**Status:** approved, not yet implemented
**Date:** 2026-07-26

## Problem

The repo has ~185 function values named after the occasion that triggers them
rather than the effect they produce — `handleClick`, `handleApply`,
`connectionLog.onConnect()`. Two costs, both raised by the repo owner:

1. **The contract isn't defined by the name.** "It's called when connected, but
   then what does it *really* do? That forces me to dig into the
   implementation." A name that states only its trigger pushes every reader
   into the body.
2. **It couples the function to one caller.** `onClick={handleClick}` reads
   fine until the same effect is needed from a second trigger, at which point
   `onEnterKey={handleClick}` is actively misleading.

This is a naming law the team has been enforcing by review, repeatedly and by
hand. This spec makes it a lint rule so the cost is paid once.

## The criterion — slot vs concrete handler

The rule rests on a distinction between two roles that the `on`/`handle`
prefixes currently blur:

> A **slot** is a placeholder for an event where a concrete handler can be
> attached — React component props, or an API contract where consumers attach
> their handlers. There we *cannot* give concrete intention-revealing names by
> design: we don't know what will be attached, and we must not know. That's
> decoupling.
>
> A **concrete handler** actually does something concrete, so it must have an
> intention-revealing name — we need a hint about what that something is.

The canonical illustration:

```tsx
<Car onYellowLight={prepare} onRedLight={stop} onGreenLight={goAhead} />   // ✅
<Car onYellowLight={handleYellowLight} … />   // ❌ handler says nothing
<Car prepare={prepare} stop={stop} … />       // ❌ slot now dictates the parent's intent
```

Collapsing either half loses information. The slot names the event; the handler
names the effect.

### The discriminator

Slot and handler are told apart by **which way the function flows**:

- A **slot** receives a function — its type *is* a function type, or its sole
  parameter is one. `onX` is correct here.
- A **handler** receives event data (or nothing) and *is* the thing that runs.
  `onX` / `handleX` is a defect here.

This is syntactic and needs no type checker. Worked examples from this repo:

```ts
interface TicketProps   { onBuy: () => void }                 // fn-typed prop     → SLOT,    legal
interface ExecutionApi  { onTrade(cb: TradeListener): void }   // sole param is fn  → SLOT,    legal
interface BlotterApi    { onSort(f: SortField): void }         // data param        → HANDLER, flag
interface ConnectionLog { onConnect(): void }                  // no param, is run  → HANDLER, flag
```

The pair that motivates it, both in `@rtc/domain`, same prefix, opposite roles:

```ts
// ExecutionSimulator.ts:32 — an attach point. Consumers pass their intent IN.
onTrade(listener: TradeListener): void { this.listeners.push(listener); }

// EquityPositionSimulator.ts:28 — the attached thing. Data comes in; it runs.
onFill(fill: FillEvent): void {
  lot.qty += signed; lot.cost += …;            // updates lots + cost basis
  this.marks.set(fill.symbol, fill.price);
  this.ensureMarking(fill.symbol); this.recompute();
}
```

`EquityOrderSimulator` already names its slot correctly (`listener?: OrderListener`),
and `portFactory.ts:144` attaches `positionsSim.onFill` to it.
The codebase got the slot half right and the handler half wrong, in the same
wiring expression.

## Rule identity

| | |
|---|---|
| id | `rtc/name-functions-by-effect` |
| file | `eslint-rules/name-functions-by-effect.mjs` |
| export | `nameFunctionsByEffect` |
| type | `suggestion`, no autofix (a name cannot be synthesised) |
| schema | `[]` — the word lists are rule constants, not config |

The name states the prescription, not the prohibition, because a rule that only
forbade shapes would be satisfied by `processClick`. It also had to survive the
vacuous-verb widening: `no-trigger-named-functions` was rejected because
`processTrade` is flagged and is not trigger-named.

`meta.docs.description`:

> Require function names to state their effect — what the function does, to what
> — not the occasion that triggers it. Forbids `on*`/`handle*` and vacuous verbs
> (`process*`, `do*`, `perform*`, `manage*`) on concrete handlers, while leaving
> slots (function-typed props, attach points) alone.

`messages.nameByEffect`:

> '{{name}}' names its trigger, not its effect. Name it for what it does, to
> what — an effect verb plus a **domain** noun, never an event noun. A name that
> states its effect also survives being wired to a different trigger:
> `handleClick` → `dismissTicket`; `processClick` → `dismissTicket` (still an
> event noun); `handleKeyDown` → `blurNotionalOnEnter`; `onMessage` →
> `emitParsedFrame`; `onConnect` → `recordConnect`; `frameCallback` →
> `drawFrame`. If this name refers to a *slot* consumers attach to — a
> function-typed prop, or a method whose parameter is a callback — it is not a
> handler and the rule will not fire; check the shape.

## Detectors

Three forbidden shapes on **concrete handlers only**:

1. **Trigger prefixes** — `/^on[A-Z]/`, `/^handle[A-Z]/`.
2. **Vacuous verbs** — `/^(process|do|perform|manage)[A-Z]/`,
   `/^(respond|react)To[A-Z]/`. Zero sites today; closes the thesaurus escape
   (`processClick`, `doClick`) before it is discovered.
3. **Bare event-noun + handler suffix** — `/^(click|change|key|frame|tick|press|submit|msg|message)(Handler|Callback|Cb)$/i`,
   i.e. the suffix with no leading verb. Catches `frameCallback` → `drawFrame`
   and `clickHandler`; leaves `setExportCsvHandler` alone, where `Handler` is
   the *object* of a leading verb.

Deliberately **not** forbidden: `apply*`, `execute*`, `update*`, `run*`. All 9
current uses are good names (`applySort`, `applyRandomWalk`, `executeTrade`) and
`execute` is domain vocabulary in an FX trading app. The verb is not what makes
a name empty — the object is. `executeTrade` and `processClick` are both
verb-plus-object; `Trade` is a domain noun and `Click` is an event.

## Inspected node shapes

| shape | example | rule |
|---|---|---|
| `FunctionDeclaration` | `function handleClick() {}` | flag on name match |
| `VariableDeclarator` with a function/arrow initializer, or `useCallback(…)` | `const handleApply = useCallback(…)` | flag on name match |
| `MethodDefinition` | `private handleLoginOutcome(…)` | flag on name match **unless** sole param is function-typed |
| `TSMethodSignature` | `onSort(f: SortField): void` | flag on name match **unless** sole param is function-typed |
| `TSPropertySignature` | `onBuy: () => void` | **never flagged** — a function-typed prop is a slot |

Everything else is out of scope, so these are legal *by construction* rather
than by carve-out — which is what keeps the rule cheap and drift-free:

```ts
type P = { onExecute: (d: Direction) => void };   // TSPropertySignature — slot
<button onClick={cancelRfq} />                     // JSXAttribute — never inspected
const onSelect = vi.fn();                          // call initializer, not a function value
let onMsg: ((m: unknown) => void) | undefined;     // no initializer — a captured slot
return { onSort: toggleSort };                     // object key mirrors the type; value is named
```

**Object-literal keys are never inspected.** Method shorthand implementing an
interface (`connectionLog.ts:33-43`) takes its key from the type, so flagging
the `TSMethodSignature` propagates the rename through typecheck. Separating a
dictated key from a freely chosen one would need contextual type information for
zero present benefit — `handleX:` object keys number 0 today.

## Known limits — state these in the rule header

1. **It cannot verify the replacement.** `handleClick` → `handleClicked` passes
   and is no better. The rule makes the lazy name *unavailable* so the author
   must decide; it does not vouch for names. Nobody should later read a green
   lint as endorsement.
2. **`handle` is also a domain noun.** `LayoutEnginePage.handleExists` refers to
   a resize handle — it queries a `handle-<pathKey>-<i>` test id — so
   `^handle[A-Z]`
   is a true false positive there. The prescribed response is a *disambiguating
   rename*, not a disable: `handleExists` read cold plausibly means "does the
   handler exist," and `resizeHandleExists` removes that ambiguity. Any codebase
   with file/socket/drag handles will meet this class.

## Wiring

Register in the existing shared `rtcPlugin` object (`eslint.config.mjs:89`,
alongside `newspaper-order`, `class-filename-match`, `component-newspaper`,
`no-render-functions`), then one flat-config block:

```js
{
  // A function's own name must state its EFFECT — what it does, to what — never
  // the occasion that triggers it. Slots (function-typed props, and methods
  // whose parameter IS the callback) are exempt by shape: their declarer must
  // not know what gets attached. Applies to every ts/tsx in the repo; prop
  // types, JSX attributes, `vi.fn()` spies and uninitialised slot captures are
  // legal by construction, so there are no globs to keep in sync.
  files: ["**/*.{ts,tsx}"],
  plugins: { rtc: rtcPlugin },
  rules: { "rtc/name-functions-by-effect": "error" },
}
```

`error` from day one. No warn-tier ratchet: the repo's zero-disables policy
means a warn would only defer the same renames, and `docs/lint-warnings.md`
tracks warnings the rule set cannot fix.

**No `client-prototype` carve-out.** It is deployed app code (`rtc-clone-proto`),
and its `BlotterApi.onSort` / `RatesApi.onBuy` members are the most-copied
instances of the pattern in the repo. A hole there keeps seeding the habit.

## Migration — one branch, one commit per package

≈186 renames — 160 function declarations, 6 function-initialized bindings, 7
class methods, 13 interface members. Treat it as an estimate: the exact set comes
from the first real lint run, since a handful of the 160 declarations may take a
callback as their sole parameter and so be slots. They are **~186 judgment calls,
not a mechanical sweep** — which is the real cost and the reason for per-package
commits over one big diff. The config block's `files` glob starts narrow and
widens per commit so no intermediate commit is red:

| # | scope | notable renames |
|---|---|---|
| 1 | rule + RuleTester suite; glob = the already-clean leaves — `shared`, `ws-effects`, `motion-core`, `boot-splash`, `devtools-core`, `react-bindings`, `solid-bindings` | — proves wiring, green |
| 2 | `client-core` (2) | `handleLoginOutcome` → `commitLoginOutcome`, `handleUnlockOutcome` → `commitUnlockOutcome` |
| 3 | `domain` (2) — widen the glob to `domain` in this commit | `onFill` → `bookFill`, `onMark` → `applyMark`. `onTrade(listener)` stays — it is a slot |
| 4 | `server` (2 + 3 members) | `handleLogin`, `onMessage` → `emitParsedFrame`; `ConnectionLog.onConnect/onDisconnect/onRejectedUpgrade` → `recordConnect`/`recordDisconnect`/`recordRejectedUpgrade` |
| 5 | `devtools-app`, `devtools-extension` | incl. `handleFocusInTimeline`, `handlePinIntent`, `handleMsgTypePill` |
| 6 | `client-react` | |
| 7 | `client-solid` | |
| 8 | `client-react-native` | incl. `frameCallback` → `drawFrame` |
| 9 | `ui-contract` (3) | `handleExists` → `resizeHandleExists`, `handleElement` → `resizeHandleElement`, `onDoneCount` → `doneCallCount` |
| 10 | `client-prototype` (+10 members) | `BlotterApi.onSort` → `toggleSort`, `onQuery` → `setQuery`, `onExport` → `exportCsv`; `RatesApi.onBuy/onSell/onReset/onDismiss/onNotional`; `CreditApi.onTab/onExport` |
| 11 | collapse glob to `**/*.{ts,tsx}`; run `pnpm sync:lint-warnings` and commit any drift; docs | |

Renames touch local bindings, private methods, and repo-owned interface members
only — no DOM output changes, so visual goldens and contract specs are untouched
by construction. Interface-member renames change call sites
(`api.onSort` → `api.toggleSort`), which typecheck catches exhaustively.

## Testing

`RuleTester` under vitest via the existing `pnpm test:rules` (gated at
`ci.yml:83`), mirroring `eslint-rules/no-render-functions.test.mjs`.

`invalid` — each detector × each inspected node shape:

```js
"function handleClick() {}"                        // trigger prefix, declaration
"const handleApply = useCallback(() => {}, [])"    // trigger prefix, useCallback
"function processClick() {}"                       // vacuous verb
"function doClick() {}", "function performClick() {}", "function manageSelection() {}"
"function respondToKeyDown() {}"                   // vacuous verb + To
"const frameCallback = () => {}"                   // event noun + suffix
"class C { private handleLoginOutcome(u, o) {} }"   // MethodDefinition
"interface A { onSort(f: SortField): void }"        // TSMethodSignature, data param
"interface L { onConnect(): void }"                 // TSMethodSignature, no param
```

`valid` — every by-construction exemption is pinned, because these are the
claims most likely to regress silently:

```js
"type P = { onExecute: (d: Direction) => void }"    // fn-typed prop — slot
"interface A { onTrade(cb: TradeListener): void }"  // sole param is a fn — attach point
"class C { onTrade(cb: TradeListener): void {} }"   // same, MethodDefinition
"const El = () => <button onClick={cancelRfq} />"   // JSXAttribute
"const onSelect = vi.fn()"                          // call initializer
"let onMsg: ((m: unknown) => void) | undefined"      // no initializer
"const api = { onSort: toggleSort }"                 // object key mirrors the type
"function setExportCsvHandler(fn) {}"                // leading verb; Handler is the object
"function applySort(rows) {}"                        // legitimate verb
"function executeTrade(d) {}"                        // domain vocabulary
"function onboardUser() {}"                          // no capital at the boundary
"function download() {}"                             // ditto
"function noop() {}"                                 // the house idiom for an empty fn
```

## Docs

- The rule's own header comment carries the doctrine (house pattern; it is what
  a reader reaches first from the error message). Must include both known limits
  and the slot/handler discriminator.
- The `rtc/*` rule table in `docs/architecture/17-web-client-up-close.md`.
- A short entry in `CLAUDE.md` beside the **UI Logic Placement** pointer — this
  is a naming law an implementer needs *before* writing a component.

## Out of scope

- Bare `handler` / `callback` bindings with no event noun (`const handler = …`).
  A different smell; decide separately rather than smuggling it in.
- Renaming `onX` **slots** in any direction (prop members, JSX attributes,
  ~530 sites). Whether React's `onX` prop convention should give way to
  Angular/Vue-style event naming is a house-style question deserving its own
  spec; the criterion above says `onX` is *correct* for slots, so there is no
  defect to fix.
