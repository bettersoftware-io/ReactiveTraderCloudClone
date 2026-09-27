# vitest 5 — spiked, parked

**Status (2026-09-27): PARKED on purpose, not blocked by a missing release.**
The repo stays on vitest **4.1.x**. A full upgrade spike to **5.0.2** was run
and is kept on the unmerged branch
[`worktree-spike-vitest-5`](https://github.com/bettersoftware-io/ReactiveTraderCloudClone/tree/worktree-spike-vitest-5)
(tip `ffee80039`). It fixes three silent v5 behaviour changes. One failure is
still open (see [The open blocker](#the-open-blocker--mocks-lost-across-viresetmodules)).
Every local gate but one is green.

The decision to park was a cost/benefit call, not a technical dead end: see
[Is it worth upgrading?](#is-it-worth-upgrading). The backlog entry lives in
[STATUS.md](STATUS.md) ("vitest 4 → 5").

## TL;DR

| | |
|---|---|
| Recorded gate (until 2026-09-27) | `vitest-browser-solid` peers on vitest `^4` only |
| Was that the real gate? | **No.** The adapter runs on v5 unchanged, and a pnpm `peerDependencyRules` override is enough |
| What actually broke | 3 behaviour changes, **none of which `pnpm test` noticed**, plus 1 open mocking regression |
| Open blocker | `client-solid` contract-coverage gate: 33 failures in two registry tests (`vi.mock` + `vi.resetModules()`) |
| Why parked | Small gain (test strictness, browser-mode DX we barely use) against a 3-week-old major with several silent traps; v4 still receives security backports |
| Recommended way to finish | Option 4 + option 1 [below](#four-ways-to-unblock-it) |

## What vitest 5 brings

Released **2026-09-03** (5.0.0), then 5.0.1 (09-15) and 5.0.2 (09-25). The
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
| `vitest`, `@vitest/ui`, `@vitest/coverage-v8`, `@vitest/coverage-istanbul`, `@vitest/browser`, `@vitest/browser-playwright` → **5.0.2** | every workspace manifest (all 27 projects) |
| `vitest-browser-react` 2.2 → **2.3.0** (peers `^4 \|\| ^5`) | `client-react` |
| `vitest-browser-solid` stays **1.0.1**, with `peerDependencyRules.allowedVersions: { "vitest-browser-solid>vitest": "^5.0.0" }` | `pnpm-workspace.yaml` |
| `waitForText` → `getByText(text, { exact: false })` (trap 1) | both clients' `tests/ui/visual/vitest-browser/visual.spec.tsx` |
| html reporter `outputFile.html` → `["html", { outputDir }]` (trap 2) | 13 `vitest*.config.ts`, plus both `vitest.app.coverage.config.ts` |

**Why `vitest-browser-solid` is safe on v5.** Its entire runtime is about 60
lines. It uses exactly two `vitest/browser` APIs, `utils.getElementLocatorSelectors`
and `utils.debug`, and both are still exported unchanged by `@vitest/browser@5`.
Upstream PR [advancedtw/vitest-browser-solid#6](https://github.com/advancedtw/vitest-browser-solid/pull/6)
(open since 2026-09-06) widens the peer to `^4.0.0 || ^5.0.0`. Once a release
carries it, delete the override.

### Gate results on the spike branch

| gate | v5 result |
|---|---|
| `pnpm build` / `pnpm typecheck` / `pnpm test` | ✅ green on the **first** try, before any fix. That is the point: see the traps |
| fast gauntlet (21 gates) | ✅ after trap 2's fix (Biome had flagged `.vitest/` debris) |
| `lint:eslint:types`, `check:lint-warnings-drift`, `build`, `check:devtools-dist`, `check:core-bundle` | ✅ |
| contract coverage — react | ✅ |
| contract coverage — **solid** | ❌ **33 / 1211 fail**: the open blocker (v4 baseline: 1211 / 1211) |
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
and the open one below, and none of them was in the recorded list of v5
breaking changes. That list (`toHaveTextContent`, `sequential`, locator
objects, `expect.poll`) turned out harmless here: 6 files use
`toHaveTextContent` or `sequential`, and all pass.

**Lesson:** a green `pnpm test` says almost nothing about a test-runner
major. Judge it on the full gauntlet **and** the vitest-browser tiers:
`pnpm --filter @rtc/client-{react,solid} test:ui:visual:vitest-browser:{react,solid}:coverage`.

## The open blocker — mocks lost across `vi.resetModules()`

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

### Why it breaks on v5 (contract-coverage run only)

1. The contract-coverage config also runs co-located `src/ui/**/*.test.ts`.
   Its setup file `tests/ui/contract/solid/setup.ts` imports `./render`,
   which imports `registry.tsx`, which does `import { App } from "#/ui/App"`
   at line 137. So the **real** app, both registries included, is loaded
   with the real `createComponent` before any test file's `vi.mock` applies.
2. The tests work around this with `vi.resetModules()` and then re-import the
   registry and every head fresh. The workaround is documented at length in
   both test files.
3. **On v4 the fresh registry gets the mocked `createComponent`. On v5 it
   gets the real one**, runs `LiveRatesHead` for real, and throws
   `useFxView must be used within a FxViewProvider`.

Under the unit config (`pnpm test`, which CI also runs) both tests **pass**
on v5, because that config has no preloading setup file.

### What was measured

| experiment (v5, contract-coverage config, `appHeadRegistry.test.ts` alone) | result |
|---|---|
| as committed | 14 / 15 fail |
| same file, unit config | 15 / 15 pass |
| same file, vitest **4** | passes (whole run: 1211 / 1211) |
| diagnostic: registry module identity before vs after `resetModules` | **different**: the reset works |
| diagnostic: the test's own `import("solid-js/web")` | **mocked** |
| `vi.doMock(...)` re-registered right after `resetModules` | still 14 / 15 fail |
| setup file removed from `setupFiles` | **15 / 15 pass** |
| registry imported under a new id, `import("../appHeadRegistry?fresh")` | **15 / 15 pass** |
| `resetModules` implementation, v4 vs v5 (`vitest/dist/chunks/utils.*.js`) | byte-identical |

**Working explanation (unconfirmed):** v5's module runner caches, per importer,
which `solid-js/web` instance an import resolved to, including the "is this
mocked?" decision. `resetModules` clears the module's exports but not that
per-importer cache. So a re-evaluated registry reuses the real `solid-js/web`
it resolved during the setup preload, while a never-seen importer (the test
file, or `?fresh`) goes through the mocker. No matching upstream issue existed
on 2026-09-27.

### Four ways to unblock it

**1. File upstream, keep parked.** Minimal repro: a package with a mocked
dependency, a `setupFiles` entry that preloads a module importing it,
`vi.resetModules()`, a re-import; v4 passes, v5 fails.
- For: fixes the root cause; very likely a genuine regression others will hit;
  no hack in our code.
- Against: unknown wait. Upstream may call it intended, which leaves options
  2–4 anyway.
- Cost: about an hour for the repro.

**2. Work around it in the two tests.** Import the registry under a fresh
module id (`?fresh`).
- For: a tiny change, measured to work.
- Against: it relies on vitest internals and could break silently on a
  patch release. TypeScript cannot resolve a `?fresh` specifier, so it needs a
  cast or a string variable (lint/TS suppressions are banned here; this part
  was **not** verified).

**3. Stop the setup file preloading `App`.** Make the `AppShell` token in
`tests/ui/contract/solid/registry.tsx` load `App` lazily. The registries then
load after each test file's `vi.mock`, and the whole `resetModules` workaround
in both tests can be deleted.
- For: removes the root cause, simplifies both tests, and spares every future
  mock-based `src/ui` test the same trap.
- Against: changes the shared contract harness that 6 `AppShell` specs use.
  Solid's lazy loading adds an async step those specs may need to await, and
  the Solid harness would start to differ from React's.
- Cost: not measured.

**4. Run those two tests under the unit config only.** Exclude them from the
contract-coverage run. Their assertions keep running under `pnpm test`, which
passes on v5, so **no assertion is lost**. Measured on the spike branch with
both files excluded:
- The gate still passes at **98.59%** statements (bar 95%; branches 93.76%,
  bar 85%).
- `appHeadRegistry.tsx` stays at **17 / 17** lines, since other specs render
  the whole app.
- `appPanelRegistry.tsx` drops to **29 / 32** lines and **1 / 2** branches.
- For: the smallest change, and nothing hidden.
- Against: those two files lose a little *counted* coverage. The tests exist
  partly because `appPanelRegistry` once sat at 56% contract coverage.

**Recommendation: 4 + 1.** That lands v5 without a hack, and if upstream fixes
the regression, putting the two tests back is a one-line revert. Option 3 is
the thorough fix, but it is harness work for its own PR, not part of a
dependency bump.

## How to resume

1. Fetch `worktree-spike-vitest-5`, then merge `origin/main` in. Expect
   conflicts in manifests and `pnpm-lock.yaml`. Re-run `pnpm install`, and
   check `pnpm outdated -r vitest` for a newer 5.x first.
2. Check whether a `vitest-browser-solid` release now peers on `^5`. If so,
   drop the `peerDependencyRules` block.
3. Apply the chosen unblock option above.
4. Run `/rtc:gauntlet full` **and** both vitest-browser coverage tiers (see
   the trap 3 lesson). Grep for `.vitest/` debris after any test run.
5. Watch the local `@pnpm/exe` lockfile block: every local pnpm run re-adds
   25 local-only lines that must **not** be committed.
6. Delete the vitest entry in [STATUS.md](STATUS.md) and update this doc's
   status line.

## Sources

- vitest 5.0.0 release notes: <https://github.com/vitest-dev/vitest/releases/tag/v5.0.0>
  (issue numbers above refer to `vitest-dev/vitest`).
- vitest security advisories: <https://github.com/vitest-dev/vitest/security/advisories>
- `vitest-browser-solid` peer widening: <https://github.com/advancedtw/vitest-browser-solid/pull/6>
