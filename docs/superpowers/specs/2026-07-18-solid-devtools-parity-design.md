# Solid devtools parity — design

**Date:** 2026-07-18
**Status:** approved, ready for implementation plan

## Problem

The deployed React client (`rtc-clone.vercel.app`) is inspectable — via the MV3
Chrome extension against the live build, and via its same-origin `/devtools/`
panel. The deployed Solid client (`rtc-clone-solid.vercel.app`, shipped in
PR #257) is **not** inspectable by either route.

Root cause (verified in code, and a correction to prior notes): `client-solid`
was **never instrumented**. It has no `@rtc/devtools-core` dependency, no
`app/devtools/` module, and none of the three composition-root decorators. Its
only `devtools` reference is `import "solid-devtools"` — the third-party SolidJS
signal inspector, an unrelated dev-only tool. So the RTC inspector/extension has
nothing to attach to, in dev or prod. (The `docs/STATUS.md` "`/devtools/` serving
on Solid" item understated this: the gap is the *hub + decorators*, not just the
`/devtools/` route.)

## How the React devtools work (the thing we mirror)

- **App side** (`@rtc/devtools-core`): three structural decorators —
  `instrumentPresenters`, `instrumentMachineFactories`, `instrumentWsAdapter` —
  wrap the framework-free `client-core` presenters/machines/ws-adapter and feed a
  module-level `DevtoolsHub`. The hub attaches a `BroadcastChannelDuplex(
  "rtc-devtools")` transport. This is **not** dev-gated: constructed in prod too,
  so the deployed app is inspectable. `dev: import.meta.env?.DEV` only toggles the
  *write* (intent-injection) surface, never reads.
- **Dormant-until-attached**: every hot-path emit short-circuits `if
  (!this.isLive) return;`; state streams are subscribed only in `goLive()`. So
  when no inspector is attached the per-frame cost is ~zero — critical for a
  permanently-animated HUD. When live, events coalesce into ~33ms batches with a
  bounded ring buffer, paid only in the inspecting tab (BroadcastChannel is
  same-origin/local).
- **Two attach routes**: (1) the MV3 extension (same-origin content-script bridge
  → BroadcastChannel) needs only the app-side hub; (2) the same-origin
  `/devtools/` panel additionally needs `@rtc/devtools-app` served from this
  origin (BroadcastChannel can't cross origins).

Because the decorators are framework-free, Solid parity is a near-verbatim mirror
of `client-react`, not a re-implementation.

## Scope

**Full parity** (both attach routes). Decided over extension-only because it
matches React exactly and fully resolves the STATUS.md item. App id is
**distinct**: `rtc-web-solid` (React keeps `rtc-web`) so the inspector labels the
two apps unambiguously when both are open.

## Components (all mirror `client-react`)

### 1. Dependencies — `packages/client-solid/package.json`

- `@rtc/devtools-core` (runtime `dependency`) — hub + decorators.
- `@rtc/devtools-app` (`devDependency`) — build-order/asset edge for `/devtools/`
  serving; **source never imported** (dependency-cruiser forbids it), exactly as
  `client-react` declares it.
- Wire every per-package gate this dependency change touches: `knip` config,
  `dependency-cruiser` (mirror the client-react allowances so a `client-solid` →
  `devtools-core`/`devtools-app` edge is permitted and the "no source import of
  devtools-app" rule still holds), and `tsconfig` references if needed.

### 2. `src/app/devtools/devtoolsHub.ts`

Verbatim from `client-react` except the app id:

```ts
export const devtoolsHub = new DevtoolsHub({
  appId: "rtc-web-solid",
  dev: import.meta.env?.DEV === true,
});
```

Same `BroadcastChannelDuplex("rtc-devtools")` transport, same `BroadcastChannel`
and `window` guards, same `pagehide` → `dispose()`.

### 3. `src/app/devtools/presenterManifest.ts`

Duplicate `client-react`'s `PRESENTER_MANIFEST` verbatim. It is call-site
knowledge over the **shared** `client-core` presenters, so it is identical across
clients; duplicating (rather than extracting to a shared package) matches the
port's established verbatim-mirror philosophy and avoids a new cross-package
coupling. If the two ever drift, the state-tree panel makes a missing presenter
visibly absent (the same reminder React relies on).

### 4. `src/AppRoot.tsx`

Wrap presenters and machines through the hub, mirroring React (minus the
StrictMode lazy-ref — Solid's setup runs once):

```tsx
const { presenters, commands } = createApp(buildBrowserPorts());
const instrumented = instrumentPresenters(presenters, PRESENTER_MANIFEST, devtoolsHub);
const viewModel = createViewModel(
  instrumented,
  instrumentMachineFactories(createMachineFactories(instrumented), devtoolsHub),
  commands,
);
```

### 5. `src/app/buildBrowserPorts.ts`

In the `url` (real-WS) branch, wrap the transport at construction:

```ts
const ws = instrumentWsAdapter(
  new WsAdapter(url, () => sessionStore.read()?.token),
  devtoolsHub,
);
```

The simulator branch stays bare (its wire panel is simply empty), same as React.

### 6. `vite.config.ts`

Port React's `devtoolsPanel()` plugin **verbatim** — it is dependency-free
(`node:fs`/`node:path`/`node:module` only), including the `resolve()`-based
path-traversal guard. Add it after `solid()`. It serves `/devtools/` from the
built `@rtc/devtools-app` in dev (Connect middleware) and `cpSync`s it into
`dist/devtools` at `closeBundle`. No deploy change: `dist/devtools` is ordinary
build output under `packages/client-solid/dist`, which `vercel.solid.json`
already ships — so `rtc-clone-solid.vercel.app/devtools/` works automatically.

### 7. e2e — `tests/browser/playwright/playwright.config.ts`

Remove `"devtools.spec.ts"` from the `isSolid` `notYetPortedSpecs` array (leaving
`"login.spec.ts"`, which is the separate auth-UI item). The now-running spec is
the end-to-end witness that Solid's `/devtools/` panel pairs with the app hub.

### 8. `docs/STATUS.md`

Remove the now-resolved "`/devtools/` serving on Solid" ⚪ item (the correction
requested). Leave the separate "Auth UI on Solid" item untouched.

## Testing / verification

- **Unit (parity guard):** a `devtoolsIntegration.test.ts` in `client-solid`
  mirroring React's — build presenters, apply `instrumentPresenters` →
  `instrumentMachineFactories`, feed a real `DevtoolsHub`, drive an
  `InspectorStore`, and assert the state tree reflects presenter/machine emissions
  through the `solid-bindings` `createViewModel` (the Solid analogue of React's
  test).
- **e2e:** the un-excluded `devtools.spec.ts` running against `client-solid`
  (`RTC_CLIENT_PKG=@rtc/client-solid`).
- **Whole-branch gauntlet:** typecheck, Biome (`biome ci .`), ESLint (both
  configs) + stylelint, `knip`, `dependency-cruiser`, UI-contract coverage (both
  frameworks), and `pnpm build` (proves the `@rtc/devtools-app` build-order edge
  and the `dist/devtools` copy).
- **Live check (post-merge):** re-deploy Solid and confirm
  `rtc-clone-solid.vercel.app/devtools/` loads and the extension attaches to the
  live app.

## Non-goals

- Touching the React devtools wiring (unchanged).
- The separate "Auth UI on Solid" / `login.spec.ts` exclusion.
- Any change to `@rtc/devtools-core`, `@rtc/devtools-app`, or the extension —
  they are already framework-agnostic; this workstream only *consumes* them.
