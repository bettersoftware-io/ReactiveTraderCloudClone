# Real path routes instead of `#/` routes — design

**Date:** 2026-10-17 · **Status:** approved in conversation, awaiting spec review
**Builds on:** [browser history and live validation](2026-10-16-browser-history-and-live-validation-design.md) (PR #1012)

## 1. Purpose

The login modes and the workspace tabs route through the URL hash today:
`/#/credit`, `/#/create-account`. This change moves them to real paths:
`/credit`, `/create-account`.

Nobody needs it. It is a demonstration (user, 2026-10-17): hash-versus-path
routing was a costly problem elsewhere, and here it should be a change at the
edge. The `RouteHistory` port in `@rtc/core-api` speaks `AppRoute` objects, not
URLs, so moving the routes from the hash to the path should change one adapter
in `@rtc/web-boot`, one constant in `@rtc/core-logic`'s route grammar, and the
spelling the tests use. **The list of things this change does not touch is the
result.** The PR description states it.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Replace the hash adapter; don't keep both behind a switch. | A second adapter that nothing deploys is dead weight, and e2e would either run twice or leave one adapter untested. The diff already shows the swap. |
| D2 | No redirect from `#/…` URLs. | The hash routes have been live since 2026-10-17 and nobody has used or shared them (user, 2026-10-17). |
| D3 | The grammar spells a route as a path, `/credit`. The adapter decides where in the URL that path goes. | `#/` → `/` is the only change to the grammar. A hash adapter could still put the same spelling after `#`. |
| D4 | Exact match only. | `/`, `/credit/`, `/Credit`, `/nope` and `/devtools` name no route. The controllers already rewrite a URL that names no route to the canonical path, exactly as they did for an empty or unknown hash. |
| D5 | The site is served from the domain root. | It already is, on both Vercel projects and every local server. Hosting under a sub-path is out of scope. That is the one thing hash routes handle that paths don't. |

## 3. What changes

### 3.1 Route grammar — `packages/core-logic/src/routes/appRoutes.ts`

`HASH_PREFIX = "#/"` becomes a path prefix `"/"`. `parseAppRoute(path)` reads a
`location.pathname` and returns the route it names, or null.
`formatAppRoute(route)` returns `/credit`. The slug tables, `isSameRoute`, and
both functions' names and signatures stay the same. Only the parameter name,
the doc comments and the test vectors in `__tests__/appRoutes.test.ts` change.

### 3.2 Adapter — `packages/web-boot/src/adapters/PathRouteHistory.ts`

This replaces `HashRouteHistory.ts`, and its test replaces
`HashRouteHistory.test.ts`. The new export is `createPathRouteHistory(win: Window): RouteHistory`.

- `current()` returns `parseAppRoute(win.location.pathname)`.
- `push(route)` / `replace(route)` call `pushState` / `replaceState` with
  `null` state and the URL `formatAppRoute(route) + location.search +
  location.hash`. The path is the only part that changes: `?core=` and any
  other query or fragment carry over. Nothing goes in `history.state`.
- `subscribe(listener)` listens to `popstate` and passes
  `parseAppRoute(location.pathname)`. A `popstate` fired by a change to the
  hash alone reaches the listener with an unchanged route. The controllers
  ignore a route they already show ([Ruling 1](../plans/2026-10-16-browser-history-and-live-validation-rulings.md)).
- The URL written is absolute (`/credit…`), so a `<base href>` cannot redirect
  it. That is the same guarantee the hash adapter gave by spelling out the path
  and query.

`startWebClient.ts` passes `createPathRouteHistory(window)`, and its `routes`
doc comment says "path routes". The export in `packages/web-boot/src/index.ts`
is renamed to match. The case in `startWebClient.test.ts` that seeds
`/#/create-account` seeds `/create-account` instead.

### 3.3 Test vocabulary — same behaviour, new spelling

These are mechanical renames. No assertion changes what it proves.

- **Both fake route histories** are
  `packages/core-logic/src/routes/__tests__/createFakeRouteHistory.ts` and
  `packages/ui-contract/src/shared/harness/createFakeRouteHistory.ts`.
  `hash()` becomes `path()`, `traverse(hash)` becomes `traverse(path)`, the
  writes read `push /credit` / `replace /credit`, and the seed parameter is
  named `initialPath`.
- **The ui-contract harness** is `RoutedComponent.ts`, `MountedComponent.ts`,
  `world.ts` and `mount.ts`. In it, `routeHash` becomes `routePath` (both the
  mount option and the accessor). The three route specs
  (`AuthGate.routes`, `LoginScreen.routes`, `WorkspaceRoutes`) and
  `createFakeRouteHistory.test.ts` change spelling from `"#/x"` to `"/x"`.
- **The core-logic controller tests** are `accountRouteSync.test.ts` and
  `workspaceRouteSync.test.ts`. They switch to the path spelling the same way.
- **The e2e page objects** are `LoginScreen` and `Workspace`, both the contract
  interfaces in `tests/browser/page-objects/contracts/` and their Playwright
  implementations. `waitUrlHash(expected, timeoutMs)` becomes
  `waitUrlPath(expected, timeoutMs)`, which reads
  `new URL(page.url()).pathname`. `expectUrlHash` in
  `tests/browser/scenarios/login.ts` becomes `expectUrlPath`.
  `scenarios/navigation.ts`, `navigation.spec.ts`, `coreSwitch.spec.ts`
  ("a swap on /credit keeps the Credit tab and the URL path"),
  `fullstack/browser/accounts.spec.ts` and the comments in
  `fullstack/hybrid/hybrid.spec.ts` follow.

### 3.4 One new e2e witness — a deep path served cold

Hash routes never asked the server for anything. A path route does: loading
`/credit` from cold, or reloading on it, needs the server to answer an unknown
path with `index.html`. `vite preview` (the Playwright suites' production
build) and `vite dev` both do this by default, and so do both Vercel
configs (`"/((?!api/).*)" → /index.html`, with real files served first). A new
case in `tests/browser/playwright/navigation.spec.ts`, which runs on both
clients, covers it:

1. `page.goto("/credit")` on a fresh page, then sign in. The Credit tab is
   active and the path stays `/credit`.
2. `page.reload()` on `/equities`. The page comes back on Equities.
3. `page.goto("/devtools/")` still serves the devtools inspector, not the app.
   This proves the real file wins over the fallback. Assert on something
   only the inspector's page has, such as its `<title>`.

Vercel's rewrite cannot run in CI. After the deploy, opening `/credit`
directly on both Vercel sites is the user's check (§6).

### 3.5 Comments and docs

- Comments that say "hash route" in code no logic change touches:
  `packages/core-api/src/routes.ts` (two), both clients'
  `useAccountRoutes.ts` and `useWorkspaceRoutes.ts`, and
  `packages/core-logic/src/routes/appRoutes.ts`. These are comment-only
  edits, and the PR description lists them separately from code changes.
- `docs/authentication.md` §7.9's routes passage and its routes table become
  paths. Its sentence that the hash is the only part of the URL read or
  written becomes the same sentence about the path. "Nothing secret reaches
  the URL or `history.state`" stays.
- `docs/architecture/17-web-client-up-close.md`: the routes paragraph names
  `createPathRouteHistory`.
- `docs/STATUS.md`: the ⚪ "Real paths instead of hash routes" entry is
  deleted, and the date is bumped.
- The 2026-10-16 spec, plan and rulings stay as written. They are history.

## 4. What does not change

These are named here so the PR can show them untouched:

- `packages/core-api/src/routes.ts`: the `RouteHistory` port and the
  `AppRoute` type. The comments are reworded (§3.5); the types are not.
- `accountRouteSync.ts` and `workspaceRouteSync.ts`: the controllers.
- The three application cores and every machine.
- Every React and Solid component and hook. Only the route hooks' comments
  are reworded.
- `vercel.react.json`, `vercel.solid.json`, `deploy.yml`, both `vite.config.ts`.
- `popout.html`. dockview opens the absolute `/popout.html`, which boots
  nothing and has no routes.
- The visual goldens. The tier screenshots the page, not the address bar.

## 5. Risks and how each is checked

| Risk | Check |
|---|---|
| The dev server's `/devtools` middleware loses to the `index.html` fallback. | Open `/devtools/` on `vite dev` during the browser eyeball. On `vite preview`, the §3.4 case covers it. |
| A dockview popout opened from `/credit` resolves its URL wrongly. | `popoutUrl` is absolute. The existing popout e2e cases now run from a path URL and stay green. |
| The hybrid smoke's "no reload" proof breaks. | `pushState` stays within the same document, so the `load` counter still proves it. The smoke runs on both clients. |
| A stale `#/credit` in someone's address bar. | D2: no redirect. It loads `/` and lands on the default route, as any unknown URL does. |
| `?core=` stops surviving a route write. | The adapter test asserts the query and fragment carry over on push and replace. |

## 6. Done when

- Every gate in the full gauntlet is green, and the e2e suite (both clients,
  the browser and hybrid fullstack smokes on both clients) passes.
- A browser eyeball on both clients on `vite dev` against a local server:
  - tab Back/Forward
  - login-mode Back/Forward
  - a cold `/create-account`
  - a reload on `/credit`
  - `/devtools/`
  - a core swap on `/credit`
- After the user runs `deploy.yml`, opening `/credit` and `/create-account`
  directly on both Vercel sites shows the app. This one is the user's.
