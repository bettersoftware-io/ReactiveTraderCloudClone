# Real Path Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the login modes and the workspace tabs from `/#/credit` to `/credit` while leaving the `RouteHistory` port, the route-sync controllers, the cores and every UI component untouched.

**Architecture:** The route grammar in `@rtc/core-logic` spells a route as a path (`/credit`) instead of a hash (`#/credit`). A new `createPathRouteHistory` in `@rtc/web-boot` replaces `createHashRouteHistory` behind the same port. It reads and writes `location.pathname` and carries the query and fragment over. The tests change their spelling only. One new e2e case proves the server answers a deep path with the app.

**Tech Stack:** TypeScript, Vitest + jsdom (web-boot, core-logic, ui-contract), Playwright (e2e on `vite preview`), pnpm + Turborepo.

**Spec:** [docs/superpowers/specs/2026-10-17-real-path-routes-design.md](../specs/2026-10-17-real-path-routes-design.md)

## Global Constraints

- The route spelling is exactly `/fx`, `/credit`, `/equities`, `/admin`, `/sign-in`, `/create-account`, `/forgot-password`, `/enter-code`.
- Matching is exact. `/`, `/credit/`, `/Credit`, `/nope`, `/devtools`, `//fx` and `#/fx` name no route.
- The adapter writes `formatAppRoute(route) + location.search + location.hash`, with `null` history state. Nothing secret goes in the URL or in `history.state`.
- No redirect from `#/…` URLs (spec D2).
- Code may not change in these places: `packages/core-api/src/routes.ts` (comments only), `accountRouteSync.ts`, `workspaceRouteSync.ts`, any client component or hook (comments only), `vercel.*.json`, `deploy.yml`, either `vite.config.ts`, `popout.html`.
- Repo rules apply:
  - one import statement per module
  - functions are named by their effect (`docs/handler-naming.md`)
  - relative imports in `tests/` spell out `.ts`
  - never run two builds in one checkout at once
- Every task runs Biome and ESLint on the files it touched before committing (`pnpm exec biome ci --error-on-warnings <files>`, `pnpm exec eslint <files>`).

## Review Focus

1. **`?core=` and `?splash` survive a route write.** A tab click on `/?core=effect` must keep `?core=effect`. Pinned by the adapter test in Task 2, "push and replace carry the query and the fragment over".
2. **A path that names no route.** `/`, `/credit/` and `/nowhere-known` must land on the canonical path of what is on screen. Pinned by the grammar vectors in Task 1, and by the e2e case "an unknown path is answered by the app and lands on /fx" in Task 4.
3. **Reload on a deep path.** It needs the server's `index.html` fallback, which hash routes never needed. Pinned by the e2e case "a deep path loads cold and survives a reload" in Task 4, on both clients.
4. **`/devtools/` keeps being served by its own files.** Pinned by the existing `devtools.spec.ts` on `vite preview`. On `vite dev` it is the final eyeball. No new test.
5. **The hybrid mode-change reload now lands on `/sign-in` rather than `/#/sign-in`.** The hybrid smoke runs on both clients in the final verification. No new test.

## Execution note

Task 1 changes the grammar, which turns `web-boot`'s adapter test and the
ui-contract route specs red until Tasks 2 and 3 land. Each task therefore runs
its own package's suite. The whole-tree gates run after Task 3 and again at
the end.

---

### Task 1: The route grammar spells paths

**Files:**
- Modify: `packages/core-logic/src/routes/appRoutes.ts` (the prefix constant, `parseAppRoute`, and the doc comments)
- Modify: `packages/core-logic/src/routes/__tests__/appRoutes.test.ts`
- Modify: `packages/core-logic/src/routes/__tests__/createFakeRouteHistory.ts`
- Modify: `packages/core-logic/src/routes/__tests__/accountRouteSync.test.ts`, `packages/core-logic/src/routes/__tests__/workspaceRouteSync.test.ts` (spelling only)

**Interfaces:**
- Produces: `parseAppRoute(path: string): AppRoute | null` and `formatAppRoute(route: AppRoute): string`, returning `/credit`. The names and signatures are unchanged.
- Produces: the core-logic test fake `createFakeRouteHistory(initialPath = "")` with `traverse(path: string)`. Its writes read `push /credit` and `replace /credit`.

- [ ] **Step 1: Rewrite the grammar test's vectors (failing test).**

In `appRoutes.test.ts`, replace the two `it.each` tables with:

```ts
  it.each([
    ["/fx", workspaceRoute("fx")],
    ["/credit", workspaceRoute("credit")],
    ["/equities", workspaceRoute("equities")],
    ["/admin", workspaceRoute("admin")],
    ["/sign-in", accountRoute("signIn")],
    ["/create-account", accountRoute("register")],
    ["/forgot-password", accountRoute("requestReset")],
    ["/enter-code", accountRoute("enterCode")],
  ])("reads %s and writes it back", (path, route) => {
    expect(parseAppRoute(path)).toEqual(route);
    expect(formatAppRoute(route)).toBe(path);
  });

  it.each([
    "",
    "/",
    "fx",
    "/FX",
    "/fx/",
    "//fx",
    "/fx?x=1",
    "/nope",
    "#/fx",
    "/devtools",
    "/devtools/",
    "/popout.html",
    "/constructor",
    "/__proto__",
  ])("reads %j as no route", (path) => {
    expect(parseAppRoute(path)).toBeNull();
  });
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `pnpm --filter @rtc/core-logic exec vitest run src/routes/__tests__/appRoutes.test.ts`
Expected: FAIL. The `/fx`… rows read `null`, and `#/fx` reads as FX.

- [ ] **Step 3: Change the grammar.**

In `appRoutes.ts`, replace everything from `const HASH_PREFIX = "#/";` to the end of the file, keeping `isSameRoute` exactly as it is, so that the prefix and the two functions read:

```ts
const PATH_PREFIX = "/";
```

```ts
/** The route a `location.pathname` names; null for the root, an unknown or
 * a malformed path. */
export function parseAppRoute(path: string): AppRoute | null {
  if (!path.startsWith(PATH_PREFIX)) {
    return null;
  }

  return ROUTES_BY_SLUG.get(path.slice(PATH_PREFIX.length)) ?? null;
}

export function formatAppRoute(route: AppRoute): string {
  const slug =
    route.area === "workspace"
      ? WORKSPACE_SLUGS[route.tab]
      : ACCOUNT_SLUGS[route.mode];

  return `${PATH_PREFIX}${slug}`;
}
```

- [ ] **Step 4: Run the grammar test and watch it pass.**

Run: `pnpm --filter @rtc/core-logic exec vitest run src/routes/__tests__/appRoutes.test.ts`
Expected: PASS.

- [ ] **Step 5: Respell the core-logic fake and the controller tests.**

`createFakeRouteHistory.ts`: rename `initialHash` → `initialPath`, the local `hash` → `path`, and `traverse(hash)` → `traverse(path)`. In the comments, `push #/x` / `replace #/x` → `push /x` / `replace /x`, and "an edited hash" → "an edited address".

Then respell the slugs in the two controller tests. Imports such as `#/routes/…` are left alone because of the lookahead:

```bash
perl -pi -e 's{#/(fx|credit|equities|admin|sign-in|create-account|forgot-password|enter-code|nowhere-known|nope)(?![\w/.-])}{/$1}g' \
  packages/core-logic/src/routes/__tests__/accountRouteSync.test.ts \
  packages/core-logic/src/routes/__tests__/workspaceRouteSync.test.ts
grep -n -i "hash" packages/core-logic/src/routes/__tests__/*.ts packages/core-logic/src/routes/*.ts
```

Every `hash` the grep still prints refers to the route spelling. Reword each one: a test title or comment saying "hash" means "path" or "address".

- [ ] **Step 6: Run the whole core-logic suite.**

Run: `pnpm --filter @rtc/core-logic test`
Expected: PASS, including the export snapshot, which is unchanged because no export was renamed.

- [ ] **Step 7: Prove the vectors can fail.**

Write `/private/tmp/…/scratchpad/mut-task1.json` (any scratch path) with:

```json
[
  {
    "name": "the grammar spells paths, not hashes",
    "file": "packages/core-logic/src/routes/appRoutes.ts",
    "find": "const PATH_PREFIX = \"/\";",
    "replace": "const PATH_PREFIX = \"#/\";",
    "test": "pnpm --filter @rtc/core-logic exec vitest run src/routes/__tests__/appRoutes.test.ts"
  }
]
```

Run `node scripts/mutation-check.mts <file>`. Expected: KILLED.

- [ ] **Step 8: Lint and commit.**

```bash
pnpm exec biome ci --error-on-warnings packages/core-logic/src/routes
pnpm exec eslint packages/core-logic/src/routes
git add packages/core-logic/src/routes
git commit -m "feat(core-logic): spell routes as paths, /credit instead of #/credit"
```

---

### Task 2: The path adapter replaces the hash adapter

**Files:**
- Create: `packages/web-boot/src/adapters/PathRouteHistory.ts`
- Create: `packages/web-boot/src/adapters/PathRouteHistory.test.ts`
- Delete: `packages/web-boot/src/adapters/HashRouteHistory.ts`, `packages/web-boot/src/adapters/HashRouteHistory.test.ts`
- Modify: `packages/web-boot/src/index.ts:4` (the export)
- Modify: `packages/web-boot/src/startWebClient.ts` (import, the `routes:` line, and the doc comment on `WebClientPage.routes`)
- Modify: `packages/web-boot/src/startWebClient.test.ts:76` (the seed URL) and `:52` (the comment)

**Interfaces:**
- Consumes: `parseAppRoute(path)` and `formatAppRoute(route)` from Task 1.
- Produces: `createPathRouteHistory(win: Window): RouteHistory`, exported from `@rtc/web-boot`.

- [ ] **Step 1: Write the adapter test (failing).**

`git mv packages/web-boot/src/adapters/HashRouteHistory.test.ts packages/web-boot/src/adapters/PathRouteHistory.test.ts`, then replace its content with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPathRouteHistory } from "#/adapters/PathRouteHistory";

describe("createPathRouteHistory (jsdom history)", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/?core=rxjs");
  });

  it("push writes the path as a new entry", () => {
    const routes = createPathRouteHistory(window);
    const before = history.length;

    routes.push({ area: "workspace", tab: "credit" });

    expect(location.pathname).toBe("/credit");
    expect(history.length).toBe(before + 1);
  });

  it("replace rewrites the path without adding an entry", () => {
    const routes = createPathRouteHistory(window);
    const before = history.length;

    routes.replace({ area: "workspace", tab: "credit" });

    expect(location.pathname).toBe("/credit");
    expect(history.length).toBe(before);
  });

  it("push and replace carry the query and the fragment over", () => {
    history.replaceState(null, "", "/?core=rxjs&splash#keep");
    const routes = createPathRouteHistory(window);

    routes.push({ area: "workspace", tab: "credit" });

    expect(location.search).toBe("?core=rxjs&splash");
    expect(location.hash).toBe("#keep");

    routes.replace({ area: "workspace", tab: "fx" });

    expect(location.pathname).toBe("/fx");
    expect(location.search).toBe("?core=rxjs&splash");
    expect(location.hash).toBe("#keep");
  });

  it("push and replace write the path from the root under a <base href> elsewhere", () => {
    const base = document.createElement("base");
    base.href = "/elsewhere/";
    document.head.append(base);

    try {
      const routes = createPathRouteHistory(window);

      routes.push({ area: "workspace", tab: "credit" });

      expect(location.pathname).toBe("/credit");
      expect(location.search).toBe("?core=rxjs");

      routes.replace({ area: "workspace", tab: "fx" });

      expect(location.pathname).toBe("/fx");
    } finally {
      base.remove();
    }
  });

  it("current reads location.pathname, ignoring the fragment", () => {
    const routes = createPathRouteHistory(window);
    expect(routes.current()).toBeNull();

    history.replaceState(null, "", "/#/credit");
    expect(routes.current()).toBeNull();

    history.replaceState(null, "", "/credit");
    expect(routes.current()).toEqual({ area: "workspace", tab: "credit" });
  });

  it("a subscriber hears traversal but not its own push or replace", () => {
    const routes = createPathRouteHistory(window);
    const listener = vi.fn();
    routes.subscribe(listener);

    routes.push({ area: "workspace", tab: "credit" });
    routes.replace({ area: "workspace", tab: "fx" });
    expect(listener).not.toHaveBeenCalled();

    history.replaceState(null, "", "/equities");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      area: "workspace",
      tab: "equities",
    });
  });

  it("unsubscribe stops delivery", () => {
    const routes = createPathRouteHistory(window);
    const listener = vi.fn();
    const unsubscribe = routes.subscribe(listener);

    unsubscribe();
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("push stores nothing in history.state", () => {
    const routes = createPathRouteHistory(window);

    routes.push({ area: "workspace", tab: "credit" });

    expect(history.state).toBeNull();
  });

  it("replace stores nothing in history.state, clearing what the entry held", () => {
    history.replaceState({ held: "before" }, "", "/?core=rxjs");
    const routes = createPathRouteHistory(window);

    routes.replace({ area: "workspace", tab: "credit" });

    expect(history.state).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `pnpm --filter @rtc/web-boot exec vitest run src/adapters/PathRouteHistory.test.ts`
Expected: FAIL, because `#/adapters/PathRouteHistory` does not resolve.

- [ ] **Step 3: Write the adapter.**

`git mv packages/web-boot/src/adapters/HashRouteHistory.ts packages/web-boot/src/adapters/PathRouteHistory.ts`, then replace its content with:

```ts
import type { AppRoute, RouteHistory } from "@rtc/core-api";
import { formatAppRoute, parseAppRoute } from "@rtc/core-logic";

/** The page's history as path routes. A push or replace writes only the
 * path (the query and the fragment carry over) and stores nothing in
 * `history.state`. The path is absolute, so a `<base href>` cannot move it.
 * `popstate` covers Back and Forward; `pushState`/`replaceState` never fire
 * it, so a listener hears traversal only. */
export function createPathRouteHistory(win: Window): RouteHistory {
  return {
    current: () => {
      return parseAppRoute(win.location.pathname);
    },
    push: (route: AppRoute) => {
      win.history.pushState(null, "", formatRouteUrl(win, route));
    },
    replace: (route: AppRoute) => {
      win.history.replaceState(null, "", formatRouteUrl(win, route));
    },
    subscribe: (listener: (route: AppRoute | null) => void) => {
      function announceTraversal(): void {
        listener(parseAppRoute(win.location.pathname));
      }

      win.addEventListener("popstate", announceTraversal);

      return () => {
        win.removeEventListener("popstate", announceTraversal);
      };
    },
  };
}

/** `route` as the path, with the page's query and fragment kept. */
function formatRouteUrl(win: Window, route: AppRoute): string {
  return formatAppRoute(route) + win.location.search + win.location.hash;
}
```

- [ ] **Step 4: Wire it into boot.**

- `packages/web-boot/src/index.ts`: `export { createHashRouteHistory } from "#/adapters/HashRouteHistory";` → `export { createPathRouteHistory } from "#/adapters/PathRouteHistory";`
- `packages/web-boot/src/startWebClient.ts`:
  - The import: `createHashRouteHistory` from `./adapters/HashRouteHistory` → `createPathRouteHistory` from `./adapters/PathRouteHistory`.
  - `routes: createHashRouteHistory(window),` → `routes: createPathRouteHistory(window),`.
  - The doc comment `/** The page's history as hash routes: …` → `/** The page's history as path routes: …`.
- `packages/web-boot/src/startWebClient.test.ts`:
  - `history.replaceState(null, "", "/#/create-account");` → `history.replaceState(null, "", "/create-account");`
  - The comment `// A case that sets a path, query or hash route leaves none behind.` → `// A case that sets a path route or a query leaves neither behind.`
- Grep for stragglers: `grep -rn "HashRouteHistory\|createHashRouteHistory" packages tests docs/architecture docs/authentication.md --include='*.ts' --include='*.tsx' --include='*.md' | grep -v node_modules | grep -v /dist/`. The two docs hits are Task 5's job. Any code hit is this task's.

- [ ] **Step 5: Run the web-boot suite.**

Run: `pnpm --filter @rtc/web-boot test`
Expected: PASS. web-boot keeps no snapshots, so nothing needs re-pinning.

- [ ] **Step 6: Prove the adapter test can fail.**

Mutation spec, run with `node scripts/mutation-check.mts`:
1. `formatRouteUrl` drops `+ win.location.search` → expect KILLED ("carry the query").
2. `formatRouteUrl` drops `+ win.location.hash` → expect KILLED ("carry … the fragment").
3. In `current`, `win.location.pathname` → `win.location.hash` → expect KILLED.
4. In `announceTraversal`, `win.location.pathname` → `win.location.hash` → expect KILLED.

The test command for each is `pnpm --filter @rtc/web-boot exec vitest run src/adapters/PathRouteHistory.test.ts`. A SURVIVED row means a test is missing; add it before committing.

- [ ] **Step 7: Run web-boot's coverage gate, then lint and commit.**

```bash
pnpm --filter @rtc/web-boot test:coverage
pnpm exec biome ci --error-on-warnings packages/web-boot/src
pnpm exec eslint packages/web-boot/src
git add -A packages/web-boot/src
git commit -m "feat(web-boot): route through real paths — createPathRouteHistory replaces the hash adapter"
```

---

### Task 3: ui-contract speaks paths

**Files:**
- Modify: `packages/ui-contract/src/shared/harness/createFakeRouteHistory.ts` and its `.test.ts`
- Modify: `packages/ui-contract/src/shared/harness/RoutedComponent.ts`, `MountedComponent.ts` (lines ~264–270), `world.ts` (the `routes` doc ~692, the `routeHash` seed ~769–771, its use ~806 and ~1252)
- Modify: `packages/ui-contract/src/shared/mount.ts` (~133–135, ~336)
- Modify: `packages/ui-contract/src/specs/shell/auth/AuthGate.routes.contract.spec.ts`, `LoginScreen.routes.contract.spec.ts`, `packages/ui-contract/src/specs/shell/chrome/WorkspaceRoutes.contract.spec.ts`

**Interfaces:**
- Consumes: the path spelling from Task 1.
- Produces:
  - The mount option and world seed `routePath?: string`, which replaces `routeHash`.
  - On the fake: `path(): string` replaces `hash()`, and `traverse(path: string)`.
  - On `RoutedComponent`: `routePath(): string | null` replaces `routeHash()`, and `traverse(path: string)`.

- [ ] **Step 1: Respell the fake and its test.**

`createFakeRouteHistory.ts`:
- `hash(): string` → `path(): string`. Its doc reads "The path the history holds now (what the address bar would show)."
- `initialHash` → `initialPath`, and the local `hash` → `path`.
- `traverse(hash)` doc → "Simulates Back/Forward landing on `path`."
- The writes doc → `push /x` / `replace /x`.

In `createFakeRouteHistory.test.ts`:
- `history.hash()` → `history.path()`.
- The expected writes become `["push /create-account", "replace /fx"]`.
- The seeds become `"/nowhere-known"` and `"/fx"`.
- The titles say "path" where they say "hash".

- [ ] **Step 2: Respell the harness.**

- `RoutedComponent.ts`: `routeHash()` → `routePath()`, with the doc "The path the history holds now, or null when it names no route." The `traverse(hash)` parameter → `path`. The class doc says "seeded with `routePath`". The `routeWrites` doc says `push /x` / `replace /x`.
- `MountedComponent.ts`: the doc and the error message name `routePath`.
- `world.ts`: the seed `routeHash?: string` → `routePath?: string` ("at this path"), the destructure, `createFakeRouteHistory(routePath)`, and the `routes` doc's `traverse(path)`.
- `mount.ts`: the option `routeHash?: string` → `routePath?: string` ("at this path"), and `routeHash: opts.routeHash` → `routePath: opts.routePath`.

- [ ] **Step 3: Respell the three route specs.**

```bash
cd packages/ui-contract/src/specs/shell
perl -pi -e 's{#/(fx|credit|equities|admin|sign-in|create-account|forgot-password|enter-code|nowhere-known|nope)(?![\w/.-])}{/$1}g; s{\brouteHash\b}{routePath}g' \
  auth/AuthGate.routes.contract.spec.ts auth/LoginScreen.routes.contract.spec.ts chrome/WorkspaceRoutes.contract.spec.ts
grep -n -i "hash" auth/AuthGate.routes.contract.spec.ts auth/LoginScreen.routes.contract.spec.ts chrome/WorkspaceRoutes.contract.spec.ts
cd -
```

Reword whatever the grep still prints, in test titles and comments, so "hash" reads "path" or "URL".

- [ ] **Step 4: Check nothing else spells the old way.**

```bash
grep -rnE "routeHash|\.hash\(\)|initialHash" packages --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v /dist/
```

Expected: no output.

- [ ] **Step 5: Run both clients' contract suites and their coverage gates.**

```bash
pnpm --filter @rtc/ui-contract test
pnpm --filter @rtc/client-react test:ui:contract:coverage
pnpm --filter @rtc/client-solid test:ui:contract:coverage
```

Expected: all PASS, with the same test count as before. Only the spelling changed, so no case appears or disappears.

- [ ] **Step 6: Run the whole-tree checks.**

```bash
pnpm typecheck
pnpm test
```

Expected: PASS. This is the first point where every package agrees again.

- [ ] **Step 7: Lint and commit.**

```bash
pnpm exec biome ci --error-on-warnings packages/ui-contract/src
pnpm exec eslint packages/ui-contract/src
git add packages/ui-contract/src
git commit -m "test(ui-contract): the route harness and specs spell paths"
```

---

### Task 4: e2e speaks paths, plus the deep-path witness

**Files:**
- Modify: `tests/browser/page-objects/contracts/Workspace.ts` (~75–76: rename, and add `openAt`), `tests/browser/page-objects/contracts/LoginScreen.ts` (~80–81)
- Modify: `tests/browser/page-objects/playwright/Workspace.ts` (~35, ~206–215), `tests/browser/page-objects/playwright/LoginScreen.ts` (~244–255)
- Modify: `tests/browser/scenarios/common.ts` (add `openWorkspaceAt`), `tests/browser/scenarios/navigation.ts`, `tests/browser/scenarios/login.ts` (~245–251)
- Modify: `tests/browser/playwright/navigation.spec.ts` (the header comment, plus two new tests), `tests/browser/playwright/coreSwitch.spec.ts` (~95–97), `tests/fullstack/browser/accounts.spec.ts` (~116–144), `tests/fullstack/hybrid/hybrid.spec.ts` (~153–155, ~166–167, comments only)

**Interfaces:**
- Produces: `WorkspacePO.openAt(path: string): Promise<void>`, `WorkspacePO.waitUrlPath(expected, timeoutMs)`, `LoginScreenPO.waitUrlPath(expected, timeoutMs)`, `common.openWorkspaceAt(ctx, path)` and `login.expectUrlPath(ctx, expected)`.

- [ ] **Step 1: Write the two new e2e tests (failing until the page object exists).**

In `navigation.spec.ts`, change the header comment's "the active tab is the URL hash" to "the active tab is the URL path". Then add these two tests inside the `describe`, after the existing one:

```ts
  // Spec 2026-10-17-real-path-routes §3.4: a path route asks the server for
  // the page, so a cold load and a reload on one need its index.html fallback.
  test("a deep path loads cold and survives a reload", async ({ ctx }) => {
    await common.openWorkspaceAt(ctx, "/credit");
    await navigation.expectTabRouted(ctx, "credit");
    await navigation.expectCreditWorkspaceVisible(ctx);

    await common.clickTab(ctx, "equities");
    await navigation.expectTabRouted(ctx, "equities");

    await common.reloadPage(ctx);
    await navigation.expectTabRouted(ctx, "equities");
  });

  test("an unknown path is answered by the app and lands on /fx", async ({
    ctx,
  }) => {
    await common.openWorkspaceAt(ctx, "/nowhere-known");
    await navigation.expectTabRouted(ctx, "fx");
    await navigation.expectFxWorkspaceVisible(ctx);
  });
```

- [ ] **Step 2: Add `openAt` and rename the URL waits.**

- `contracts/Workspace.ts`:
  - Under `open(): Promise<void>;`, add:
    ```ts
      /** Open the app at `path` (e.g. `/credit`) and wait until it mounts. */
      openAt(path: string): Promise<void>;
    ```
  - Replace the `waitUrlHash` member and its doc with:
    ```ts
      /** Wait until the page URL's path reads exactly `expected` (e.g. `/fx`). */
      waitUrlPath(expected: string, timeoutMs: number): Promise<void>;
    ```
- `contracts/LoginScreen.ts`: replace the `waitUrlHash` member and its doc the same way, with the example `/sign-in`.
- `playwright/Workspace.ts`:
  - After `open()`, add:
    ```ts
      async openAt(path: string): Promise<void> {
        await this.gotoMounted(path);
      }
    ```
  - Rename `waitUrlHash` → `waitUrlPath`, and `new URL(this.page.url()).hash` → `new URL(this.page.url()).pathname`.
- `playwright/LoginScreen.ts`: rename `waitUrlHash` → `waitUrlPath`, and `.hash` → `.pathname`.
- `scenarios/common.ts`: after `openWorkspace`, add:
  ```ts
  /** Open the app at `path` (e.g. `/credit`) — a cold load of a deep path. */
  export async function openWorkspaceAt(
    ctx: TestContext,
    path: string,
  ): Promise<void> {
    await ctx.po.workspace.openAt(path);
  }
  ```
- `scenarios/navigation.ts`:
  - The doc becomes "Assert `tab` is the active tab and the URL path names it."
  - `waitUrlHash(\`#/${tab}\`, …)` → `waitUrlPath(\`/${tab}\`, …)`.
- `scenarios/login.ts`: rename `expectUrlHash` → `expectUrlPath`, and `waitUrlHash` → `waitUrlPath`. The doc becomes "Assert the URL path reads `expected` within 5s."

- [ ] **Step 3: Respell the specs and comments.**

- `tests/fullstack/browser/accounts.spec.ts`:
  - `login.expectUrlHash(ctx, "#/x")` → `login.expectUrlPath(ctx, "/x")` (six calls).
  - The comment "the hash names the mode" → "the path names the mode".
- `tests/browser/playwright/coreSwitch.spec.ts`:
  - The comment "the tab and the URL hash both survive it" → "the tab and the URL path both survive it".
  - The title becomes `"a swap on /credit keeps the Credit tab and the URL path"`.
- `tests/fullstack/hybrid/hybrid.spec.ts`:
  - "The app's hash routes (`#/sign-in`, `#/fx`, ...) change the URL within the same document, which fires `framenavigated` but never `load`" → "The app's path routes (`/sign-in`, `/fx`, ...) change the URL through `history.pushState` within the same document, which fires `framenavigated` but never `load`".
  - "a same-document hash-route change" → "a same-document route change".
- Then run this check:
  ```bash
  grep -rnP "waitUrlHash|expectUrlHash|#/(fx|credit|equities|admin|sign-in|create-account|forgot-password|enter-code)(?![\w/.-])|hash route|URL hash" -P tests --include='*.ts' | grep -v node_modules
  ```
  Expected: no output.

- [ ] **Step 4: Run the e2e harness checks and the two Playwright suites.**

```bash
pnpm --filter @rtc/tests typecheck
pnpm --filter @rtc/tests test:report
pnpm --filter @rtc/tests test:browser:playwright navigation.spec.ts coreSwitch.spec.ts devtools.spec.ts layout.spec.ts login.spec.ts
pnpm --filter @rtc/tests test:browser:playwright:solid navigation.spec.ts coreSwitch.spec.ts devtools.spec.ts layout.spec.ts login.spec.ts
```

`with-server.ts` passes the spec names through to `playwright test`. Read the full Playwright summary, never a piped tail of it. Expected: all pass, including both new cases on both clients. `layout.spec.ts` carries the popout cases, which now open from a path URL.

- [ ] **Step 5: Lint and commit.**

```bash
pnpm exec biome ci --error-on-warnings tests
pnpm exec eslint tests/browser tests/fullstack
git add tests
git commit -m "test(e2e): routes are paths; a deep path loads cold and survives a reload"
```

---

### Task 5: Comments, docs and STATUS

**Files:**
- Modify (comments only): `packages/core-api/src/routes.ts:18,24`, `packages/client-react/src/ui/shell/routes/useAccountRoutes.ts:15,21`, `packages/client-react/src/ui/shell/routes/useWorkspaceRoutes.ts:10`, `packages/client-solid/src/ui/shell/routes/useAccountRoutes.ts:15` (and its line-21 twin if present), `packages/client-solid/src/ui/shell/routes/useWorkspaceRoutes.ts:7`
- Modify: `docs/authentication.md` (the §7.9 file table row, the routes passage and table, the paragraph after them)
- Modify: `docs/architecture/17-web-client-up-close.md:512`
- Modify: `docs/STATUS.md` (delete the ⚪ "Real paths instead of hash routes" entry; the date line already reads 2026-10-17, so confirm it and leave it)

- [ ] **Step 1: Reword the code comments.**

- `core-api/src/routes.ts`:
  - "What a hash route names" → "What a route names".
  - "(Back, Forward, an edited hash)" → "(Back and Forward)".
- Both clients' `useAccountRoutes.ts` / `useWorkspaceRoutes.ts`:
  - "the page's hash route" → "the page's route".
  - "the current hash" → "the current route".

Afterwards, `git diff --stat` for these five files must show comment-only hunks. Check with `git diff -U0 <file>`, where every changed line is inside a `/** … */` block.

- [ ] **Step 2: Rewrite `docs/authentication.md` §7.9's routes passage.**

- **The file table row** becomes `| Routes: path adapter; the client hooks | \`packages/web-boot/src/adapters/PathRouteHistory.ts\`, \`src/ui/shell/routes/\` in each client |`.
- **The opening paragraph** becomes:

> **Routes (browser Back and Forward).** Both web clients mirror the login mode
> and the workspace tab in the URL path, so the browser's Back and Forward move
> between them instead of leaving the app. The path is the only part of the URL a
> route touches: `?core=`, `?splash` and any fragment are carried over
> untouched. A path that names no route (`/`, a trailing slash, an unknown
> name) is rewritten to the route of what is on screen. A path route needs the
> server to answer an unknown path with `index.html`. Both Vercel projects
> rewrite every path except `/api/` to it, serving real files such as
> `/devtools/` and `/popout.html` first. `vite dev` and `vite preview` do the
> same by default.

- **The table** gets the header `| Route | Path | Area |`, and each cell becomes `/fx`, `/credit`, `/equities`, `/admin`, `/sign-in`, `/create-account`, `/forgot-password` or `/enter-code`.
- **The paragraphs after the table:**
  - Every `#/x` becomes `/x`.
  - `createHashRouteHistory` becomes `createPathRouteHistory`.
  - `packages/web-boot/src/adapters/HashRouteHistory.ts` becomes `packages/web-boot/src/adapters/PathRouteHistory.ts`.

- [ ] **Step 3: Doc 17 and STATUS.**

- `docs/architecture/17-web-client-up-close.md:512`: "(the page's hash-route history, `createHashRouteHistory` in `@rtc/web-boot`)" → "(the page's path-route history, `createPathRouteHistory` in `@rtc/web-boot`)", and "in step with the hash" → "in step with the URL path".
- `docs/STATUS.md`: delete the whole ⚪ bullet that starts `- **Real paths instead of hash routes (optional, user request 2026-10-16)**`.

- [ ] **Step 4: Verify and commit.**

```bash
grep -rnE "HashRouteHistory|hash route|hash-route|#/(fx|credit|equities|admin|sign-in|create-account|forgot-password|enter-code)\b" docs/authentication.md docs/architecture docs/STATUS.md packages/*/src --include='*.md' --include='*.ts' --include='*.tsx'
pnpm check:doc-links
pnpm exec biome ci --error-on-warnings packages/core-api/src packages/client-react/src/ui/shell/routes packages/client-solid/src/ui/shell/routes
git add docs/authentication.md docs/architecture/17-web-client-up-close.md docs/STATUS.md packages/core-api/src/routes.ts packages/client-react/src/ui/shell/routes packages/client-solid/src/ui/shell/routes
git commit -m "docs: routes are real paths — authentication §7.9, doc 17, STATUS"
```

Expected for the grep: no output, except the prototype's `#/` import aliases, which the `--include` and path filters keep out.

---

### Final verification (after Task 5)

- [ ] `/rtc:gauntlet full`: every gate green on the final tree, including both ui-contract coverage gates and web-boot's.
- [ ] `pnpm test:e2e`: every suite, including `test:fullstack:browser`, `test:fullstack:browser:solid`, `test:fullstack:hybrid` and `test:fullstack:hybrid:solid`.
- [ ] Browser eyeball on both clients, on `vite dev` against a local server (spec §6):
  - tab Back/Forward
  - login-mode Back/Forward
  - a cold `/create-account`
  - a reload on `/credit`
  - `/devtools/`
  - a core swap on `/credit`, which keeps `?core=` while it is in the URL
- [ ] The PR description's "untouched" list: show it with `git diff --stat origin/main...HEAD -- packages/core-logic/src/routes/accountRouteSync.ts packages/core-logic/src/routes/workspaceRouteSync.ts vercel.react.json vercel.solid.json packages/client-react/vite.config.ts packages/client-solid/vite.config.ts packages/*/src/ui/**/*.tsx`, which should print nothing. Separately, list the comment-only files.
