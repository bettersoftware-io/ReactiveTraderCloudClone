# Solid devtools parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@rtc/client-solid` inspectable by the RTC devtools — via the MV3 extension (deployed build) and its own same-origin `/devtools/` panel — by mirroring `client-react`'s devtools wiring.

**Architecture:** The three `@rtc/devtools-core` decorators operate on the framework-free `client-core` presenters/machines/ws-adapter, so Solid parity is a near-verbatim mirror of `client-react`: a module-level `DevtoolsHub` (appId `rtc-web-solid`) fed by `instrumentPresenters`/`instrumentMachineFactories`/`instrumentWsAdapter`, plus React's dependency-free `devtoolsPanel()` Vite plugin serving `/devtools/`. The hub is dormant-until-attached, so steady-state cost is ~zero.

**Tech Stack:** SolidJS + Vite, `@rtc/devtools-core`, `@rtc/devtools-app`, `@rtc/solid-bindings`, `@rtc/client-core`, Playwright e2e, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-solid-devtools-parity-design.md` — every task's requirements implicitly include it.
- All work in the isolated worktree `.claude/worktrees/solid-devtools`; use worktree-relative/worktree-absolute paths for all Write/Edit — never the primary checkout path.
- App id (verbatim): `rtc-web-solid` (React keeps `rtc-web`). BroadcastChannel name (verbatim, shared): `rtc-devtools`.
- **Never source-import `@rtc/devtools-app` from `client-solid/src`** — it pulls React, which the `solid-stays-react-free` dependency-cruiser rule forbids. It is reached only via `require.resolve("@rtc/devtools-app/package.json")` inside `vite.config.ts` (a build-order/asset edge), exactly as `client-react` does.
- No tsconfig `references` entry is needed for `@rtc/devtools-core`/`-app` (React adds none; resolution is via workspace `node_modules`). Do not add one unless typecheck fails.
- Mirror `client-react` verbatim except where noted (appId, and Solid's AppRoot needs no StrictMode lazy-ref).
- Gauntlet before merge (per repo policy): typecheck, `biome ci .`, ESLint (both configs) + stylelint, `knip`, `dependency-cruiser`, UI-contract coverage (both frameworks), `pnpm build`.

---

### Task 1: App-side instrumentation (extension parity)

**Files:**
- Modify: `packages/client-solid/package.json` (add `@rtc/devtools-core` dependency)
- Create: `packages/client-solid/src/app/devtools/devtoolsHub.ts`
- Create: `packages/client-solid/src/app/devtools/presenterManifest.ts`
- Modify: `packages/client-solid/src/AppRoot.tsx`
- Modify: `packages/client-solid/src/app/buildBrowserPorts.ts`

**Interfaces:**
- Consumes: `@rtc/devtools-core` — `DevtoolsHub`, `BroadcastChannelDuplex`, `instrumentPresenters`, `instrumentMachineFactories`, `instrumentWsAdapter`, `PresenterManifest`; `@rtc/client-core` — `createApp`, `createMachineFactories`; `@rtc/solid-bindings` — `createViewModel`.
- Produces: module singleton `devtoolsHub` (imported by Task 2's test and Task 3 is independent); `PRESENTER_MANIFEST`.

- [ ] **Step 1: Add the runtime dependency**

Edit `packages/client-solid/package.json` `dependencies` (alphabetical, before `@rtc/domain`):

```json
    "@rtc/client-core": "workspace:*",
    "@rtc/devtools-core": "workspace:*",
    "@rtc/domain": "workspace:*",
```

Then install:

Run: `pnpm install`
Expected: completes; `@rtc/devtools-core` linked into `packages/client-solid/node_modules/@rtc`.

- [ ] **Step 2: Create `devtoolsHub.ts`** (verbatim from `client-react` except `appId`)

`packages/client-solid/src/app/devtools/devtoolsHub.ts`:

```ts
import { BroadcastChannelDuplex, DevtoolsHub } from "@rtc/devtools-core";

/** App-side devtools hub for the Solid client. Module-level singleton whose
 * lifetime is the page. Dormant until an inspector handshakes on the
 * rtc-devtools channel; costs nothing per-emission until then. BroadcastChannel
 * is same-origin — the inspector must be served from this origin (/devtools
 * route or the MV3 extension's content-script bridge). Guarded so
 * jsdom/non-browser environments never throw. Mirrors client-react's
 * devtoolsHub.ts verbatim except appId (rtc-web-solid vs rtc-web) so the
 * inspector labels the two apps distinctly. */
export const devtoolsHub = new DevtoolsHub({
  appId: "rtc-web-solid",
  dev: import.meta.env?.DEV === true,
});

if (typeof BroadcastChannel !== "undefined") {
  devtoolsHub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));

  // Graceful close/reload/navigate ⇒ pagehide ⇒ dispose() ⇒ hub sends `bye`,
  // flipping the inspector panel to "disconnected". dispose() is idempotent and
  // exception-safe (goDormant early-returns when not live).
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      devtoolsHub.dispose();
    });
  }
}
```

- [ ] **Step 3: Create `presenterManifest.ts`** (duplicate `client-react`'s verbatim)

Copy `packages/client-react/src/app/devtools/presenterManifest.ts` to `packages/client-solid/src/app/devtools/presenterManifest.ts` unchanged (it is call-site knowledge over the shared `client-core` presenters, identical across clients).

Run: `cp packages/client-react/src/app/devtools/presenterManifest.ts packages/client-solid/src/app/devtools/presenterManifest.ts`
Expected: file created; `PRESENTER_MANIFEST` exports the same 35 presenter entries.

- [ ] **Step 4: Wire `AppRoot.tsx`**

In `packages/client-solid/src/AppRoot.tsx`, add imports and wrap presenters/machines. Replace the current body of `AppRoot`:

```tsx
import type { JSX, ParentProps } from "solid-js";

import { createApp, createMachineFactories } from "@rtc/client-core";
import {
  instrumentMachineFactories,
  instrumentPresenters,
} from "@rtc/devtools-core";
import { createViewModel, ViewModelProvider } from "@rtc/solid-bindings";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";
import { devtoolsHub } from "#/app/devtools/devtoolsHub";
import { PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";
import { AuthGate } from "#/ui/shell/auth/AuthGate";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { PowerSaverRoot } from "#/ui/shell/power/PowerSaverRoot";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";
```

And inside the component body, replace the `createApp`/`createViewModel` block:

```tsx
export function AppRoot(props: ParentProps): JSX.Element {
  const { presenters, commands } = createApp(buildBrowserPorts());
  const instrumented = instrumentPresenters(
    presenters,
    PRESENTER_MANIFEST,
    devtoolsHub,
  );
  const viewModel = createViewModel(
    instrumented,
    instrumentMachineFactories(
      createMachineFactories(instrumented),
      devtoolsHub,
    ),
    commands,
  );

  return (
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <PowerSaverRoot />
        <BootGate>
          <AuthGate>{props.children}</AuthGate>
        </BootGate>
      </ThemeProvider>
    </ViewModelProvider>
  );
}
```

(Keep the existing doc comment; only the two wiring lines and imports change.)

- [ ] **Step 5: Wire `buildBrowserPorts.ts`**

In `packages/client-solid/src/app/buildBrowserPorts.ts`, add the import and wrap the `WsAdapter` in the `url` branch.

Add to the `@rtc/client-core` import list (it already imports from there — add `instrumentWsAdapter` from `@rtc/devtools-core` as a new import line):

```ts
import { instrumentWsAdapter } from "@rtc/devtools-core";
```

Change the `url`-branch `ws` construction from:

```ts
    const ws = new WsAdapter(url, () => {
      return sessionStore.read()?.token;
    });
```

to:

```ts
    // Wrap the transport in the devtools wire tap at construction so every
    // send/on/rpc is mirrored to the hub (dormant until an inspector attaches).
    // The simulator branch below has no adapter — its wire panel is simply empty.
    const ws = instrumentWsAdapter(
      new WsAdapter(url, () => {
        return sessionStore.read()?.token;
      }),
      devtoolsHub,
    );
```

Add the hub import near the other `#/app` imports:

```ts
import { devtoolsHub } from "#/app/devtools/devtoolsHub";
```

- [ ] **Step 6: Verify gates**

Run: `pnpm --filter @rtc/client-solid typecheck`
Expected: PASS.

Run: `pnpm lint:dead`
Expected: PASS — `@rtc/devtools-core` counts as used (imported in src). If it flags `@rtc/devtools-core` unused, that's a real wiring bug — fix, don't ignore.

Run: `pnpm check:deps`
Expected: PASS — no rule forbids `client-solid/src → devtools-core` (rxjs-only, no React).

Run: `pnpm --filter @rtc/client-solid lint` and `npx biome ci packages/client-solid/src/AppRoot.tsx packages/client-solid/src/app/buildBrowserPorts.ts packages/client-solid/src/app/devtools`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/client-solid/package.json pnpm-lock.yaml packages/client-solid/src/app/devtools packages/client-solid/src/AppRoot.tsx packages/client-solid/src/app/buildBrowserPorts.ts
git commit -m "feat(client-solid): instrument composition root for devtools (extension parity)"
```

---

### Task 2: Integration test (parity guard)

**Files:**
- Create: `packages/client-solid/src/app/__tests__/devtoolsIntegration.test.ts`

**Interfaces:**
- Consumes: `client-solid`'s own `buildBrowserPorts` + `PRESENTER_MANIFEST` (via `#/` alias), `@rtc/client-core`, `@rtc/devtools-core` (`DevtoolsHub`, `InspectorStore`, `InspectorClient`, `createInMemoryDuplexPair`).

- [ ] **Step 1: Copy React's integration test verbatim**

The test is framework-agnostic — it drives the hub through an in-memory duplex pair and never imports React. Copying it into `client-solid` re-points its `#/app/buildBrowserPorts` and `#/app/devtools/presenterManifest` imports at `client-solid`'s own copies, so it guards *this* client's manifest + ports wiring.

Run: `cp packages/client-react/src/app/__tests__/devtoolsIntegration.test.ts packages/client-solid/src/app/__tests__/devtoolsIntegration.test.ts`
Expected: file created. (It uses a fresh local `new DevtoolsHub({ appId: "rtc-web-test" })`, never the module singleton — leave that as-is.)

- [ ] **Step 2: Run it to verify it passes against Task 1's wiring**

Run: `pnpm --filter @rtc/client-solid test devtoolsIntegration`
Expected: PASS — the state tree reflects `client-solid`'s manifest-registered presenter props and machine states after the handshake.

If it fails on a missing presenter/prop, `client-solid`'s `presenterManifest.ts` has drifted from its `buildBrowserPorts` presenters — reconcile the manifest (do not weaken the test).

- [ ] **Step 3: Commit**

```bash
git add packages/client-solid/src/app/__tests__/devtoolsIntegration.test.ts
git commit -m "test(client-solid): devtools composition-root ↔ inspector integration"
```

---

### Task 3: Serve `/devtools/` same-origin

**Files:**
- Modify: `packages/client-solid/package.json` (add `@rtc/devtools-app` devDependency)
- Modify: `packages/client-solid/vite.config.ts`

**Interfaces:**
- Consumes: `@rtc/devtools-app` (build output only, via `require.resolve`).
- Produces: `/devtools/` served in dev + `dist/devtools` at build → `rtc-clone-solid.vercel.app/devtools/`.

- [ ] **Step 1: Add the devDependency**

Edit `packages/client-solid/package.json` `devDependencies` (alphabetical). Add:

```json
    "@rtc/devtools-app": "workspace:*",
```

Run: `pnpm install`
Expected: completes; the workspace edge gives turbo the topological build order (devtools-app before client-solid).

- [ ] **Step 2: Port React's `devtoolsPanel()` plugin into `vite.config.ts`**

Edit `packages/client-solid/vite.config.ts` to add the plugin (verbatim from `packages/client-react/vite.config.ts` lines 1-83, adjusting only the import block to coexist with the Solid plugins). Result:

```ts
import { cpSync, createReadStream, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";

import devtools from "solid-devtools/vite";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import solid from "vite-plugin-solid";

/** Serve the built `@rtc/devtools-app` inspector at /devtools/ in dev (Vite
 * middleware) and copy it into dist/devtools at build time. Same-origin is
 * load-bearing: the devtools BroadcastChannel cannot cross origins, so the
 * inspector can only pair with the app's hub when served from this origin.
 * Requires @rtc/devtools-app to be built first — the devDependency gives turbo
 * the topological build edge. Verbatim port of client-react's devtoolsPanel().
 * Dependency-free: node:fs/node:path/node:module only. */
function devtoolsPanel(): Plugin {
  const require = createRequire(import.meta.url);
  const appDist = join(
    dirname(require.resolve("@rtc/devtools-app/package.json")),
    "dist",
  );

  function contentType(file: string): string {
    if (file.endsWith(".html")) {
      return "text/html";
    }

    if (file.endsWith(".js")) {
      return "text/javascript";
    }

    if (file.endsWith(".css")) {
      return "text/css";
    }

    if (file.endsWith(".svg")) {
      return "image/svg+xml";
    }

    return "application/octet-stream";
  }

  return {
    name: "rtc-devtools-panel",
    configureServer(server: ViteDevServer): void {
      server.middlewares.use("/devtools", (req, res, next): void => {
        const url = (req.url ?? "/").split("?")[0];
        const rel = url === "/" ? "index.html" : `.${url}`;
        const file = resolve(appDist, rel);

        if (
          (file === appDist || file.startsWith(appDist + sep)) &&
          existsSync(file) &&
          !file.endsWith(sep)
        ) {
          res.setHeader("content-type", contentType(file));
          createReadStream(file).pipe(res);
          return;
        }

        next();
      });
    },
    closeBundle(): void {
      if (existsSync(appDist)) {
        cpSync(appDist, join("dist", "devtools"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  // solid-devtools must precede vite-plugin-solid (its own docs say so): it
  // needs to see + transform source before the solid compiler runs. Dev-only —
  // the plugin's `apply()` gate skips it for `vite build` / production mode.
  plugins: [devtools({ autoname: true }), solid(), devtoolsPanel()],
  server: {
    host: "127.0.0.1",
    port: parseInt(process.env.PORT || "5473", 10),
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 3: Verify knip, dep-cruiser, and the build (build-order + copy)**

Run: `pnpm lint:dead`
Expected: PASS — `@rtc/devtools-app` counts as used (referenced by `require.resolve` in the `vite.config.ts` entry, same as client-react). If knip flags it unused, add `"@rtc/devtools-app"` to `packages/client-solid.ignoreDependencies` in `knip.json` (mirroring how the resolution is treated) — but first confirm client-react isn't relying on an ignore entry (it isn't; the vite.config.ts entry covers it).

Run: `pnpm check:deps`
Expected: PASS — `@rtc/devtools-app` is not source-imported from `src`, so `solid-stays-react-free` is not triggered.

Run: `pnpm build`
Expected: PASS — turbo builds `@rtc/devtools-app` before `@rtc/client-solid`, and `packages/client-solid/dist/devtools/index.html` exists afterward.

Run: `test -f packages/client-solid/dist/devtools/index.html && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add packages/client-solid/package.json pnpm-lock.yaml packages/client-solid/vite.config.ts knip.json
git commit -m "feat(client-solid): serve /devtools/ inspector same-origin (vite plugin)"
```

---

### Task 4: Un-exclude the Solid devtools e2e + STATUS.md correction

**Files:**
- Modify: `tests/browser/playwright/playwright.config.ts`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Consumes: the `/devtools/` serving from Task 3.
- Produces: `devtools.spec.ts` runs against `client-solid`; STATUS.md item removed.

- [ ] **Step 1: Remove the Solid exclusion of `devtools.spec.ts`**

In `tests/browser/playwright/playwright.config.ts`, change:

```ts
const notYetPortedSpecs = isSolid ? ["login.spec.ts", "devtools.spec.ts"] : [];
```

to:

```ts
const notYetPortedSpecs = isSolid ? ["login.spec.ts"] : [];
```

Also update the nearby explanatory comment block (lines ~19-26) that says `devtools.spec.ts` is excluded because Solid doesn't serve `/devtools/` — it now does; drop that clause, keep the `login.spec.ts` rationale.

- [ ] **Step 2: Run the devtools e2e against Solid**

Run (from `tests/`): `RTC_CLIENT_PKG=@rtc/client-solid tsx scripts/with-server.ts playwright test --config browser/playwright/playwright.config.ts devtools.spec.ts`
Expected: PASS — the Solid app's `/devtools/` inspector pairs with the app hub and observes state (this is the end-to-end witness).

If it fails to load `/devtools/`, confirm Task 3's `pnpm build` produced `dist/devtools` and the dev middleware is serving it.

- [ ] **Step 3: Remove the resolved STATUS.md item**

In `docs/STATUS.md`, delete the ⚪ bullet beginning **"`/devtools/` serving on Solid"** (now shipped). Leave the separate "Auth UI on Solid" item untouched.

Run: `pnpm check:doc-links`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/browser/playwright/playwright.config.ts docs/STATUS.md
git commit -m "test(e2e): run devtools.spec against client-solid; retire STATUS item"
```

---

### Task 5: Refresh the deploy/devtools memory (post-merge)

**Files:** none in-repo — updates the user's auto-memory.

- [ ] **Step 1:** After merge, correct `reference_vercel_deploy_topology` / the devtools workstream memory: Solid was previously **uninstrumented** (not "wired but unserved"); it now has full devtools parity (hub `rtc-web-solid` + 3 decorators + same-origin `/devtools/`), extension- and panel-inspectable at `rtc-clone-solid.vercel.app/devtools/`.

---

## Verification (whole-branch, before merge)

- `pnpm typecheck`, `pnpm build` (proves build-order + `dist/devtools`), `biome ci .`, ESLint + stylelint, `pnpm lint:dead`, `pnpm check:deps`.
- `pnpm --filter @rtc/client-solid test` (includes the new integration test).
- UI-contract coverage (both frameworks) — unchanged, but run it.
- The Solid `devtools.spec.ts` e2e (Task 4 Step 2).
- Post-merge live check: re-deploy Solid, confirm `rtc-clone-solid.vercel.app/devtools/` loads and the extension attaches.
