# Name JSX Handlers (Inline-Callback Ban) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the extract-and-name half of the handler doctrine — `docs/handler-naming.md` prescribes it but `rtc/name-functions-by-effect` "cannot enforce extraction" — with a new rule `rtc/name-jsx-handlers`, and migrate all existing inline JSX callbacks (~71 client-react, ~82 client-solid, ~38 client-react-native, 0 devtools-app).

**Architecture:** New custom ESLint rule in `eslint-rules/` (same shape as `no-render-functions.mjs`): flag any `on[A-Z]*` (and Solid `on:*`) JSX attribute whose value is an inline arrow/function expression. Registered at **error** per package, glob added in the same PR as that package's migration, so the tree is never red: PR 1 = rule + client-react (+ devtools-app, zero sites); PR 2 = client-solid (also deletes the 26 `solid/reactivity` event-binding disables — cross-plan with `2026-09-01-solid-reactivity-disable-reduction.md`); PR 3 = client-react-native. Naming of extracted handlers follows `docs/handler-naming.md` (effect names; `rtc/name-functions-by-effect` rejects `handle*`).

**Tech Stack:** ESLint flat config, `RuleTester` + vitest (`pnpm test:rules`), React Compiler (ADR-003 — extraction inside a component costs nothing; the compiler memoizes).

**Spec:** 2026-09-01 code-quality session decision: "Ban + full migration", error severity, no ledger phase. Doctrine: `docs/handler-naming.md`; design lineage: `docs/superpowers/specs/2026-07-26-name-functions-by-effect-design.md` §"Handlers get names even when the body is one line".

## Global Constraints

- One worktree + PR per task below (each is independently green); shipping-repo-changes rules apply.
- Extracted functions must be **function declarations** (`func-style: ["error", "declaration"]` is repo-wide) placed per `rtc/component-newspaper` ordering (lede component first, helpers below — but handlers used by the component body are *inside* the component, above the `return`).
- Handler names state the **effect**, never the occasion: `changeNotional`, `halveNotional`, `submitTicket` — never `handleX`/`onXClicked` (`rtc/name-functions-by-effect` enforces this).
- Zero new `eslint-disable`. Zero behaviour change: no assertion in any test tier may change; contract/visual/e2e are the witnesses.
- Run before each push: `pnpm lint:eslint && pnpm test:rules && npx biome ci .` plus the migrated package's test suite.

---

### Task 1: The rule, its tests, and the client-react + devtools-app migration

**Files:**
- Create: `eslint-rules/name-jsx-handlers.mjs`
- Create: `eslint-rules/name-jsx-handlers.test.mjs`
- Modify: `eslint.config.mjs` (import ~line 8; `rtcPlugin` map ~line 96; new block after the `rtc/name-functions-by-effect` block ~line 410)
- Modify: ~30 files under `packages/client-react/src/**/*.tsx` (71 sites — enumerate in Step 5)
- Modify: `docs/handler-naming.md` + the header comment of `eslint-rules/name-functions-by-effect.mjs` (their "cannot enforce extraction" limit is now closed — Step 8)

**Interfaces:**
- Produces: named export `nameJsxHandlers`; plugin id `rtc/name-jsx-handlers`; messageId `inlineHandler`. Tasks 2–3 only extend the block's `files` array.

- [ ] **Step 1: Write the failing rule test**

`eslint-rules/name-jsx-handlers.test.mjs` (harness copied from `no-render-functions.test.mjs`):

```js
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { nameJsxHandlers } from "./name-jsx-handlers.mjs";

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

ruleTester.run("name-jsx-handlers", nameJsxHandlers, {
  valid: [
    {
      name: "named handler reference is the prescribed form",
      code: "const el = <input onChange={changeNotional} />;",
    },
    {
      name: "named factory call is legal (the factory is named)",
      code: "const el = <button onClick={selectTab(id)} />;",
    },
    {
      name: "member handler reference is legal",
      code: "const el = <button onClick={vmActions.submitTicket} />;",
    },
    {
      name: "non-handler prop takes an inline arrow (render prop)",
      code: "const el = <List renderItem={({ item }) => <Row item={item} />} />;",
    },
    {
      name: "lowercase on-prefix is not a handler slot",
      code: "const el = <Foo once={() => 1} />;",
    },
  ],
  invalid: [
    {
      name: "inline arrow on onClick",
      code: "const el = <button onClick={() => submit()} />;",
      errors: [{ messageId: "inlineHandler" }],
    },
    {
      name: "inline async arrow on onPress",
      code: "const el = <Pressable onPress={async () => { await submit(); }} />;",
      errors: [{ messageId: "inlineHandler" }],
    },
    {
      name: "inline function expression on onChange",
      code: "const el = <input onChange={function (e) { change(e); }} />;",
      errors: [{ messageId: "inlineHandler" }],
    },
    {
      name: "Solid namespaced on:click",
      code: "const el = <button on:click={() => submit()} />;",
      errors: [{ messageId: "inlineHandler" }],
    },
  ],
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:rules -- name-jsx-handlers`
Expected: FAIL — cannot resolve `./name-jsx-handlers.mjs`.

- [ ] **Step 3: Write the rule**

`eslint-rules/name-jsx-handlers.mjs`:

```js
// rtc/name-jsx-handlers — a JSX event slot receives a NAMED handler, never an
// inline function expression.
//
// docs/handler-naming.md: an inline arrow is maximally coupled to its one
// call site and hides its effect behind plumbing; extract and name it —
// `onChange={changeNotional}` over `onChange={(e) => { … }}` — even when the
// body is one line. This rule closes the enforcement gap that
// rtc/name-functions-by-effect documents ("the rule cannot enforce
// extraction — it only sees the identifier a handler is already bound to").
//
// Flags: an on[A-Z]* JSX attribute (or Solid's namespaced `on:*`) whose value
// is an ArrowFunctionExpression or FunctionExpression.
//
// Deliberately NOT flagged:
// - Named references and member references (`onClick={submitTicket}`,
//   `onClick={vm.submitTicket}`) — the prescribed form.
// - Call results (`onClick={selectTab(id)}`) — the factory carries the name.
// - Non-handler props (`renderItem={…}`, `children={…}`) — only the on-slot
//   naming convention marks an attribute as an event slot.

const HANDLER_ATTR = /^on[A-Z]/;

function isHandlerAttribute(attr) {
  if (attr.name.type === "JSXIdentifier") {
    return HANDLER_ATTR.test(attr.name.name);
  }

  // Solid's delegated-vs-native syntax: on:click / oncapture:click.
  if (attr.name.type === "JSXNamespacedName") {
    return /^on(capture)?$/.test(attr.name.namespace.name);
  }

  return false;
}

export const nameJsxHandlers = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "JSX event slots take a named handler, never an inline function — the handler's name must state its effect (docs/handler-naming.md)",
    },
    schema: [],
    messages: {
      inlineHandler:
        "Extract this inline {{kind}} into a named handler whose name states its effect — e.g. onChange={changeNotional}. See docs/handler-naming.md.",
    },
  },
  create(context) {
    return {
      "JSXAttribute > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)"(
        node,
      ) {
        const attr = node.parent.parent;

        if (!isHandlerAttribute(attr)) {
          return;
        }

        context.report({
          node,
          messageId: "inlineHandler",
          data: {
            kind:
              node.type === "ArrowFunctionExpression"
                ? "arrow"
                : "function expression",
          },
        });
      },
    };
  },
};
```

- [ ] **Step 4: Run the rule tests to verify they pass, then register the rule**

Run: `pnpm test:rules -- name-jsx-handlers` → PASS.

In `eslint.config.mjs`: add the import next to the other rule imports (line ~8):

```js
import { nameJsxHandlers } from "./eslint-rules/name-jsx-handlers.mjs";
```

add `"name-jsx-handlers": nameJsxHandlers,` to the shared `rtcPlugin.rules` map (~line 96), and add a block after the `rtc/name-functions-by-effect` block:

```js
  {
    // Inline JSX callbacks are banned — a handler is extracted and named for
    // its effect (docs/handler-naming.md). Globs are added per package AS its
    // backlog is migrated (client-solid and client-react-native land in their
    // own migration PRs); tests are out of scope (throwaway wiring is fine
    // there), and client-prototype is out of scope like everywhere else.
    files: [
      "packages/client-react/src/**/*.tsx",
      "packages/devtools-app/src/**/*.tsx",
    ],
    ignores: ["**/__tests__/**", "**/*.{test,spec}.tsx"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/name-jsx-handlers": "error" },
  },
```

- [ ] **Step 5: Enumerate and migrate client-react's 71 sites**

Enumerate: `pnpm lint:eslint 2>&1 | grep -c "name-jsx-handlers"` and list files with `pnpm lint:eslint 2>&1 | grep -B2 "name-jsx-handlers"`.

Transform recipe, per site — extract into a function declaration inside the component, above the `return`, named for its effect:

```tsx
// before (packages/client-react-native shape shown; web identical with onClick)
<Pressable
  onPress={() => {
    notional.change(String(Math.max(NOTIONAL_FLOOR, numericValue / 2)));
  }}
/>

// after
function halveNotional(): void {
  notional.change(String(Math.max(NOTIONAL_FLOOR, numericValue / 2)));
}
…
<Pressable onPress={halveNotional} />
```

Rules of the transform:
- The body moves verbatim — no simplification, no reordering, no renaming of
  anything inside it.
- Parameterised handlers keep their parameter: `onChange={(e) => …}` →
  `function changeNotional(e: ChangeEvent<HTMLInputElement>): void { … }` —
  copy the parameter type from the JSX element's prop type (hover/`tsc` will
  reject a wrong one).
- A loop-body arrow that closes over the loop variable
  (`items.map((item) => <Row onClick={() => select(item.id)} />)`) extracts to
  a named factory at component scope — `function selectItem(id: string) { return () => select(id); }`,
  used as `onClick={selectItem(item.id)}` — or, where a `Row` component
  already takes the datum, prefer passing `onSelect={select}` + the id down.
  Pick per site; both are legal under the rule.
- After each batch of ~10 files: `pnpm lint:eslint` and
  `pnpm --filter @rtc/client-react test`.

- [ ] **Step 6: Full verification**

Run: `pnpm lint:eslint` → 0 errors. `pnpm --filter @rtc/client-react test` → green (contract suite included). `pnpm test:e2e` → green (belt-and-braces for the web client's interaction paths). `npx biome ci .` → clean.

- [ ] **Step 7: Commit the rule + migration**

```bash
git add eslint-rules/name-jsx-handlers.mjs eslint-rules/name-jsx-handlers.test.mjs eslint.config.mjs packages/client-react/src
git commit -m "lint: rtc/name-jsx-handlers — inline JSX callbacks banned; migrate client-react (71 sites)"
```

- [ ] **Step 8: Close the documented limit**

In `docs/handler-naming.md` §"Handlers get names even when the body is one line", append: `Since 2026-09, rtc/name-jsx-handlers enforces the extraction itself — an inline arrow in an on-slot is a lint error in migrated packages.` In `eslint-rules/name-functions-by-effect.mjs`'s header, amend the "HANDLERS GET NAMES…" paragraph's "The rule cannot enforce extraction" sentence with `(rtc/name-jsx-handlers now does)`. Run `pnpm check:doc-links`; commit:

```bash
git add docs/handler-naming.md eslint-rules/name-functions-by-effect.mjs
git commit -m "docs: the extraction limit is closed by rtc/name-jsx-handlers"
```

Push, PR, CI loop, merge.

### Task 2: client-solid migration (82 sites + the 26 event-binding disables)

**Files:**
- Modify: `eslint.config.mjs` (Task 1's block: add `"packages/client-solid/src/**/*.tsx"`)
- Modify: ~35 files under `packages/client-solid/src/**/*.tsx`

**Interfaces:**
- Consumes: `rtc/name-jsx-handlers` from Task 1.
- Produces: also deletes the 26 `solid/reactivity` disables justified as "native event-handler binding of a props callback" (see plan `2026-09-01-solid-reactivity-disable-reduction.md` Task 1 — this PR **is** that task; do not do it twice).

- [ ] **Step 1: Extend the glob, enumerate**

Add the solid glob to Task 1's block. Enumerate: `pnpm lint:eslint 2>&1 | grep -c "name-jsx-handlers"` (expect ~82).

- [ ] **Step 2: Migrate — Solid-specific recipe**

Same transform as Task 1 Step 5 with two Solid twists:

- **Components run once** — an extracted `function submitTicket() { … }` in
  component scope is created once; reading `props.x` *inside* its body is a
  deferred read (runs at event time), which is exactly what `solid/reactivity`
  wants. This is why the 26 sites currently written as
  `// eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback…`
  `onClick={props.onX}` convert to a named wrapper **and lose the directive**:

  ```tsx
  // before
  // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
  <button on:click={props.onDismiss}>
  // after
  function dismissOverlay(e: MouseEvent): void {
    props.onDismiss(e);
  }
  …
  <button on:click={dismissOverlay}>
  ```

  Enumerate those 26: `grep -rn "native event-handler binding" packages/client-solid/src`.
- **Do not extract a tracked-scope read into component scope**: if the inline
  arrow reads a signal/prop to *compute JSX* it stays a render concern — but
  an on-slot arrow never does; its body runs at event time. If any site
  genuinely mixes the two, stop and treat it under the sibling plan's Task 2.

- [ ] **Step 3: Verify**

Run: `pnpm lint:eslint` → 0 errors **and** compare `solid/reactivity` warning count before/after (`pnpm sync:lint-warnings` then `git diff docs/lint-warnings.md`) — the count must not increase; the ledger must be committed if it changed. `pnpm --filter @rtc/client-solid test` → green (contract 507 included). Solid e2e: `pnpm test:e2e` → green.

- [ ] **Step 4: Commit + ship**

```bash
git add eslint.config.mjs packages/client-solid/src docs/lint-warnings.md
git commit -m "lint: name-jsx-handlers on client-solid (82 sites); named wrappers retire 26 solid/reactivity disables"
```

Push, PR, CI loop, merge.

### Task 3: client-react-native migration (38 sites)

**Files:**
- Modify: `eslint.config.mjs` (Task 1's block: add `"packages/client-react-native/src/**/*.tsx"` and `"packages/client-react-native/app/**/*.tsx"`)
- Modify: ~20 files under `packages/client-react-native/src/**/*.tsx`

- [ ] **Step 1: Extend the glob, enumerate, migrate**

Same recipe as Task 1 Step 5 (the worked example above *is* the RN
`onPress` case). RN twist: handlers passed into Reanimated worklet contexts
must keep/gain the `"worklet"` directive if the inline body had one (grep the
site for `"worklet"` before moving); jest cannot catch a missing directive —
if any site is inside `useAnimatedStyle`/`useFrameCallback` scope, verify on
the simulator per `docs`-recorded practice.

- [ ] **Step 2: Verify**

Run: `pnpm lint:eslint` → 0. `pnpm --filter @rtc/client-react-native test` → both runners green. If any touched file participates in the RN visual goldens (`tests/visual/`), run `pnpm --filter @rtc/client-react-native test:rn:visual:simctl` — expect 0 diffs (handler extraction cannot change pixels; a diff means a transform error).

- [ ] **Step 3: Commit + ship**

```bash
git add eslint.config.mjs packages/client-react-native/src packages/client-react-native/app
git commit -m "lint: name-jsx-handlers on client-react-native (38 sites)"
```

Push, PR, CI loop, merge. After this PR the rule covers every in-scope package; `pnpm check:react-policies` needs no change (the rule is not one of the tracked policies — add it there only if a fifth policy key is ever wanted).
