# @rtc/layout-dockview

Framework-neutral Dockview wrapper — the only package allowed to import
`dockview`. Converts the app's seed-tree layout description into
Dockview's `SerializedDockview`, restores/serialises the opaque persisted
layout blob, and bridges panel maximize/exit-maximize through Dockview's API.

Zero other `@rtc/*` dependencies. Unlike `@rtc/motion-core` (pure, no-DOM
math) this package legitimately touches the DOM: `createDockEngine` mounts
Dockview into a container element. Its only architectural constraint is that
it imports no other `@rtc` package (`layout-dockview-stays-pure` in
`.dependency-cruiser.cjs`) and that `dockview` is confined to this
package (`dockview-only-in-layout-dockview`) — the engine stays
swappable by replacing one package (ADR-002).

## Why `dockview`, not `dockview-core`

`dockview-core` is a real npm package and works, but constructing a
`DockviewComponent` from it logs a one-time console warning: *"do not use
`dockview-core` directly — it is an internal package. Use the `dockview`
package … instead."* Verified against the registry (`npm view dockview@7.0.4`)
before switching:

- `dockview@7.0.4` exists at the exact pin this package uses for
  `dockview-core`.
- Its only runtime dependency is `dockview-core: ^7.0.4` — no React or other
  framework runtime dep.
- Its entry (`dist/package/main.esm.mjs`) is `export * from 'dockview-core'`
  plus a call to `markDockviewPackageLoaded()` — the exact flag `dockview-core`
  checks before emitting the warning. Same API surface (`createDockview`,
  `DockviewApi`, every type used here), same base stylesheet (`npm pack` +
  `diff` confirmed `dockview/dist/styles/dockview.css` is byte-identical to
  `dockview-core`'s).

So the swap is a drop-in: same imports, same behaviour, warning gone.
