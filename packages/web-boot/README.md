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
  factory. A client calls it once with its app id.

Not in it: the tree mount and each client's own `main.tsx`.

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
