# `rtc/name-functions-by-effect` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a custom ESLint rule that forbids naming a concrete handler after the occasion that triggers it, and rename the ~186 existing offenders.

**Architecture:** One `.mjs` rule file in `eslint-rules/`, exported as a named
const, registered in the existing shared `rtcPlugin` object in
`eslint.config.mjs` and enabled by a single flat-config block. TDD'd with
ESLint's `RuleTester` driven by vitest (`pnpm test:rules`). The rule's
`files` glob starts scoped to already-clean packages and widens one package per
commit, so no commit is ever transiently red. Correctness of the renames is
proven by typecheck + the full test suite staying green.

**Tech Stack:** ESLint 9 flat config, `typescript-eslint` parser, vitest,
`RuleTester`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-26-name-functions-by-effect-design.md`

## Global Constraints

- **Zero `eslint-disable` policy.** No violation may be silenced; every one is
  renamed. If a site seems unrenameable, stop and raise it — do not disable.
- **Biome is the formatter and linter.** Run `pnpm exec biome ci .` before every
  commit; it checks formatting *and* import sort, which plain `pnpm lint` does not.
- **Braces on every control statement** (`useBlockStatements`) — a brace-less
  `if` fails CI.
- **`func-style: ["error", "declaration", { allowArrowFunctions: false }]`** —
  new functions must be declarations, not arrows assigned to consts.
- **`arrow-body-style: ["error", "always"]`** — arrow bodies need braces + `return`.
- **`eslint-rules/*.mjs` are not matched** by the rule's own `**/*.{ts,tsx}`
  glob, so the rule never lints itself. `rtc/newspaper-order` is scoped to
  `**/*.{spec,test}.{ts,tsx}` and so does not apply to `*.test.mjs` either —
  the rule's test file may declare its consts at the top.
- **Naming procedure for every rename** (apply in order):
  1. Read the body. Write down what it *does to what* — the effect and the
     domain object it acts on.
  2. Name it `<effectVerb><DomainNoun>`. The noun must be a **domain** noun
     (`Ticket`, `Trade`, `Filter`, `Notional`), never an event noun (`Click`,
     `Change`, `KeyDown`).
  3. If the function is a pure event→call adapter with no added semantics,
     **delete it** and inline the arrow at the call site. Inline arrows in JSX
     are already idiomatic here (58 in `client-react` alone) and React Compiler
     is enabled, so there is no memoisation cost.

     > **[Corrected after execution]** This step was reversed: an inline
     > arrow is maximally coupled to its one call site, which is the exact
     > coupling the rule exists to remove. Commit `faba43bf9` re-extracted all
     > 51 sites migrated under this step back into named functions. This plan
     > is left as the dated execution record and is not rewritten; the
     > corrected rule lives in
     > `docs/superpowers/specs/2026-07-26-name-functions-by-effect-design.md`
     > ("Extraction is not optional at one line").
  4. If a decode step is the whole point, name the condition:
     `handleKeyDown` → `blurNotionalOnEnter`, not `keyDownHandler`.
  5. Never settle for a synonym: `processClick` / `doClick` / `handleClicked`
     all fail the same test the rule exists to enforce.
- **Method-syntax members must be classified before they are touched.** A
  function-valued interface/type member written in *method* syntax
  (`onToggleDealer(id: number): void`) is flagged, but a member written in
  *property* syntax (`onToggleDealer: (id: number) => void`) is exempt. The rule
  cannot tell a prop slot from a command in method syntax, because the real
  criterion is *who invokes* — the declaring component calls a prop slot, the
  consumer calls a command — and a declaration does not show that. So for each
  flagged member, decide:
  - **Prop slot** (the declaring component invokes it; a parent supplies the
    function) → **convert to property syntax**, do NOT rename. This also matches
    the repo's majority style: 283 members already use property syntax against
    86 in method syntax.
    ```ts
    // before                              after
    onToggleDealer(id: number): void;   →   onToggleDealer: (id: number) => void;
    ```
  - **Command** (a consumer invokes it — `api.onSort(col.field)`,
    `connectionLog.onConnect()`) → **rename** per the naming procedure, keep
    method syntax.

  The check is mechanical: grep the member name for call sites. `x.onSort(` at a
  consumer means command; a JSX attribute `onSort={` or a call from inside the
  declaring component means slot.

## Why some tasks list every rename and others don't

Tasks 2, 3, 4 and 9 name every rename outright — the sites are few and already
read. Tasks 5, 6, 7, 8 and 10 instead begin with "produce the rename table and
get it reviewed," because those ~160 names cannot be pre-decided in a plan
document: step 1 of the naming procedure is *read the body and write down what it
does*, and doing that for 160 functions **is** the work. Pre-committing to names
sight-unseen would produce exactly the plausible-but-empty names this rule
exists to prevent. Each of those tasks therefore ships a worked table of the
sites that have been read, plus a review gate before any editing starts.

---

### Task 1: The rule, its RuleTester suite, and wiring on already-clean packages

**Files:**
- Create: `eslint-rules/name-functions-by-effect.mjs`
- Create: `eslint-rules/name-functions-by-effect.test.mjs`
- Modify: `eslint.config.mjs` (import + `rtcPlugin.rules` + one new config block)

**Interfaces:**
- Consumes: nothing.
- Produces: named export `nameFunctionsByEffect` (an ESLint flat-config rule
  object with `meta.messages.nameByEffect` and `meta.schema = []`), registered
  under the plugin id `rtc/name-functions-by-effect`. Tasks 2–10 rely only on
  that rule id and on the config block's `files` array being the thing they
  widen.

- [ ] **Step 1: Write the failing test**

Create `eslint-rules/name-functions-by-effect.test.mjs`:

```js
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { nameFunctionsByEffect } from "./name-functions-by-effect.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2023,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("name-functions-by-effect", nameFunctionsByEffect, {
  valid: [
    {
      name: "function-typed prop is a SLOT — its declarer must not know the intent",
      code: "type P = { onExecute: (d: Direction) => void };\n",
    },
    {
      name: "optional function-typed prop is a slot",
      code: "type P = { onDone?: () => void };\n",
    },
    {
      name: "method whose SOLE param is an inline callback is an attach point",
      code: "interface A { onTrade(cb: (t: Trade) => void): void }\n",
    },
    {
      name: "attach point via a *Listener-named type alias",
      code: "interface A { onTrade(listener: TradeListener): void }\n",
    },
    {
      name: "attach point as a class method",
      code: "class C {\n  onTrade(listener: TradeListener): void {}\n}\n",
    },
    {
      name: "JSX attribute names are never inspected",
      code: "const el = <button onClick={cancelRfq} />;\n",
    },
    {
      name: "vi.fn() spy named after the slot it fills is not a function value",
      code: "const onSelect = vi.fn();\n",
    },
    {
      name: "uninitialised slot capture is not a function value",
      code: "let onMsg: ((m: unknown) => void) | undefined;\n",
    },
    {
      name: "object-literal keys mirror the type and are never inspected",
      code: "const api = { onSort: toggleSort, onExport: exportCsv };\n",
    },
    {
      name: "object-literal method shorthand implementing an interface",
      code: "const log = {\n  onConnect(): void {\n    record();\n  },\n};\n",
    },
    {
      name: "leading verb — Handler is the OBJECT of the verb, not the role",
      code: "function setExportCsvHandler(fn) {}\n",
    },
    {
      name: "apply* is a legitimate effect verb",
      code: "function applySort(rows) {}\n",
    },
    {
      name: "execute* is domain vocabulary in an FX app",
      code: "function executeTrade(d) {}\n",
    },
    {
      name: "update* is legitimate",
      code: "function updateNotional(v) {}\n",
    },
    {
      name: "no capital at the on-boundary",
      code: "function onboardUser() {}\n",
    },
    {
      name: "no capital at the do-boundary",
      code: "function download() {}\n",
    },
    {
      name: "noop is the house idiom for an empty function",
      code: "function noop(): void {}\n",
    },
    {
      name: "an effect verb plus a domain noun",
      code: "function dismissTicket() {}\n",
    },
  ],
  invalid: [
    {
      name: "handle* function declaration",
      code: "function handleClick() {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "handleClick" } }],
    },
    {
      name: "on* function declaration receiving event DATA",
      code: "function onMessage(data: unknown) {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "onMessage" } }],
    },
    {
      name: "handle* binding wrapped in useCallback",
      code: "const handleApply = useCallback(() => {\n  apply();\n}, []);\n",
      errors: [{ messageId: "nameByEffect", data: { name: "handleApply" } }],
    },
    {
      name: "handle* arrow binding",
      code: "const handleSend = () => {\n  send();\n};\n",
      errors: [{ messageId: "nameByEffect", data: { name: "handleSend" } }],
    },
    {
      name: "vacuous verb: process*",
      code: "function processClick() {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "processClick" } }],
    },
    {
      name: "vacuous verb: do*",
      code: "function doClick() {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "doClick" } }],
    },
    {
      name: "vacuous verb: perform*",
      code: "function performClick() {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "performClick" } }],
    },
    {
      name: "vacuous verb: manage*",
      code: "function manageSelection() {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "manageSelection" } }],
    },
    {
      name: "vacuous verb: respondTo*",
      code: "function respondToKeyDown() {}\n",
      errors: [
        { messageId: "nameByEffect", data: { name: "respondToKeyDown" } },
      ],
    },
    {
      name: "vacuous verb: reactTo*",
      code: "function reactToFill() {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "reactToFill" } }],
    },
    {
      name: "bare event noun + Callback suffix, no leading verb",
      code: "const frameCallback = () => {\n  draw();\n};\n",
      errors: [{ messageId: "nameByEffect", data: { name: "frameCallback" } }],
    },
    {
      name: "bare event noun + Handler suffix, no leading verb",
      code: "function clickHandler() {}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "clickHandler" } }],
    },
    {
      name: "bare event noun + Cb suffix",
      code: "const msgCb = () => {\n  route();\n};\n",
      errors: [{ messageId: "nameByEffect", data: { name: "msgCb" } }],
    },
    {
      name: "private class method",
      code: "class C {\n  private handleLoginOutcome(u: string, o: AuthOutcome): void {}\n}\n",
      errors: [
        { messageId: "nameByEffect", data: { name: "handleLoginOutcome" } },
      ],
    },
    {
      name: "class method receiving event DATA is a handler, not an attach point",
      code: "class C {\n  onFill(fill: FillEvent): void {}\n}\n",
      errors: [{ messageId: "nameByEffect", data: { name: "onFill" } }],
    },
    {
      name: "interface method signature with a DATA param",
      code: "interface A { onSort(f: SortField): void }\n",
      errors: [{ messageId: "nameByEffect", data: { name: "onSort" } }],
    },
    {
      name: "interface method signature with NO param — it is what runs",
      code: "interface L { onConnect(): void }\n",
      errors: [{ messageId: "nameByEffect", data: { name: "onConnect" } }],
    },
    {
      name: "attach-point exemption needs the SOLE param to be the callback",
      code: "interface A { onTrade(id: number, cb: TradeListener): void }\n",
      errors: [{ messageId: "nameByEffect", data: { name: "onTrade" } }],
    },
  ],
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:rules`
Expected: FAIL — `Failed to load url ./name-functions-by-effect.mjs` (the rule
file does not exist yet).

- [ ] **Step 3: Write the rule**

Create `eslint-rules/name-functions-by-effect.mjs`:

```js
// rtc/name-functions-by-effect — a function's own name must state its EFFECT
// (what it does, to what), never the occasion that triggers it.
//
// The rule turns on one distinction. A SLOT is a placeholder consumers attach a
// handler to — a function-typed prop, or a method whose parameter IS the
// callback. Its declarer cannot name the intent and must not try to: that is
// decoupling, and `onX` is the correct name. A CONCRETE HANDLER receives event
// data (or nothing) and *is* what runs; there `onX`/`handleX` states only when
// it happens and forces every reader into the body.
//
//   <Car onYellowLight={prepare} onRedLight={stop} />   // ✅ slot names the
//                                                       //    event, handler
//                                                       //    names the effect
//   <Car onYellowLight={handleYellowLight} />            // ❌ handler is empty
//   <Car prepare={prepare} />                            // ❌ slot now dictates
//                                                       //    the parent's intent
//
// The discriminator is which way the function flows, so it needs no type
// checker: a slot RECEIVES a function; a handler receives data and runs.
//
// TWO KNOWN LIMITS, both deliberate:
//
// 1. It cannot verify the replacement. `handleClick` -> `handleClicked` passes
//    and is no better. The rule only makes the lazy name UNAVAILABLE so the
//    author has to decide — a green lint is not an endorsement of a name.
// 2. `handle` is also a domain noun (drag/file/socket handles).
//    `LayoutEnginePage.handleExists` means "does the resize handle exist" and is
//    a true false positive. The prescribed response is a DISAMBIGUATING RENAME
//    (`resizeHandleExists`), never a disable — read cold, `handleExists` really
//    could mean "does the handler exist," which is the ambiguity this rule cares
//    about.
//
// Resolving a named param type (`listener: TradeListener`) would need type
// information, so the attach-point check treats a type reference ending in
// Listener/Callback/Handler/Fn as a callback by convention. A callback type
// named otherwise yields a false positive; rename the type or the method.

const TRIGGER_PREFIX = /^(on|handle)[A-Z]/;

const VACUOUS_VERB = /^(?:(?:process|do|perform|manage)[A-Z]|(?:respond|react)To[A-Z])/;

const EVENT_NOUN_SUFFIX =
  /^(?:click|change|key|frame|tick|press|submit|msg|message)(?:Handler|Callback|Cb)$/i;

const CALLBACK_TYPE_NAME = /(?:Listener|Callback|Handler|Fn)$/;

const FUNCTION_EXPRESSIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

/** True when the name states a trigger or nothing at all, rather than an effect. */
function statesNoEffect(name) {
  return (
    TRIGGER_PREFIX.test(name) ||
    VACUOUS_VERB.test(name) ||
    EVENT_NOUN_SUFFIX.test(name)
  );
}

/** True when `node` is a type node denoting a function — an inline function
 * type, a *Listener/*Callback/*Handler/*Fn type reference, or a union
 * containing either. */
function isCallbackType(node) {
  if (!node) {
    return false;
  }

  switch (node.type) {
    case "TSFunctionType":
    case "TSConstructorType":
      return true;
    case "TSTypeReference":
      return (
        node.typeName.type === "Identifier" &&
        CALLBACK_TYPE_NAME.test(node.typeName.name)
      );
    case "TSUnionType":
    case "TSIntersectionType":
      return node.types.some((t) => {
        return isCallbackType(t);
      });
    case "TSParenthesizedType":
      return isCallbackType(node.typeAnnotation);
    default:
      return false;
  }
}

/** True when the sole parameter IS the callback — i.e. this is an attach point
 * consumers register with, not a handler that runs. */
function isAttachPoint(params) {
  if (!params || params.length !== 1) {
    return false;
  }

  const annotation = params[0].typeAnnotation;
  return isCallbackType(annotation ? annotation.typeAnnotation : null);
}

/** The function expression a binding holds, unwrapping `useCallback(fn, deps)`.
 * Returns null for anything that is not a function value — `vi.fn()` calls and
 * uninitialised declarators land here, which is why spies and slot captures are
 * legal by construction rather than by carve-out. */
function functionValueOf(init) {
  if (!init) {
    return null;
  }

  if (FUNCTION_EXPRESSIONS.has(init.type)) {
    return init;
  }

  if (
    init.type === "CallExpression" &&
    init.callee.type === "Identifier" &&
    init.callee.name === "useCallback"
  ) {
    const first = init.arguments[0];

    if (first && FUNCTION_EXPRESSIONS.has(first.type)) {
      return first;
    }
  }

  return null;
}

export const nameFunctionsByEffect = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require function names to state their effect — what the function does, to what — not the occasion that triggers it. Forbids on*/handle* and vacuous verbs (process*, do*, perform*, manage*) on concrete handlers, while leaving slots (function-typed props, attach points) alone",
    },
    schema: [],
    messages: {
      nameByEffect:
        "'{{name}}' names its trigger, not its effect. Name it for what it does, to what — an effect verb plus a DOMAIN noun, never an event noun. A name that states its effect also survives being wired to a different trigger: handleClick -> dismissTicket; processClick -> dismissTicket (still an event noun); handleKeyDown -> blurNotionalOnEnter; onMessage -> emitParsedFrame; onConnect -> recordConnect; frameCallback -> drawFrame. If this name is a SLOT consumers attach to — a function-typed prop, or a method whose sole parameter is a callback — the rule does not fire; check the shape.",
    },
  },

  create(context) {
    function check(nameNode, name, params) {
      if (!statesNoEffect(name) || isAttachPoint(params)) {
        return;
      }

      context.report({ node: nameNode, messageId: "nameByEffect", data: { name } });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id) {
          check(node.id, node.id.name, node.params);
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") {
          return;
        }

        const fn = functionValueOf(node.init);

        if (fn) {
          check(node.id, node.id.name, fn.params);
        }
      },
      MethodDefinition(node) {
        if (!node.computed && node.key.type === "Identifier") {
          check(node.key, node.key.name, node.value.params);
        }
      },
      TSMethodSignature(node) {
        if (!node.computed && node.key.type === "Identifier") {
          check(node.key, node.key.name, node.params);
        }
      },
    };
  },
};
```

**Note on `TSParenthesizedType`:** current `typescript-eslint` versions do not
emit this node (parentheses are transparent), so that `case` is defensive dead
code. Leave it — it costs nothing and covers a parser that does emit it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:rules`
Expected: PASS — 18 valid + 18 invalid cases green. If the two
`TSPropertySignature` valid cases fail, the rule is visiting a node it must not:
confirm there is no `TSPropertySignature` or `Property` visitor.

- [ ] **Step 5: Register the rule in `eslint.config.mjs`**

Add the import beside the four existing rule imports (lines 6–9, alphabetical):

```js
import { nameFunctionsByEffect } from "./eslint-rules/name-functions-by-effect.mjs";
```

Add it to the shared plugin object (`eslint.config.mjs:89`):

```js
const rtcPlugin = {
  rules: {
    "newspaper-order": newspaperOrder,
    "class-filename-match": classFilenameMatch,
    "component-newspaper": componentNewspaper,
    "no-render-functions": noRenderFunctions,
    "name-functions-by-effect": nameFunctionsByEffect,
  },
};
```

Add a config block after the `rtc/component-newspaper` block. **The `files`
array starts scoped to the packages that are already clean** and is widened one
package per task:

```js
  {
    // A function's own name must state its EFFECT — what it does, to what —
    // never the occasion that triggers it. Slots are exempt BY SHAPE: a
    // function-typed prop, or a method whose sole parameter is the callback,
    // belongs to a declarer that must not know what gets attached. Prop types,
    // JSX attributes, `vi.fn()` spies and uninitialised slot captures are legal
    // by construction, so there is nothing to keep in sync.
    //
    // Scope widens one package per commit until it reaches **/*.{ts,tsx} —
    // see docs/superpowers/plans/2026-07-26-name-functions-by-effect.md.
    files: [
      "packages/shared/**/*.{ts,tsx}",
      "packages/ws-effects/**/*.{ts,tsx}",
      "packages/motion-core/**/*.{ts,tsx}",
      "packages/boot-splash/**/*.{ts,tsx}",
      "packages/devtools-core/**/*.{ts,tsx}",
      "packages/react-bindings/**/*.{ts,tsx}",
      "packages/solid-bindings/**/*.{ts,tsx}",
    ],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/name-functions-by-effect": "error" },
  },
```

- [ ] **Step 6: Verify the wiring is live and those packages are clean**

Run: `pnpm exec eslint packages/shared packages/ws-effects packages/motion-core packages/boot-splash packages/devtools-core packages/react-bindings packages/solid-bindings`
Expected: no `rtc/name-functions-by-effect` findings.

Then prove the rule is actually attached rather than silently unmatched — a
wired-but-inert rule is the failure mode this step exists to catch:

```bash
printf 'export function handleClick(): void {}\n' > packages/shared/src/__ruleprobe.ts
pnpm exec eslint packages/shared/src/__ruleprobe.ts
rm packages/shared/src/__ruleprobe.ts
```
Expected: one `rtc/name-functions-by-effect` error naming `handleClick`.

- [ ] **Step 7: Verify formatting, then commit**

Run: `pnpm exec biome ci .`
Expected: clean.

```bash
git add eslint-rules/name-functions-by-effect.mjs \
        eslint-rules/name-functions-by-effect.test.mjs \
        eslint.config.mjs
git commit -m "feat(lint): rtc/name-functions-by-effect rule, scoped to clean packages

A concrete handler's name must state its effect, not its trigger. Slots
(function-typed props, and methods whose sole param IS the callback) are exempt
by shape — their declarer must not know what gets attached.

Enabled only on packages that are already clean; the glob widens one package
per commit."
```

---

### Task 2: Rename in `client-core` (2 sites)

**Files:**
- Modify: `packages/client-core/src/presenters/AuthPresenter.ts:134,190`
- Modify: `eslint.config.mjs` (add `packages/client-core/**/*.{ts,tsx}` to the glob)
- Test: existing `packages/client-core/**/*.test.ts` — no new tests; renaming a
  private method is behaviour-preserving and the suite is the proof.

**Interfaces:**
- Consumes: the rule id `rtc/name-functions-by-effect` from Task 1.
- Produces: nothing other tasks depend on (both methods are `private`).

- [ ] **Step 1: Widen the glob**

Add `"packages/client-core/**/*.{ts,tsx}",` to the `files` array of the
`rtc/name-functions-by-effect` block in `eslint.config.mjs`.

- [ ] **Step 2: Confirm the expected violations, and only those**

Run: `pnpm exec eslint packages/client-core`
Expected: exactly 2 errors — `handleLoginOutcome` (line 134) and
`handleUnlockOutcome` (line 190). If more appear, list them and apply the Global
Constraints naming procedure to each before continuing.

- [ ] **Step 3: Rename both methods and their call sites**

`handleLoginOutcome` writes the session and emits the authenticated/unauthenticated
state — it *commits* the outcome. Same for the unlock path.

- `handleLoginOutcome` → `commitLoginOutcome`
- `handleUnlockOutcome` → `commitUnlockOutcome`

Both are `private` and called from within the same class (the login call site is
`AuthPresenter.ts:130`, inside the `this.auth.login(...).subscribe` callback).
Update the declaration and every `this.` call site.

- [ ] **Step 4: Verify lint, types, and tests**

Run: `pnpm exec eslint packages/client-core`
Expected: clean.

Run: `pnpm --filter @rtc/client-core typecheck && pnpm --filter @rtc/client-core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/client-core
git commit -m "refactor(client-core): name AuthPresenter outcome handlers by effect

handleLoginOutcome -> commitLoginOutcome, handleUnlockOutcome ->
commitUnlockOutcome. Both write the session and emit auth state; 'handle' hid
that. Widens rtc/name-functions-by-effect to client-core."
```

---

### Task 3: Rename in `domain` (2 sites — and prove `onTrade` stays)

**Files:**
- Modify: `packages/domain/src/simulators/EquityPositionSimulator.ts:28,47`
- Modify: `packages/client-core/src/adapters/portFactory.ts:146` (call site)
- Modify: `packages/server/src/services/serviceContainer.ts:51` (call site)
- Modify: `packages/domain/src/simulators/EquityPositionSimulator.test.ts` and
  `EquityPositionSimulator.contract.test.ts` (call sites — ~12 `sim.onFill(...)` /
  `port.onFill(...)` calls)
- Modify: `eslint.config.mjs` (add `packages/domain/**/*.{ts,tsx}`)

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: `EquityPositionSimulator.bookFill(fill: FillEvent): void` and
  `EquityPositionSimulator.applyMark(symbol: string, price: number): void`,
  replacing `onFill` / `onMark`. `ExecutionSimulator.onTrade(listener: TradeListener): void`
  is **unchanged** — it is a slot.

- [ ] **Step 1: Widen the glob**

Add `"packages/domain/**/*.{ts,tsx}",` to the `files` array.

- [ ] **Step 2: Confirm the violations — and that `onTrade` is NOT among them**

Run: `pnpm exec eslint packages/domain`
Expected: exactly 2 errors — `onFill` (`EquityPositionSimulator.ts:28`) and
`onMark` (`:47`).

`ExecutionSimulator.onTrade(listener: TradeListener)` at
`packages/domain/src/simulators/ExecutionSimulator.ts:32` **must not** be
reported: its sole parameter is a `*Listener` type, so it is an attach point.
If it *is* reported, the attach-point check is broken — fix the rule (Task 1
`isCallbackType`) rather than renaming `onTrade`.

- [ ] **Step 3: Rename both methods and every call site**

- `onFill` → `bookFill` — it updates the lot's qty and cost basis, records the
  mark, ensures a live mark subscription and recomputes positions. It *books* a
  fill into the position.
- `onMark` → `applyMark` — it records a new mark and recomputes.

Call sites to update:
- `packages/client-core/src/adapters/portFactory.ts:146` — inside the
  `listener:` slot passed to `EquityOrderSimulator`, becomes
  `positionsSim.bookFill(fill);`
- `packages/server/src/services/serviceContainer.ts:51` — same shape.
- `EquityPositionSimulator.ts` internal caller: `ensureMarking`'s subscribe
  callback calls `this.onMark(symbol, q.last)` → `this.applyMark(symbol, q.last)`.
- Both test files' `sim.onFill(...)` / `port.onFill(...)` calls.

Leave `EquityOrderSimulator`'s `listener?: OrderListener` prop alone — it is a
correctly-named slot.

- [ ] **Step 4: Verify lint, types, and tests**

Run: `pnpm exec eslint packages/domain packages/client-core packages/server`
Expected: clean.

Run: `pnpm build && pnpm typecheck && pnpm --filter @rtc/domain test`
Expected: PASS. (A full `pnpm build` is needed because `domain` is a build
dependency of `client-core` and `server`, which consume the renamed method.)

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/domain packages/client-core packages/server
git commit -m "refactor(domain): name EquityPositionSimulator handlers by effect

onFill -> bookFill (updates lot qty + cost basis, marks, recomputes), onMark ->
applyMark. ExecutionSimulator.onTrade(listener) is left alone — it is a slot
consumers attach to, which is exactly what the rule exempts by shape."
```

---

### Task 4: Rename in `server` (2 bindings + a 3-member interface)

**Files:**
- Modify: `packages/server/src/socket/toSocket.ts:8`
- Modify: `packages/server/src/http/loginHandler.ts:36`
- Modify: `packages/server/src/observability/connectionLog.ts:14-16,33,38,43`
- Modify: `packages/server/src/index.ts:124,132,134` (call sites)
- Modify: any `connectionLog` / `handleLogin` test files (find with grep in Step 3)
- Modify: `eslint.config.mjs` (add `packages/server/**/*.{ts,tsx}`)

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: `interface ConnectionLog { recordConnect(): void; recordDisconnect(): void; recordRejectedUpgrade(reason: UpgradeRejection): void }`
  replacing the three `on*` members. `createConnectionLog`'s signature is unchanged.

- [ ] **Step 1: Widen the glob**

Add `"packages/server/**/*.{ts,tsx}",` to the `files` array.

- [ ] **Step 2: Confirm the violations**

Run: `pnpm exec eslint packages/server`
Expected: 5 errors — `onMessage` (`toSocket.ts:8`), `handleLogin`
(`loginHandler.ts:36`), and the three `ConnectionLog` members
(`connectionLog.ts:14,15,16`). The three object-literal method shorthands at
`connectionLog.ts:33,38,43` must **not** be reported — object keys are never
inspected; they follow the interface rename via typecheck.

- [ ] **Step 3: Rename**

- `toSocket.ts:8` `onMessage` → `emitParsedFrame`. It parses a frame and pushes
  it to the RxJS subscriber, swallowing unparseable input. Update both
  registration sites: `ws.on("message", emitParsedFrame)` (line 16) and
  `ws.off("message", emitParsedFrame)` (line 19). The string `"message"` is the
  `ws` event name — do **not** change it.
- `loginHandler.ts:36` `handleLogin` → read the body and name the effect. It is
  exported, so grep for importers: `grep -rn "handleLogin" packages/`. If it
  authenticates a request and writes an HTTP response, `respondToLogin` is
  **not** acceptable (vacuous verb, and the rule will reject it) — prefer
  something like `authenticateLoginRequest`.
- `connectionLog.ts` — the log *is* the attached handler; its job is to keep
  counters and print a line:
  - `onConnect` → `recordConnect`
  - `onDisconnect` → `recordDisconnect`
  - `onRejectedUpgrade` → `recordRejectedUpgrade`

  Rename the three interface members (lines 14–16) **and** the three
  object-literal shorthands in `createConnectionLog`'s return (lines 33, 38,
  43), then the three call sites in `index.ts` (124, 132, 134).

- [ ] **Step 4: Verify lint, types, and tests**

Run: `pnpm exec eslint packages/server`
Expected: clean.

Run: `pnpm --filter @rtc/server typecheck && pnpm --filter @rtc/server test`
Expected: PASS. Typecheck is the exhaustive proof that every `ConnectionLog`
member call site moved.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/server
git commit -m "refactor(server): name WS + connection-log handlers by effect

onMessage -> emitParsedFrame (parses a frame, pushes to the subscriber).
ConnectionLog's on* members -> record*: the log IS the attached handler, and
'onConnect' said when it runs while hiding that it keeps counters and prints."
```

---

### Task 5: Rename in `devtools-app` and `devtools-extension`

**Files:**
- Modify: `packages/devtools-app/src/**` — 6 files, ~15 sites (enumerate in Step 2)
- Modify: `packages/devtools-extension/src/**` — expect 0 (its 8 grep hits are
  `let onMsg: (…) => void` captures with no initializer, which the rule does not
  visit)
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: nothing cross-package — `devtools-app` internals only.

- [ ] **Step 1: Widen the glob**

Add both to the `files` array:
```js
      "packages/devtools-app/**/*.{ts,tsx}",
      "packages/devtools-extension/**/*.{ts,tsx}",
```

- [ ] **Step 2: Produce the rename table and get it reviewed**

Run: `pnpm exec eslint packages/devtools-app packages/devtools-extension --format json > /tmp/dt-violations.json`

Then list every violation as `file:line  currentName  →  proposedName` and
**pause for review before editing**. Do not batch-rename: each name is a
judgment call requiring the body to be read. Known sites and their reading:

| site | current | notes for naming |
|---|---|---|
| `InspectorApp.tsx:91` | `onKeyDown` | a `document` keydown listener inside an effect; name the shortcut it implements |
| `InspectorApp.tsx:126` | `handleFocusInTimeline` | `useCallback`; focuses a timeline row |
| `InspectorApp.tsx:134` | `handlePinIntent` | `useCallback`; pins the timeline to a moment |
| `InspectorApp.tsx:146` | `handleMsgTypePill` | `useCallback`; filters by wire message type |
| `InspectorApp.tsx:311` | `handleClick` | read the body |
| `recording/RecordingToolbar.tsx:14` | `onImport` | reads a file input and loads a recording |
| `panels/WirePanel.tsx:39` | `handleFilterChange` | sets the wire filter text |
| `timeline/TimelinePane.tsx:98,102,108` | `handlePinClick`, `handleSourceClick`, `handleRadiusClick` | three distinct effects |
| `timeline/FilterControls.tsx:15,73,95` | `handleText`, `handleToggle`, `handleRemove` | |
| `timeline/ContextPane.tsx:101,249` | `handleClick`, `handleQuery` | |

Apply the Global Constraints naming procedure — including option 3: several of
these may be pure adapters best deleted in favour of an inline arrow.

- [ ] **Step 3: Apply the approved renames**

Edit each site. `devtools-app` has no exported `on*`/`handle*` API, so renames
are file-local; typecheck still catches any missed call site.

- [ ] **Step 4: Verify lint, types, and tests**

Run: `pnpm exec eslint packages/devtools-app packages/devtools-extension`
Expected: clean.

Run: `pnpm --filter @rtc/devtools-app typecheck && pnpm --filter @rtc/devtools-app test && pnpm --filter @rtc/devtools-extension test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/devtools-app packages/devtools-extension
git commit -m "refactor(devtools): name inspector handlers by effect

Widens rtc/name-functions-by-effect to devtools-app + devtools-extension."
```

---

### Task 6: Rename in `client-react`

**Files:**
- Modify: `packages/client-react/src/ui/**` — ~24 files (enumerate in Step 2)
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: nothing cross-package. All *handler* sites are component-local
  functions, and prop **names** never change — prop slots in method syntax are
  converted to property syntax, which is a type-level edit only. So
  `@rtc/ui-contract` specs and the visual goldens are untouched.

**Known method-syntax prop slots in this package** (convert to property syntax,
do not rename — verified as props, not commands):
- `ui/credit/newRfq/DealerChecklist.tsx:58,59` — `onToggleDealer`, `onToggleAll`
- `ui/credit/newRfq/InstrumentSelect.tsx:50,51,56`
- `ui/credit/newRfq/NewRfqPanel.tsx:254` — `DirButtonProps.onSelect`

Expect more; enumerate them in Step 2 with the rest.

- [ ] **Step 1: Widen the glob**

Add `"packages/client-react/**/*.{ts,tsx}",` to the `files` array.

- [ ] **Step 2: Produce the rename table and get it reviewed**

Run: `pnpm exec eslint packages/client-react`

List every violation as `file:line  currentName  →  proposedName` — and for each
flagged **interface/type member**, classify it slot-vs-command per the Global
Constraints and mark it `→ property syntax` or `→ <newName>`. **Pause for review
before editing.** Worked examples from known handler sites:

| site | current | proposed |
|---|---|---|
| `ui/fx/liveRates/tile/TileNotional.tsx:15` | `handleChange` | pure adapter (`notional.change(e.target.value)`) — **delete it**, inline `onChange={(e) => { notional.change(e.target.value); }}` |
| `ui/fx/liveRates/tile/TileNotional.tsx:19` | `handleKeyDown` | `blurNotionalOnEnter` (blurs the input when `e.key === "Enter"`) |
| `ui/fx/blotter/columnFilter/SetFilter.tsx:44` | `handleApply` | `applySelectedValues` |
| `ui/fx/blotter/FxBlotter.tsx:44` | `handleSort` | `toggleSortColumn` |
| `ui/credit/newRfq/NewRfqPanel.tsx:104` | `handleToggleAllDealers` | `toggleAllDealers` |
| `ui/credit/sellSide/TradeTicket.tsx:27,37` | `handleSubmit`, `handlePass` | `submitQuote`, `passOnRfq` |
| `ui/credit/rfqs/RfqCard.tsx:77` | `handleAnimationEnd` | name the state transition it settles |

Note `ui/credit/rfqs/RfqsPanel.tsx` has both a `handleRemove` at :208 and
another at :360 in a different component — they may warrant different names.

- [ ] **Step 3: Apply the approved renames**

- [ ] **Step 4: Verify lint, types, tests, and the UI contract**

Run: `pnpm exec eslint packages/client-react`
Expected: clean.

Run: `pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-react test`
Expected: PASS. The contract specs assert on test ids and roles, not function
names, so they must stay green without edits — a failure here means a rename
changed behaviour, not just a name.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/client-react
git commit -m "refactor(client-react): name UI handlers by effect

Widens rtc/name-functions-by-effect to client-react. Handler names only — the
on* props they are attached to are slots and are unchanged, so the shared
ui-contract specs and visual goldens are untouched."
```

---

### Task 7: Rename in `client-solid`

**Files:**
- Modify: `packages/client-solid/src/ui/**` — ~25 files (enumerate in Step 2)
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: nothing cross-package.

- [ ] **Step 1: Widen the glob**

Add `"packages/client-solid/**/*.{ts,tsx}",` to the `files` array.

- [ ] **Step 2: Produce the rename table and get it reviewed**

Run: `pnpm exec eslint packages/client-solid`

List every violation as `file:line  currentName  →  proposedName`, classifying
each interface/type member slot-vs-command per the Global Constraints, and pause
for review. `client-solid` is a port of `client-react` at full parity, so
**reuse Task 6's chosen names wherever the component is the same** — divergent
names across the two clients would make the parity harder to audit.

This package has **6 method-syntax members**, the mirror image of
`client-react`'s and all verified prop slots — convert to property syntax, do
not rename:
- `ui/credit/newRfq/DealerChecklist.tsx:65,66`
- `ui/credit/newRfq/InstrumentSelect.tsx:53,54,59`
- `ui/credit/newRfq/NewRfqPanel.tsx:293`

Note `CreditViewProvider.tsx:17,19` is **not** flagged: `exportHandler` is a
`let` with no function initializer, and `setExportCsvHandler` has a leading verb.

- [ ] **Step 3: Apply the approved renames**

- [ ] **Step 4: Verify lint, types, and tests**

Run: `pnpm exec eslint packages/client-solid`
Expected: clean.

Run: `pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/client-solid test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/client-solid
git commit -m "refactor(client-solid): name UI handlers by effect

Names match client-react's (Task 6) wherever the component is the same, so the
two clients stay auditable for parity."
```

---

### Task 8: Rename in `client-react-native`

**Files:**
- Modify: `packages/client-react-native/src/ui/**` — ~28 files (enumerate in Step 2)
- Modify: `packages/client-react-native/src/ui/shell/boot/BootCanvas.tsx:42`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: nothing cross-package.

- [ ] **Step 1: Widen the glob**

Add `"packages/client-react-native/**/*.{ts,tsx}",` to the `files` array.

- [ ] **Step 2: Produce the rename table and get it reviewed**

Run: `pnpm exec eslint packages/client-react-native`

List every violation and pause for review. Known site: `BootCanvas.tsx:42`
`const frameCallback` → `drawFrame` (the event-noun-suffix detector, the only
current instance).

**RN-specific hazard.** If a renamed function is called from inside a
Reanimated worklet, it needs its `"worklet"` directive preserved verbatim — a
function called in a worklet without it throws *"Tried to synchronously call a
Remote Function"* at runtime, and **jest cannot catch this**; only the simulator
can. `BootCanvas`'s draw path is worklet-adjacent, so after renaming, grep the
file for `"worklet"` and confirm every directive survived the edit.

- [ ] **Step 3: Apply the approved renames**

- [ ] **Step 4: Verify lint, types, and tests**

Run: `pnpm exec eslint packages/client-react-native`
Expected: clean.

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/client-react-native
git commit -m "refactor(client-react-native): name UI handlers by effect

frameCallback -> drawFrame plus the handle* sites. Worklet directives verified
intact — a missing \"worklet\" only fails on the simulator, never in jest."
```

---

### Task 9: Rename in `ui-contract` (3 sites, incl. the `handle`-as-noun case)

**Files:**
- Modify: `packages/ui-contract/src/shared/pages/shell/layout/LayoutEnginePage.ts:125,143`
- Modify: `packages/ui-contract/src/shared/pages/shell/boot/BootSequencePage.ts:46`
- Modify: every caller of those three page-object methods across
  `packages/ui-contract/src/specs/**` (find with grep in Step 3)
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: `LayoutEnginePage.resizeHandleExists(pathKey: string, i: number): boolean`,
  `LayoutEnginePage.resizeHandleElement(pathKey: string, i: number): HTMLElement`,
  `BootSequencePage.doneCallCount(): number`. These are used by the shared
  contract specs, which run against **both** `client-react` and `client-solid`.

- [ ] **Step 1: Widen the glob**

Add `"packages/ui-contract/**/*.{ts,tsx}",` to the `files` array.

- [ ] **Step 2: Confirm the violations**

Run: `pnpm exec eslint packages/ui-contract`
Expected: 3 errors — `handleExists` (`LayoutEnginePage.ts:125`), `handleElement`
(`:143`), `onDoneCount` (`BootSequencePage.ts:46`).

`const onSet = vi.fn()` in
`packages/ui-contract/src/specs/equities/chart/TimeframePills.contract.spec.ts:20`
must **not** be reported — a `vi.fn()` initializer is not a function value. If
it is reported, `functionValueOf` is wrong; fix the rule.

- [ ] **Step 3: Rename**

`handleExists` / `handleElement` are the documented false-positive class: here
`handle` is a **noun** — the resize handle, queried as
`` getByTestId(`handle-${pathKey}-${i}`) ``. Do **not** disable the rule. Rename
to disambiguate, which the surrounding doc comments already do in prose
("The handle element itself", "with the resize handle kept"):

- `handleExists` → `resizeHandleExists`
- `handleElement` → `resizeHandleElement`
- `onDoneCount` → `doneCallCount` (it counts `onDone` invocations)

Leave the `` `handle-${pathKey}-${i}` `` **test id string** unchanged — it
matches DOM emitted by `InhouseLayoutEngine`, and changing it would break the
selector.

Update callers:
```bash
grep -rn "handleExists\|handleElement\|onDoneCount" packages/
```
Also update the doc comment at `LayoutEnginePage.ts:130` that references
`handleExists`'s pathKey/index pair by name.

- [ ] **Step 4: Verify lint, types, and both clients' contract suites**

Run: `pnpm exec eslint packages/ui-contract`
Expected: clean.

Run: `pnpm build && pnpm typecheck`
Expected: PASS.

Run: `pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-solid test`
Expected: PASS — these page objects back the shared contract specs, so **both**
clients must be exercised. Running only one would leave the other broken until CI.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/ui-contract
git commit -m "refactor(ui-contract): disambiguate resize-handle page-object methods

handleExists/handleElement refer to the resize HANDLE (a noun), so ^handle[A-Z]
is a true false positive — resolved by disambiguating rather than disabling:
read cold, 'handleExists' really could mean 'does the handler exist'. Also
onDoneCount -> doneCallCount. Test id strings unchanged."
```

---

### Task 10: Rename in `client-prototype` (bindings + 3 hook-API interfaces)

**Files:**
- Modify: `packages/client-prototype/src/fx/useFxBlotter.ts:28-30,148,155,163`
- Modify: `packages/client-prototype/src/fx/useFxRates.ts:50-54,355,365,373,377,381`
- Modify: `packages/client-prototype/src/credit/useCreditRfqs.ts:64,69,158,368`
- Modify: the components consuming those APIs — `fx/Blotter/TradesBlotter.tsx:32`,
  `fx/Blotter/FxBlotterPanel.tsx:31,72`, plus the rest found in Step 3
- Modify: the remaining `handle*` sites across `client-prototype/src/**`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the rule id from Task 1.
- Produces: renamed members on `BlotterApi`, `RatesApi` (name per the file) and
  the credit hook's API type. `client-prototype` imports no `@rtc/*` package and
  nothing imports it, so the blast radius stops at this package.

- [ ] **Step 1: Widen the glob**

Add `"packages/client-prototype/**/*.{ts,tsx}",` to the `files` array.

- [ ] **Step 2: Produce the rename table and get it reviewed**

Run: `pnpm exec eslint packages/client-prototype`

Expected: ~40 handler errors **plus most of this package's 64 method-syntax
members** — by far the largest classification job in the plan, so budget for it.
Split them per the Global Constraints:

- **52 sit in `.tsx` component files** — prop slots on `*Props` interfaces →
  convert to property syntax, do not rename.
- **12 sit in the five `use*.ts` hook files** — candidate commands. Ten are the
  hook-API members tabled below (`useFxRates.ts` 5, `useFxBlotter.ts` 3,
  `useCreditRfqs.ts` 2); the remaining two (`layout/useSplit.ts`,
  `shell/Boot/useBootSequence.ts`) must be classified individually — a hook can
  return a *slot* it merely forwards to a component, in which case it converts
  to property syntax like any other slot.

  The `.tsx`-vs-`use*.ts` split is a strong prior, not a rule: verify each by
  grepping call sites, per the Global Constraints. The ten tabled members are
  read as `api.onSort(col.field)`, which is the vagueness the rule targets:

| type member | current | proposed |
|---|---|---|
| `BlotterApi` (`useFxBlotter.ts:28-30`) | `onSort` / `onQuery` / `onExport` | `toggleSort` / `setQuery` / `exportCsv` |
| `RatesApi` (`useFxRates.ts:50-54`) | `onNotional` / `onReset` / `onSell` / `onBuy` / `onDismiss` | `setNotional` / `resetTile` / `sellPair` / `buyPair` / `dismissTile` |
| credit API (`useCreditRfqs.ts:64,69`) | `onTab` / `onExport` | `selectTab` / `exportCsv` |

Verify each against its body before adopting — e.g. confirm `onReset` resets a
single tile rather than all of them. Pause for review on the full table.

- [ ] **Step 3: Apply the approved renames**

Rename the interface member, the backing `function` declaration, the property in
the hook's `return { … }` object, and every `api.*` call site. Note the return
objects use shorthand (`return { rows, sort, onSort, … }`), so renaming the
function declaration alone changes the key too — that is the intended single
edit, not two.

- [ ] **Step 4: Verify lint, types, and tests**

Run: `pnpm exec eslint packages/client-prototype`
Expected: clean.

Run: `pnpm --filter @rtc/client-prototype typecheck && pnpm --filter @rtc/client-prototype test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs packages/client-prototype
git commit -m "refactor(client-prototype): name hook-API commands by effect

BlotterApi.onSort -> toggleSort, RatesApi.onBuy -> buyPair, etc. These are
commands, not slots: read at the call site as api.onSort(col.field), the on*
prefix said when while hiding what."
```

---

### Task 11: Collapse the glob to the whole repo, and document the rule

**Files:**
- Modify: `eslint.config.mjs` (replace the 15-entry `files` array with `["**/*.{ts,tsx}"]`)
- Modify: `docs/architecture/17-web-client-up-close.md` (rule reference)
- Modify: `CLAUDE.md` (a naming-law pointer beside **UI Logic Placement**)
- Modify: `docs/lint-warnings.md` if `pnpm sync:lint-warnings` reports drift

**Interfaces:**
- Consumes: a clean tree from Tasks 2–10.
- Produces: the rule active repo-wide, including `tests/` and any package added
  later — no glob to keep in sync.

- [ ] **Step 1: Collapse the glob**

Replace the accumulated `files` array in the `rtc/name-functions-by-effect`
block with:

```js
    files: ["**/*.{ts,tsx}"],
```

Delete the "Scope widens one package per commit" line from the block comment —
it is no longer true.

- [ ] **Step 2: Verify the whole repo is clean**

Run: `pnpm exec eslint .`
Expected: no `rtc/name-functions-by-effect` findings anywhere. `tests/` was
already clean at plan time (0 sites), so any finding there is new work — apply
the naming procedure, do not narrow the glob.

- [ ] **Step 3: Document the rule in the architecture reference**

`docs/architecture/17-web-client-up-close.md` already explains
`rtc/no-render-functions` in prose (line ~100). Add a sibling paragraph for this
rule covering: the slot-vs-handler discriminator, that `onX` **props** are
correct and untouched, and both known limits (it cannot vouch for the
replacement name; `handle` is also a domain noun and the response is a
disambiguating rename). Link the spec:
`docs/superpowers/specs/2026-07-26-name-functions-by-effect-design.md`.

- [ ] **Step 4: Add the CLAUDE.md pointer**

Add a short section after **UI Logic Placement**:

```markdown
## Handler Naming

A function's own name must state its **effect** — what it does, to what — never
the occasion that triggers it. `rtc/name-functions-by-effect` enforces this on
every `.ts`/`.tsx`: `handleClick`, `onMessage`, `processClick` and
`frameCallback` all fail CI. **Slots are exempt and correct as `onX`** — a
function-typed prop (`onExecute: (d: Direction) => void`), or a method whose
sole parameter is the callback (`onTrade(listener: TradeListener)`) — because
their declarer must not know what gets attached. So
`<Car onYellowLight={prepare} />` is right and
`<Car onYellowLight={handleYellowLight} />` is not. Design:
`docs/superpowers/specs/2026-07-26-name-functions-by-effect-design.md`.
```

- [ ] **Step 5: Sync the lint-warnings ledger**

Run: `pnpm sync:lint-warnings && git diff --stat docs/lint-warnings.md`
Expected: no diff (the rule is `error`, not `warn`). If there is a diff, commit
it — `pnpm check:lint-warnings-drift` is a CI gate.

- [ ] **Step 6: Run the full local gauntlet**

Run: `pnpm check:doc-links`
Expected: all links OK (Steps 3–4 added relative links).

Run: `/rtc:gauntlet full`
Expected: green. This covers typecheck, unit tests, both ≥95% coverage gates,
type-aware ESLint, the lint-warnings ledger, build, and the `/devtools/` check.

Run: `pnpm test:e2e`
Expected: PASS. Excluded from the gauntlet, and it is the only tier that can
catch a rename that broke a lifecycle path jsdom cannot see.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs docs/architecture/17-web-client-up-close.md CLAUDE.md docs/lint-warnings.md
git commit -m "feat(lint): enable rtc/name-functions-by-effect repo-wide

Collapses the per-package glob now every package is clean, and documents the
slot-vs-handler discriminator in arch 17 + CLAUDE.md."
```

---

## Ship it

Follow the `shipping-repo-changes` skill: push the branch, open one PR for all
11 commits (a reviewer would not accept the rule while rejecting the renames —
the rule cannot land green without them), poll `gh run list --branch <branch>
--workflow CI` until the run matching your HEAD SHA is `completed`/`success`,
triage whether `origin/main` advanced, then `gh pr merge <n> --merge`.

**Watch for on this PR specifically:**
- **CI-only gates.** The two `ui:contract` ≥95% coverage gates and the x86-only
  jobs do not run locally. Renames should not move coverage, but confirm.
- **Code scanning is async.** CodeQL posts after the CI rollup — check the PR's
  advanced-security comments and open alerts *before* merging.
- **Sibling sessions.** `eslint.config.mjs` is touched by every task, so it is
  the likeliest semantic-conflict surface if another branch adds a rule. Check
  `git diff --name-only HEAD...origin/main` for it and catch up if it appears.
