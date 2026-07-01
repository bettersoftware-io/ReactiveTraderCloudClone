# Task 2 Report — RN component-test harness spike

## Chosen harness path: **jest-expo island** (vitest path failed)

The vitest path was tried first, exactly as the brief's Step 3 specifies
(`vitest.rn.config.ts`, node env, `.test.tsx` include, `server.deps.inline`
for `react-native` / `@react-native` / `@testing-library/react-native`). It
could not render an RN component.

### Evidence that forced the fallback (vitest)

```
 ❯ src/harnessProbe.test.tsx (0 test)
 FAIL  src/harnessProbe.test.tsx [ src/harnessProbe.test.tsx ]
SyntaxError: Unexpected token 'typeof'
```

`react-native` ships **Flow-typed** source (e.g. `import typeof ...`).
vitest transforms via esbuild, which strips TypeScript types but cannot parse
Flow syntax. Forcing the modules through the transform with `server.deps.inline`
does not help — esbuild still chokes on the Flow grammar. There is no clean
vitest transform for RN's Flow source without bolting on a babel/flow pipeline,
which is exactly the "hacky transform" the brief says not to force. Fell back to
the scoped jest-expo island per Step 4.

`vitest.rn.config.ts` was deleted. The probe was converted off vitest globals.

## What the jest path required (deviations from the brief, all driven by tooling)

The brief's Step 4 snippet was written against the older sync RNTL API + jest 30
+ `react-test-renderer`. The SDK-55 / React-19 tooling actually installed needed
three corrections, each proven by an error before the fix:

1. **jest 29, not 30.** `jest-expo@55.0.19` depends on jest **29** internals
   (`@jest/globals` `^29`, `babel-jest` `^29`, `jest-environment-jsdom` `^29`).
   Installing `jest@^30` produced
   `TypeError: this._moduleMocker.clearMocksOnScope is not a function`
   (jest-runtime 30 vs jest-mock 29). Pinned `jest`/`@types/jest` to `^29`.

2. **pnpm-aware `transformIgnorePatterns`.** Under pnpm, `react-native` resolves
   to `node_modules/.pnpm/react-native@.../node_modules/react-native/...`. The
   brief's allowlist anchors at the first `node_modules/`, which is followed by
   `.pnpm` (not in the allowlist) → RN was left untransformed:
   `SyntaxError: Cannot use import statement outside a module`
   (`react-native/jest/setup.js`). Added an optional `.pnpm/<pkg>/node_modules/`
   segment to the negative lookahead.

3. **`test-renderer`, not `react-test-renderer`.** RNTL **14.0.1** dropped the
   React-19-deprecated `react-test-renderer` and peer-depends on
   `"test-renderer": "^1.0.0"` (its `render.js` does `require("test-renderer")`).
   With `react-test-renderer` installed instead, `render()` was a no-op returning
   `{}` and `screen.getByText` threw `render function has not been called`.
   Removed `react-test-renderer`, added `test-renderer@^1.2.0`. This is the
   brief's anticipated "do not fight a version that doesn't exist" case.

4. **`render` is async.** RNTL 14 made `render` async (it `await`s a concurrent
   React-19 `act`). The sync probe never populated `screen`. The probe now
   `await`s `render(...)` inside an `async` test callback.

5. **Explicit test globals.** Repo convention is explicit global imports (vitest
   tests do `import { test, expect } from "vitest"`). `@types/jest` ambient
   globals were not auto-included by the RN tsconfig (tsc errored
   `Cannot find name 'test'`), and `@jest/globals` was not hoisted to the
   package. Added `@jest/globals@^29` as a devDep and import `{ expect, test }`
   from it — explicit, type-clean, no tsconfig `types` pollution of app files.

## Resolved dependency versions (all devDependencies)

| package | range | note |
|---|---|---|
| `@testing-library/react-native` | `^14.0.1` | via `expo install` |
| `test-renderer` | `^1.2.0` | RNTL 14's renderer peer (replaces `react-test-renderer`) |
| `jest-expo` | `^55.0.19` | via `expo install`, normalized `~`→`^`, moved to devDeps |
| `jest` | `^29.7.0` | 29 to match jest-expo internals |
| `@types/jest` | `^29.5.14` | 29 |
| `@jest/globals` | `^29.7.0` | explicit test globals |

`react-test-renderer` was installed then removed. All ranges are caret; the
24h supply-chain cooldown was never bypassed (no `minimumReleaseAgeExclude`).

## Files changed

- **Created** `packages/client-react-native/src/harnessProbe.test.tsx` — RNTL probe (async render).
- **Created** `packages/client-react-native/jest.config.js` — preset `jest-expo`, pnpm-aware `transformIgnorePatterns`, `#/` `moduleNameMapper`, `testMatch: **/*.test.tsx`.
- **Created** `packages/client-react-native/jest.setup.ts` — `import "@testing-library/react-native"`.
- **Modified** `packages/client-react-native/package.json` — deps above; `test` → `vitest run --passWithNoTests && jest`.
- **Modified** `knip.json` — added `jest.config.js` + `jest.setup.ts` to the RN workspace `entry` (no `ignoreDependencies` needed — knip sees all jest deps as consumed).
- **Modified** `tsconfig.eslint.json` — added `packages/client-react-native/jest.setup.ts` to the type-aware lint program (root-level file, not covered by `src/**` or `*.config.ts`).
- (regenerated `pnpm-lock.yaml`.)

`vitest.config.ts` (existing) still matches only `src/**/*.test.ts`, so the
`.test.tsx` probe is NOT double-run by vitest — the RN node-logic test
(`currencyPairsStream.test.ts`) still runs under vitest, the `.tsx` probe under
jest. No CI YAML change was needed: `checks` runs `pnpm test` which reaches the
RN tier through turbo → the package `test` script (now both runners). jest-expo
runs in node — no browser/xvfb.

## Gate → exit-code table (all from repo root)

| # | gate | exit |
|---|---|---|
| 1 | `pnpm exec biome ci .` | 0 (1 pre-existing info, non-blocking) |
| 2 | `pnpm lint:eslint` | 0 |
| 3 | `pnpm lint:eslint:types` | 0 |
| 4 | `pnpm lint:actions` | 0 |
| 5 | `pnpm check:versions` | 0 |
| 6 | `pnpm typecheck` | 0 |
| 7 | `pnpm test` | 0 (probe `PASS src/harnessProbe.test.tsx` via RN tier) |
| 8 | `pnpm build` | 0 |
| 9 | `pnpm lint:dead` (knip) | 0 |
| 10 | `pnpm check:deps` | 0 |
| 11 | `pnpm --filter @rtc/tests gates` | 0 |
| 12 | `pnpm --filter @rtc/client-react-native export` | 0 |

## Self-review

- Probe genuinely renders an RN `<Text>` and queries it by text — a real
  RNTL render, not a stub. Later SpotTile RNTL tests inherit this harness
  (`.test.tsx` → jest-expo; `.test.ts` node logic → vitest).
- Deps are devDependencies (test-only), alphabetical, caret, single-range clean.
- `pnpm-workspace.yaml` was auto-touched by pnpm (an `unrs-resolver` `allowBuilds`
  placeholder from a non-fatal `ERR_PNPM_IGNORED_BUILDS` warning) and reverted —
  that build was already ignored pre-task; install exits 0 either way.
- No gate weakened, no `continue-on-error`, no `biome-ignore`, cooldown intact.
