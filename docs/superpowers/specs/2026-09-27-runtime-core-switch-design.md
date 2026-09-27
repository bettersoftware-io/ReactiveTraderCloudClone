# Runtime application-core switch (web clients) — design

**Date:** 2026-09-27 · **Status:** approved design, not yet planned
**Supersedes:** ADR-006's "one application core per build" (the build-time-only
`VITE_CORE_IMPL` selection proven by `pnpm check:core-bundle`).

## Intent

**What the user asked for.** An easy way to switch the web clients between the
three application cores (`@rtc/client-core` RxJS, `@rtc/client-core-async`,
`@rtc/client-core-effect`) at load time, instead of only at build time, using
lazy loading so all three are not bundled statically.

**Decided with the user:**

- **Audience: a showcase in the deployed app.** Any visitor to the deployed
  demo can switch cores. Production therefore ships all three cores; RxJS stays
  the default.
- **Swap style: save + reload.** The choice is persisted and the page reloads
  onto the new core. A hot swap without reload (dispose + remount in place) is
  explicitly deferred as a future resilience showcase.
- **Approach A:** the RxJS core stays in the entry bundle; the async and Effect
  cores become lazy chunks chosen at boot. Approach B (all three lazy, no
  privileged core) is explicitly deferred.

**Success looks like:** in the deployed app, `?core=effect` boots the Effect
core; Preferences → "Application core" → async reloads onto async and the
choice survives a plain reload; the default visitor's load is exactly as fast
as today; the entry bundle provably carries neither alternative core.

**Out of scope:** React Native (stays RxJS-only), hot swap, approach B, a
feature-flag service (the OpenFeature/Flagsmith work is docs-only and not a
dependency here — the resolver is written so a flag source could be added as
one more precedence step later).

## Constraints found in the code

1. **The RxJS core's code is in the entry bundle regardless.** The UI imports
   helpers from `@rtc/client-core` (`App.tsx`, `KpiRow`, `CandleChart`, …) and
   `buildBrowserPorts` uses its `WsAdapter` and port factories. Only the
   composition root (`rxjsCore.createApp`, stamped with `RXJS_CORE_BRAND`) is
   separable — which is why approach A costs the default path nothing.
2. **The choice cannot be a core preference.** Preferences are served by a
   core's presenters, and the choice must be known before any core exists. It
   lives in a small pre-boot store in `src/app` (the localStorage grep gates
   cover `src/ui` only).
3. **Today** `packages/client-{react,solid}/src/app/selectCore.ts` picks
   `activeCore` statically from the literal `import.meta.env.VITE_CORE_IMPL`,
   and `AppRoot` calls `activeCore.createApp(buildBrowserPorts())`
   synchronously inside a lazy ref (StrictMode-safe).

## Design

### 1. Core selection (`src/app/coreSelection.ts`, each web client)

Replaces `selectCore.ts`.

- `resolveCoreChoice({ url, stored, buildDefault }): { impl, warnings,
  clearStored }` — pure. Precedence:
  1. `?core=` URL parameter — **this load only** (never written to storage),
     so a link is shareable without changing the visitor's saved choice;
  2. the stored choice (`localStorage["rtc.coreImpl"]`);
  3. the build default `VITE_CORE_IMPL` (keeps `dev:*:async|effect`, e2e and
     `check:core-bundle` working);
  4. `"rxjs"`.
- Invalid values:
  - unknown `?core=` → ignored, console warning, fall through;
  - unknown stored value → cleared, console warning, fall through;
  - unknown build default → **throws** (developer error; today's fail-closed
    behaviour, message unchanged in substance).
- `loadCore(impl): Promise<CoreFactory>` — `rxjs` resolves the statically
  imported `rxjsCore`; `async` / `effect` use `import("@rtc/client-core-async")`
  / `import("@rtc/client-core-effect")`, which the bundler splits into their
  own chunks.
- `saveCoreChoice(impl)` — writes `rtc.coreImpl` (storage access wrapped;
  failure to persist is non-fatal and logged).
- `<html data-core-impl>` publishes the impl that actually loaded (the e2e
  booted-core assertion keeps its meaning).

### 2. Boot

- `main.tsx` resolves the choice, `await loadCore(impl)`, then renders
  `<AppRoot core={core} coreSelection={…}>`. `AppRoot` takes the core as a
  prop instead of importing it; its StrictMode-safe lazy ref is unchanged.
- Before mount the page shows only the static `index.html` background (no boot
  splash yet — the splash is React and needs the ViewModel). The gap is one
  small chunk request on the async/Effect paths and zero on the default path.
- A rejected chunk load renders a plain boot-error message with a
  "Load the default core" action that clears the stored choice and reloads.
  It never silently falls back to RxJS.

### 3. Preferences row and how the UI reaches it

- The UI reads only the ViewModel, and the core choice is not the core's
  concern. So `AppRoot` passes the bindings' `createViewModel` an **app-shell
  value**: `coreSelection: { current: CoreImpl; options: readonly
  CoreOption[]; select(impl): void }`, where `select` = `saveCoreChoice`, then
  reload the page **with any `?core=` parameter removed** (otherwise a page
  opened as `?core=effect` would reload straight back onto Effect, since the
  URL outranks the stored choice). `@rtc/react-bindings` and `@rtc/solid-bindings` expose
  it via `useCoreSelection()`.
- New Preferences row **"Application core"** in both clients: three options
  with a one-line description each (RxJS · async/await + AsyncIterable ·
  Effect-TS), styled as the existing rows. Selecting the current core is a
  no-op; selecting another triggers `select` (save + reload), no confirmation.
- UI-contract fixtures (both clients) supply a fake `coreSelection` whose
  `select` records the call.

### 4. `check:core-bundle`, redefined

For each web client, one production build (not one per core), asserting:

- the **entry chunk** carries `RXJS_CORE_BRAND` and neither alternative core's
  marker;
- exactly one lazy chunk carries the async marker and exactly one the Effect
  marker, and neither carries another core's marker;
- gzip sizes reported per core chunk (report-only).

The dev scripts and e2e still set a build default via `VITE_CORE_IMPL`; that
now selects the default *choice*, not what is bundled.

## Testing

- **Unit:** `resolveCoreChoice` — precedence (each level beats the next),
  URL-only-for-this-load, each invalid case (ignored / cleared / throws),
  `saveCoreChoice` failure non-fatal. `loadCore` resolves the right factory per
  impl.
- **UI contract (shared spec, both clients):** the row renders three options
  with the current one selected; choosing another calls `select(impl)`;
  choosing the current one does not.
- **e2e (Playwright):** `/?core=effect` → `data-core-impl="effect"`; choose
  "async" in Preferences → page reloads to `data-core-impl="async"`; a plain
  reload stays on async; choosing a core on a page opened with `?core=…`
  lands on the chosen core with the parameter gone; `?core=rxjs` overrides for that load only; an unknown
  `?core=` boots the stored/default core.
- **Visual:** goldens for the new Preferences row (react writes, solid
  asserts).
- **`check:core-bundle`:** the redefined assertions, plus a negative proof
  (temporarily importing an alternative core statically must fail it).
- Mutation-check every new test.

## Docs to update

ADR-006 (new decision superseding "one core per build"; Follow-ups gain hot
swap and approach B), §22 (selection + bundle sections), README "Choosing an
application core", CLAUDE.md (current status + `check:core-bundle` line),
STATUS (this workstream; the two deferred follow-ups).

## Future (recorded, not planned)

- **Hot swap without reload** — `app.dispose()` (real in all three cores since
  #834) + remount on the new core; a showcase for the architecture's
  resilience. Needs page-lifetime singletons (devtools hub, transport,
  module state) to tolerate a second composition.
- **Approach B** — all three cores lazy via a `@rtc/client-core` subpath export
  for the RxJS composition root; no privileged core.
