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
- `devtools/`: the presenter manifest.

Not in it: each client still owns `buildBrowserPorts.ts` (it reads the
`VITE_*` build values), the devtools hub, the tree mount and its own `main.tsx`.

Two dependency rules (`.dependency-cruiser.mts`):

- `web-boot-stays-framework-free`: no React, Solid, client, bindings,
  `@rtc/shared` or `@rtc/ui-contract` import.
- `web-clients-load-cores-lazily`: a core is reached only through `import()`,
  so each sits in its own lazy chunk.

```bash
pnpm --filter @rtc/web-boot test            # unit tests
pnpm --filter @rtc/web-boot test:coverage   # the gate: ≥95%, branches ≥85%
```

The clients consume the built `dist`, so a client's tests see an edit here only
after `pnpm --filter @rtc/web-boot build`.
