# @rtc/web-boot

Framework-free boot code shared by the web clients (`@rtc/client-react`,
`@rtc/client-solid`). It touches the DOM (`localStorage`, `matchMedia`,
`window` events) but imports no UI framework.

In it today:

- `bootApp.ts`, `coreSelection.ts`: the pre-boot resolve-and-load. The choice
  is `?core=`, then the stored Preferences value, then `VITE_CORE_IMPL`, then
  `rxjs`. `coreSelection.ts` holds the three `import()` calls that reach the
  cores.
- `coreHost.ts`, `coreSwapCover.ts`, `coreSwapView.ts`, `coverTimings.ts`: the
  core host that owns the ports and swaps the core in place, and the overlay
  that covers a swap.
- `adapters/`: the LocalStorage stores (session, preferences, data source, dock
  layout, layout presets) and the browser connection-events adapter.
- `theme/`: `MediaQueryColorSchemeAdapter`.
- `buildBrowserPorts.ts`, `env.ts`: `buildBrowserPorts` and `readDemoAccounts`,
  which take the build-time values as a `WebBootEnv`. A client makes one with
  `webBootEnvOf(import.meta.env)`, so this package never reads
  `import.meta.env` itself.
- `devtools/`: the presenter manifest and `createDevtoolsHub`, the app-side hub
  factory. `startWebClient` calls it once per page with the client's app id.
- `startWebClient.ts`: the page's composition root, one copy for both clients.
  It looks up the root element, creates the devtools hub, resolves and loads the
  core, builds the ports once, builds the core host, follows swaps and shows the
  boot-error screen when the first core cannot load or mount.

Not in it: the tree mount and the swap overlay. Each is a client's framework
part.

## Starting a client

A client's `main.tsx` is its font imports, a view factory and one call:

```ts
void startWebClient({
  appId: "rtc-web",
  rootId: "root",
  env: webBootEnvOf(import.meta.env),
  createView: createReactView,
});
```

`startWebClient` returns a promise that settles once the boot composition is
mounted or the boot-error screen is shown, and never rejects. A missing root
element and an invalid `VITE_CORE_IMPL` throw out of the call itself. An
optional `load` slot replaces the three `import()` calls; tests use it to hand
in cores they can track or break.

`createView(page)` is called once, after the first core loaded. The `page`
holds the `rootEl` the app tree mounts in, the `overlayEl` the swap overlay
renders in (outside the app tree, which is unmounted and mounted again under
it) and the `demoAccounts` the login screen lists. It returns the client's
`WebClientView`, four operations:

- `mount(composition)`: mounts the app tree over one composition,
  synchronously, and throws the error of a tree that fails its first render.
- `unmount()`: removes the tree, synchronously.
- `destroy()`: drops whatever the root still holds, for good, before the
  boot-error screen takes its element.
- `showOverlay(swap, fade)`: renders the swap overlay synchronously; a null
  `swap` removes it.

`WebBootEnv.dev` is the one flag the package reads itself: `startWebClient`
hands it to `createDevtoolsHub`.

Two dependency rules (`.dependency-cruiser.mts`):

- `web-boot-stays-framework-free`: no React, Solid, client, bindings,
  `@rtc/shared` or `@rtc/ui-contract` import.
- `web-clients-load-cores-lazily`: a core is reached only through `import()`,
  so each sits in its own lazy chunk.

```bash
pnpm --filter @rtc/web-boot test            # unit tests
pnpm --filter @rtc/web-boot test:coverage   # the gate: ≥95%, branches ≥85%
```

Both clients, the dev server included, consume the built `dist`. An edit here
shows up in a running `pnpm dev` only with `pnpm dev:watch` running alongside,
or after `pnpm --filter @rtc/web-boot build`. A client's tests see it the same
way.
