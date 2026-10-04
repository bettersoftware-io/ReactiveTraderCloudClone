# vitest 5 — upgraded

**Status (2026-10-04): LANDED.** The repo runs vitest **5.0.3** (from 4.1.x).
The upgrade fixes three silent v5 behaviour changes and works around one
upstream mocking regression (see
[The mock regression](#the-mock-regression--concurrent-re-imports-after-viresetmodules)).

History: spiked on 5.0.2 on 2026-09-27 and parked on a cost/benefit call;
the one open failure was reduced to a minimal reproduction and fixed on
2026-10-03; landed on 2026-10-04. What is still open is in
[What is left](#what-is-left) and in [STATUS.md](STATUS.md)
("vitest 5 follow-ups").

## TL;DR

| | |
|---|---|
| Recorded gate (until 2026-09-27) | `vitest-browser-solid` peers on vitest `^4` only |
| Was that the real gate? | **No.** The adapter runs on v5 unchanged, and a pnpm `peerDependencyRules` override is enough |
| What actually broke | 3 behaviour changes, **none of which `pnpm test` noticed**, plus 1 upstream mocking regression |
| The mocking regression | After a setup-file preload and `vi.resetModules()`, **concurrent** re-imports give only the first importer the mock. One line in each of two `client-solid` tests avoids it. Still unreported upstream: see [vitest-5-upstream-bug-report.md](vitest-5-upstream-bug-report.md) |
| Why it was parked for a week | Small gain (test strictness, browser-mode DX we barely use) against a young major with several silent traps; v4 still receives security backports |
| What is left | Report the regression upstream, remove the workaround once fixed, drop the peer override once `vitest-browser-solid` releases |

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

## Was it worth upgrading?

On 2026-09-27 the answer was **not yet**, and the spike was parked. The
reasons, kept here because they explain the week's delay:

For:
- Stricter tests by default, especially failing on un-awaited assertions.
- Staying current keeps the eventual jump small.
- Most of the work was already done on the spike branch.

Against, at the time:
- **Three silent behaviour changes** hit this repo (below). Only a full local
  gauntlet **plus** the dispatch-only visual-reach tier surfaced them;
  per-PR CI would have missed one of them entirely.
- **One open mocking regression** with no upstream issue.
- **An abandoned adapter:** `vitest-browser-solid` has had no commit since
  2025-10-31, so we depend on it through a peer-range override.
- **A 3-week-old major.**

What changed by 2026-10-04: the mocking regression was understood and worked
around with one line per test, v5 had three patch releases, and every trap
that hits this repo was known and fixed. The adapter is still abandoned and
still needs the override.

## What the upgrade changed

Each item measured, not assumed. Developed on the branch
`worktree-spike-vitest-5`, then re-applied onto `main` for the landing PR.

| change | where |
|---|---|
| `vitest`, `@vitest/ui`, `@vitest/coverage-v8`, `@vitest/coverage-istanbul`, `@vitest/browser`, `@vitest/browser-playwright` → **5.0.3** | every workspace manifest |
| `vitest-browser-react` 2.2 → **2.3.0** (peers `^4 \|\| ^5`) | `client-react` |
| `vitest-browser-solid` stays **1.0.1**, with `peerDependencyRules.allowedVersions: { "vitest-browser-solid>vitest": "^5.0.0" }` | `pnpm-workspace.yaml` |
| `waitForText` → `getByText(text, { exact: false })` (trap 1) | both clients' `tests/ui/visual/vitest-browser/visual.spec.tsx` |
| html reporter `outputFile.html` → `["html", { outputDir }]` (trap 2) | 13 `vitest*.config.ts`, both `vitest.app.coverage.config.ts`, and three the spike missed: both clients' `vitest-browser.config.ts` and `tests/presenter/vitest-fake-timers/vitest.config.ts` |
| `await import("../app{Head,Panel}Registry")` on its own, before the `Promise.all` re-import wave (the mock regression) | `client-solid`'s `appHeadRegistry.test.ts` and `appPanelRegistry.test.ts` |

**Why `vitest-browser-solid` is safe on v5.** Its entire runtime is about 60
lines. It uses exactly two `vitest/browser` APIs, `utils.getElementLocatorSelectors`
and `utils.debug`, and both are still exported unchanged by `@vitest/browser@5`.
Upstream PR [advancedtw/vitest-browser-solid#6](https://github.com/advancedtw/vitest-browser-solid/pull/6)
(open since 2026-09-06) widens the peer to `^4.0.0 || ^5.0.0`. Once a release
carries it, delete the override.

### Gate results on 5.0.3

Run locally on 2026-10-04 on the landing branch, off current `main`.

| gate | result |
|---|---|
| fast gauntlet (21 gates) | ✅ |
| `pnpm typecheck`, `pnpm test`, `pnpm build` | ✅ (they were also green on the **first** try of the spike, before any fix. That is the point: see the traps) |
| `lint:eslint:types`, `check:lint-warnings-drift`, `check:devtools-dist`, `check:core-bundle` | ✅ |
| contract coverage — react | ✅ 1272 / 1272, 97.95% statements |
| contract coverage — **solid** | ✅ 1237 / 1237, 98.63% statements / 93.63% branches (33 failed before the registry-test fix, on 5.0.2 and 5.0.3 alike) |
| coverage — devtools core/app, async core, effect core | ✅ |
| React Native merged line coverage | ✅ 96.93% |
| visual-reach vitest-browser tier, react + solid | ✅ 1912 / 1912 each (80 failed in each before trap 1's fix) |
| presenter fake-timers suite | ✅ 22 / 22 |
| `.vitest/` debris after all of the above | none |
| Expo bundle smoke, e2e | CI only |

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
  in 13 configs, plus three the spike missed (see the note below). Two
  configs needed more:
  - `client-react/vitest.app.coverage.config.ts` builds on its base with
    `mergeConfig`, which **concatenates arrays**. Re-declaring `reporters`
    there would run the base's html reporter as well, so the spike **replaces**
    `config.test.reporters` after the merge.
  - `client-solid/vitest.app.coverage.config.ts` had an `outputFile.html`
    that was **already inert on v4** (its base declares no html reporter), so
    it is simply dropped.
- **Missed by the spike, caught at landing:** both clients'
  `vitest-browser.config.ts` and `tests/presenter/vitest-fake-timers/vitest.config.ts`
  carried the same `outputFile.html`. The spike only grepped for debris after
  `pnpm test`, which runs none of them. Grep **every** `vitest*.config.ts` for
  `outputFile`, not only the ones a given run touched.
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

Still unreported as of 2026-10-04. vitest's `CONTRIBUTING.md` requires issues
to be opened by a real person, so it is not something an agent session should
post. The steps, the reproduction script and the issue text are in
[vitest-5-upstream-bug-report.md](vitest-5-upstream-bug-report.md).

### Options that are no longer needed

Recorded on 2026-09-27, before the trigger was found: import the registry
under a `?fresh` id (relies on internals); make the contract harness load
`App` lazily (harness work for its own PR, still a valid simplification); or
run the two tests under the unit config only (measured: gate 98.59%,
`appPanelRegistry.tsx` drops to 29 / 32 lines).

## What is left

Tracked in [STATUS.md](STATUS.md) ("vitest 5 follow-ups"):

1. **Report the mock regression upstream.** A person has to do it:
   [vitest-5-upstream-bug-report.md](vitest-5-upstream-bug-report.md).
2. **Remove the workaround once upstream fixes it.** Delete the one
   `await import("../app{Head,Panel}Registry")` line from each of the two
   registry tests and re-run the solid contract-coverage gate. The same page
   has the steps.
3. **Drop the `peerDependencyRules` block** in `pnpm-workspace.yaml` once a
   `vitest-browser-solid` release peers on vitest `^5`.

For the next test-runner major, start from the trap 3 lesson: run the full
gauntlet **and** the tiers no PR runs (both vitest-browser coverage tiers, the
presenter suites), and grep for stray report directories afterwards.

## Sources

- vitest 5.0.0 release notes: <https://github.com/vitest-dev/vitest/releases/tag/v5.0.0>
  (issue numbers above refer to `vitest-dev/vitest`).
- vitest security advisories: <https://github.com/vitest-dev/vitest/security/advisories>
- Related upstream mocking issues: <https://github.com/vitest-dev/vitest/issues/10104>,
  <https://github.com/vitest-dev/vitest/issues/11460>
- `vitest-browser-solid` peer widening: <https://github.com/advancedtw/vitest-browser-solid/pull/6>
