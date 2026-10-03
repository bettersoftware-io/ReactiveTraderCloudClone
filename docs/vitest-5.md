# vitest 5 — spiked, parked

**Status (2026-10-03): PARKED on purpose. Nothing technical blocks it any more.**
The repo stays on vitest **4.1.x**. A full upgrade spike (first on 5.0.2, now
**5.0.3**) is kept on the unmerged branch
[`worktree-spike-vitest-5`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/tree/worktree-spike-vitest-5)
(tip `6d2a6c007`). It fixes three silent v5 behaviour changes and works around
one upstream mocking regression (see
[The mock regression](#the-mock-regression--concurrent-re-imports-after-viresetmodules)).
The failure that was open on 2026-09-27 is fixed on the branch: every gate
that was run is green. The branch is about 270 commits behind `main`.

The decision to park was a cost/benefit call, not a technical dead end: see
[Is it worth upgrading?](#is-it-worth-upgrading). The backlog entry lives in
[STATUS.md](STATUS.md) ("vitest 4 → 5").

## TL;DR

| | |
|---|---|
| Recorded gate (until 2026-09-27) | `vitest-browser-solid` peers on vitest `^4` only |
| Was that the real gate? | **No.** The adapter runs on v5 unchanged, and a pnpm `peerDependencyRules` override is enough |
| What actually broke | 3 behaviour changes, **none of which `pnpm test` noticed**, plus 1 upstream mocking regression |
| Open blocker | **None since 2026-10-03.** The 33 failures in two `client-solid` registry tests were a v5 regression with concurrent re-imports after `vi.resetModules()`; one line per test avoids it |
| Why parked | Small gain (test strictness, browser-mode DX we barely use) against a 3-week-old major with several silent traps; v4 still receives security backports |
| What is left to finish | Catch the branch up with `main`, re-run the full gates, and decide to un-park: see [How to resume](#how-to-resume) |

## What vitest 5 brings

Released **2026-09-03** (5.0.0), then 5.0.1 (09-15), 5.0.2 (09-25) and 5.0.3 (09-30). The
last 4.x is **4.1.11 (2026-08-18)**. Grouped by what it means here:

**Test strictness: the main gain.**
- A test **fails when an async assertion is not awaited** (#10868).
- `expect.poll` **fails** when the function does not resolve in time,
  instead of passing quietly (#10233).
- `toHaveTextContent` is strict; `toMatchTextContent` is the loose form
  (#10473).
- Mocks are **cleared before each test by default** (#10613).
- Hoistable calls (`vi.mock`, …) outside the top-level scope now throw
  (#10460).

The whole suite already passes with all of these on, so they found no latent
bug today. Their value is guarding tests written from now on.

**Browser mode developer experience.** A trace view with DOM snapshots,
the ARIA tree printed when a locator fails, `context.mark` / `page.mark`
tracing, and iframe scaling. This repo uses vitest browser mode for exactly one
job, the *visual-reach* coverage instrument, so the benefit here is small.

**Housekeeping and platform.**
- Node ≥ 22 and Vite ≥ 6.4 (we run Node 26 and Vite 8).
- `sequential` removed in favour of `concurrent`.
- `-t` uses `>` as its separator.
- Nested projects.
- A rewritten benchmark API.
- Coverage moves to the `@vitest/istanbuljs` packages.
- The json/junit/blob/html/attachments outputs all default to one `.vitest/`
  directory.
- Locators become objects.
- The config file is no longer looked up in ancestor directories.

**What does NOT force the move: security.** v4 keeps receiving advisory
backports. 4.1.11 fixed the `@vitest/mocker` redirect path traversal
(2026-08-18) and 4.1.10 fixed a browser-mode file-access bypass (2026-07-08);
even 3.2.x got fixes. There is no security clock.

## Is it worth upgrading?

**Not yet**, as of 2026-09-27.

For:
- Stricter tests by default, especially failing on un-awaited assertions.
- Staying current keeps the eventual jump small.
- Most of the work is already done and sits on the spike branch.

Against:
- **Three silent behaviour changes** hit this repo (below). Only a full local
  gauntlet **plus** the dispatch-only visual-reach tier surfaced them;
  per-PR CI would have missed one of them entirely.
- **One open mocking regression** with no upstream issue yet.
- **An abandoned adapter:** `vitest-browser-solid` has had no commit since
  2025-10-31, so we would depend on it through a peer-range override.
- **A 3-week-old major.** A 5.1 or a few more patches is the cheaper point
  to land on.

**Revisit when** any of these happens:
1. The open blocker is fixed upstream, or one of the options below is chosen.
2. A vitest 5.1 (or later) ships.
3. A v5-only feature becomes wanted.
4. A v4 advisory ships without a backport.

## What the spike changed

All on `worktree-spike-vitest-5`, each item measured, not assumed.

| change | where |
|---|---|
| `vitest`, `@vitest/ui`, `@vitest/coverage-v8`, `@vitest/coverage-istanbul`, `@vitest/browser`, `@vitest/browser-playwright` → **5.0.3** (5.0.2 until 2026-10-03) | every workspace manifest (all 27 projects) |
| `vitest-browser-react` 2.2 → **2.3.0** (peers `^4 \|\| ^5`) | `client-react` |
| `vitest-browser-solid` stays **1.0.1**, with `peerDependencyRules.allowedVersions: { "vitest-browser-solid>vitest": "^5.0.0" }` | `pnpm-workspace.yaml` |
| `waitForText` → `getByText(text, { exact: false })` (trap 1) | both clients' `tests/ui/visual/vitest-browser/visual.spec.tsx` |
| html reporter `outputFile.html` → `["html", { outputDir }]` (trap 2) | 13 `vitest*.config.ts`, plus both `vitest.app.coverage.config.ts` |
| `await import("../app{Head,Panel}Registry")` on its own, before the `Promise.all` re-import wave (the mock regression) | `client-solid`'s `appHeadRegistry.test.ts` and `appPanelRegistry.test.ts` |

**Why `vitest-browser-solid` is safe on v5.** Its entire runtime is about 60
lines. It uses exactly two `vitest/browser` APIs, `utils.getElementLocatorSelectors`
and `utils.debug`, and both are still exported unchanged by `@vitest/browser@5`.
Upstream PR [advancedtw/vitest-browser-solid#6](https://github.com/advancedtw/vitest-browser-solid/pull/6)
(open since 2026-09-06) widens the peer to `^4.0.0 || ^5.0.0`. Once a release
carries it, delete the override.

### Gate results on the spike branch

Measured on 5.0.2 on 2026-09-27. Only the solid contract-coverage row was
re-run on 5.0.3; the rest need a re-run after the catch-up with `main`.

| gate | v5 result |
|---|---|
| `pnpm build` / `pnpm typecheck` / `pnpm test` | ✅ green on the **first** try, before any fix. That is the point: see the traps |
| fast gauntlet (21 gates) | ✅ after trap 2's fix (Biome had flagged `.vitest/` debris) |
| `lint:eslint:types`, `check:lint-warnings-drift`, `build`, `check:devtools-dist`, `check:core-bundle` | ✅ |
| contract coverage — react | ✅ |
| contract coverage — **solid** | ✅ **1211 / 1211** on 5.0.3 with the registry-test fix, 98.63% statements / 93.76% branches (33 / 1211 failed before it, on 5.0.2 and 5.0.3 alike) |
| coverage — devtools core/app, async core, effect core | ✅ |
| visual-reach vitest-browser tier, react + solid | ✅ 1872 / 1872 each, after trap 1's fix (80 failures each before) |
| RN jest | n/a (RN tests run on jest) |
| Expo bundle smoke | not run locally (CI-only by design) |

## The traps

### Trap 1 — `browser.locators.exact` now defaults to `true`

- **Symptom:** 80 of 1872 visual-reach scenarios time out in **both** clients:
  `Cannot find element with locator: getByText('AWAITING AUTH GRANT')`.
  That's 8 scenarios × 10 skins (`login/wait-*`, `lock/wait-*`,
  `jarvis/overlay-guide`, `jarvis/panel-unsupported`).
- **Cause:** v4 matched `getByText` as a case-insensitive **substring**; v5
  matches the case-sensitive **whole string** (#10430). Several `waitForText`
  values in `packages/ui-contract/src/visual/scenarioActions.ts` are fragments
  of a longer label, e.g. `"RUN FULL DEMO · HANDS-FREE"` inside
  `"▶ RUN FULL DEMO · HANDS-FREE"`.
- **Fix used:** opt that one call site into `{ exact: false }`, in both
  clients. That is also what Playwright's `getByText` does when the golden
  tier reads the **same** `scenarioActions` entry, so the two tiers now agree.
  Flipping `browser.locators.exact: false` globally would also work, but it
  gives up the stricter default everywhere else.
- **Why it's dangerous:** that tier runs only in the dispatch-only
  `coverage-report.yml`. **No PR or post-merge workflow would have failed**;
  the next manual coverage dispatch would simply have gone red.

### Trap 2 — the html reporter ignores `outputFile.html`

- **Symptom:** after `pnpm test`, 12 packages grow an untracked
  `.vitest/` tree (`index.html` + `ui/assets/*.js`). Biome then fails on the
  bundled JS, and ESLint crashes with `ENOENT` if the tree changes mid-walk.
  `pnpm test` itself stays green.
- **Cause:** `@vitest/ui@5`'s `HTMLReporter` resolves its location only
  from its own `outputDir` option, defaulting to `.vitest`
  (`reporterDir = resolve(root, options.outputDir || ".vitest")`, #10620).
  The v4 key `outputFile: { html: "…/index.html" }` is silently ignored.
- **Fix used:** `reporters: ["default", ["html", { outputDir: "reports/unit/report" }]]`
  in 13 configs. Two configs needed more:
  - `client-react/vitest.app.coverage.config.ts` builds on its base with
    `mergeConfig`, which **concatenates arrays**. Re-declaring `reporters`
    there would run the base's html reporter as well, so the spike **replaces**
    `config.test.reporters` after the merge.
  - `client-solid/vitest.app.coverage.config.ts` had an `outputFile.html`
    that was **already inert on v4** (its base declares no html reporter), so
    it is simply dropped.
- **Checked and NOT affected:** an explicit `--outputFile.json=…`
  (`coverage-report.yml`) **is still honoured** on v5. It was verified by
  running it: the file lands at the given path and no `.vitest/` appears.
  Only the *default* location of json/junit moved.

### Trap 3 — the recorded gate was the wrong gate

The STATUS entry said vitest 5 was gated on `vitest-browser-solid` releasing
a `^5` peer. That was a reading of `package.json`, not a measurement. The
adapter works as published (see above). The real blockers were traps 1, 2
and the mock regression below, and none of them was in the recorded list of v5
breaking changes. That list (`toHaveTextContent`, `sequential`, locator
objects, `expect.poll`) turned out harmless here: 6 files use
`toHaveTextContent` or `sequential`, and all pass.

**Lesson:** a green `pnpm test` says almost nothing about a test-runner
major. Judge it on the full gauntlet **and** the vitest-browser tiers:
`pnpm --filter @rtc/client-{react,solid} test:ui:visual:vitest-browser:{react,solid}:coverage`.

## The mock regression — concurrent re-imports after `vi.resetModules()`

This was the open blocker until 2026-10-03. It is a vitest 5 regression
(5.0.0 through 5.0.3; 4.1.11 is fine), and one line per test avoids it.

### What the two tests check

`client-solid/src/ui/shell/layout/engine/appHeadRegistry.tsx` maps each panel
id to the component that draws its header, and `appPanelRegistry.tsx` does
the same for panel bodies:

```tsx
export const appHeadRegistry = {
  "fx-rates":   () => <LiveRatesHead />,
  "fx-blotter": () => <FxBlotterHead />,
  // …12 entries
};
```

The tests check the **wiring**: `fx-rates` → `LiveRatesHead`, never another
head. A swap still renders a plausible-looking app, so only this test catches
it. Solid compiles `<LiveRatesHead />` into `createComponent(LiveRatesHead, {})`,
which **runs** the component. So the tests replace that one seam and read back
which component would have been built:

```ts
vi.mock("solid-js/web", async (importOriginal) => ({
  ...(await importOriginal()),
  createComponent: (component) => ({ __component: component }),
}));
```

### Why it broke on v5 (contract-coverage run only)

1. The contract-coverage config also runs co-located `src/ui/**/*.test.ts`.
   Its setup file `tests/ui/contract/solid/setup.ts` imports `./render`,
   which imports `registry.tsx`, which does `import { App } from "#/ui/App"`.
   So the **real** app, both registries included, is loaded with the real
   `createComponent` before any test file's `vi.mock` applies.
2. The tests work around this with `vi.resetModules()` and then re-import the
   registry and every head fresh. That is the workaround vitest's maintainers
   recommend for a setup-file preload
   ([vitest#10104](https://github.com/vitest-dev/vitest/issues/10104)).
3. The re-import was **one `Promise.all` of 13 to 16 dynamic imports**. Every
   one of those modules statically imports the mocked `solid-js/web`.
4. **On v5, only the first of those concurrent importers gets the mock. The
   rest get the real module**, with no warning. The registry then runs
   `LiveRatesHead` for real and throws
   `useViewModel must be used within ViewModelProvider`. On v4 every importer
   gets the mock.

Under the unit config (`pnpm test`, which CI also runs) both tests **pass**
on v5, because that config has no preloading setup file.

### Minimal reproduction

No plugins, default pool. Passes on 4.1.11; fails on 5.0.0 and 5.0.3, on both
the `forks` and `threads` pools (Node 26.10, macOS arm64).

```js
// dep.js
export const which = "real";

// a1.js, a2.js, a3.js (three identical files)
import { which } from "./dep.js";
export const seen = () => which;

// setup.js
import "./a1.js";
import "./a2.js";
import "./a3.js";

// vitest.config.js
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { setupFiles: ["./setup.js"] } });

// concurrent.test.js
import { expect, it, vi } from "vitest";

vi.mock("./dep.js", () => ({ which: "mock" }));

it("concurrent re-imports after resetModules all see the mock", async () => {
  vi.resetModules();
  const mods = await Promise.all([import("./a1.js"), import("./a2.js"), import("./a3.js")]);
  expect(mods.map((m) => m.seen())).toEqual(["mock", "mock", "mock"]);
  // 5.0.3: ["mock", "real", "real"]
});
```

| variant of the reproduction (5.0.3) | result |
|---|---|
| as above | **fails**: `["mock", "real", "real"]` |
| the same three imports awaited one after another | passes |
| one import of a module that statically imports `a1`–`a3` | passes |
| no `setupFiles` entry | passes |
| async factory with `importOriginal` instead of a sync one | fails the same way |
| no `vi.resetModules()` | fails on **4.1.11 too**: that is the known limitation in vitest#10104, not this regression |

So all three ingredients are needed: a setup-file preload, `vi.resetModules()`,
and **concurrent** re-imports.

### What was measured in the repo

| experiment (v5, contract-coverage config) | result |
|---|---|
| both registry tests as committed, 5.0.2 and 5.0.3 | 33 / 39 fail |
| same files, unit config | all pass |
| same files, vitest **4** | pass (whole run: 1211 / 1211) |
| registry module identity before vs after `resetModules` | **different**: the reset works |
| the test's own `import("solid-js/web")` | **mocked** |
| `vi.doMock(...)` re-registered right after `resetModules` | still fails |
| setup file removed from `setupFiles` | passes |
| registry imported under a new id, `import("../appHeadRegistry?fresh")` | passes |
| **registry awaited on its own before the `Promise.all`** (5.0.3) | **39 / 39 pass; whole tier 1211 / 1211** |

The first explanation recorded here (2026-09-27) was that a per-importer cache
survives `resetModules`. That was **wrong about the trigger**: sequential
re-imports are fine. The trigger is concurrency. The cause inside vitest is
not confirmed.

### The fix used

```ts
vi.resetModules();
await import("../appHeadRegistry"); // loads the whole graph through one import
const [/* … */] = await Promise.all([/* the same imports as before */]);
```

The registry statically imports every head, so awaiting it alone loads the
whole graph through a single import. The `Promise.all` that follows only reads
modules that are already loaded. No assertion changes, the tests stay in the
contract-coverage run, and the change is also correct on v4.

### Upstream

No report of this existed on 2026-10-03 (searched `vitest-dev/vitest` for
`resetModules`, `vi.mock` and `setupFiles`). Related but different:

- [vitest#10104](https://github.com/vitest-dev/vitest/issues/10104) (open):
  the setup-preload limitation itself, on v4. Its recommended workaround is
  the pattern that regressed.
- [vitest#11460](https://github.com/vitest-dev/vitest/issues/11460) (open):
  the same symptom (first import gets the mock, the rest the real module),
  but for concurrent imports from **one** importer, and it reproduces on
  vitest 2, 3 and 4. It may share a cause.

An issue with the reproduction above is drafted but **not filed yet**.
vitest's `CONTRIBUTING.md` requires issues to be opened by a real person, so
it is not something an agent session should post.

### Options that are no longer needed

Recorded on 2026-09-27, before the trigger was found: import the registry
under a `?fresh` id (relies on internals); make the contract harness load
`App` lazily (harness work for its own PR, still a valid simplification); or
run the two tests under the unit config only (measured: gate 98.59%,
`appPanelRegistry.tsx` drops to 29 / 32 lines).

## How to resume

1. Fetch `worktree-spike-vitest-5`, then merge `origin/main` in. Expect
   conflicts in manifests and `pnpm-lock.yaml`. Re-run `pnpm install`, and
   check `pnpm outdated -r vitest` for a newer 5.x first.
2. Check whether a `vitest-browser-solid` release now peers on `^5`. If so,
   drop the `peerDependencyRules` block.
3. Keep the registry-test fix from the branch (see
   [The fix used](#the-fix-used)). Drop it only once upstream fixes the
   regression.
4. Run `/rtc:gauntlet full` **and** both vitest-browser coverage tiers (see
   the trap 3 lesson). Grep for `.vitest/` debris after any test run.
5. Watch the leading document of `pnpm-lock.yaml`: a local pnpm run can
   rewrite its `@pnpm/exe` entries. Before committing, compare that document
   with `main`'s and keep `main`'s.
6. Delete the vitest entry in [STATUS.md](STATUS.md) and update this doc's
   status line.

## Sources

- vitest 5.0.0 release notes: <https://github.com/vitest-dev/vitest/releases/tag/v5.0.0>
  (issue numbers above refer to `vitest-dev/vitest`).
- vitest security advisories: <https://github.com/vitest-dev/vitest/security/advisories>
- Related upstream mocking issues: <https://github.com/vitest-dev/vitest/issues/10104>,
  <https://github.com/vitest-dev/vitest/issues/11460>
- `vitest-browser-solid` peer widening: <https://github.com/advancedtw/vitest-browser-solid/pull/6>
