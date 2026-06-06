# Visual-diff tests

Screenshots of the UI layer rendered against injected fake data. No server,
no presenters, no live streams — the dependency graph stops at HooksProvider.

## Layout

- `shared/` — framework-neutral core. `appData.ts` (data contract),
  `fixtures.ts` (named data), `scenarios.ts` (name -> component+fixture).
  **No React imports.** This folder is what a SolidJS UI reuses verbatim.
- `react/` — the React harness: `buildFakeHooks.ts` (AppData -> AppHooks),
  `registry.tsx` (componentKey -> React element), `VisualScenario.tsx`.
- `*.spec.tsx` — one `toHaveScreenshot` per scenario.
- `__screenshots__/` — committed golden PNGs (the cross-framework contract).

## Running

- `pnpm test:visual` — compare against goldens.
- `pnpm test:visual:update` — (re)generate goldens. Inspect the PNGs before committing.
- `pnpm test:visual:ui` — interactive runner.

The harness (`visual/`) is type-checked by `pnpm typecheck` via
`tsconfig.visual.json` — the main `tsconfig.json` restricts `rootDir` to `src`,
and the Playwright CT bundle strips types without checking, so without that
extra project a drift between `buildFakeHooks` and the `AppHooks` interface
would go unnoticed.

## Porting to another UI framework (e.g. SolidJS)

The goal: run the **same** scenarios and match the **same** goldens.

1. Reuse `visual/shared/` unchanged (or extract it to a shared package and
   depend on it from both UI packages).
2. Implement the three framework-specific files for the new framework:
   - a `buildFakeProvider(data)` that feeds `AppData` into that framework's
     equivalent of `HooksProvider` (Solid: a context/store of signals),
   - a `registry` mapping the same `componentKey`s to the new components,
   - a `VisualScenario` wrapper (theme + provider + backdrop).
3. Point that package's Playwright CT config `snapshotPathTemplate` at the
   shared `__screenshots__/` directory so both frameworks compare to one golden.
4. Run `test:visual`. Pixel diffs are the parity report between implementations.

Keep the contract in the data (`shared/`) and the goldens — not in the
React-shaped `AppHooks` interface, which each framework adapts to its own model.
