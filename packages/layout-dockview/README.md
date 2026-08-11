# @rtc/layout-dockview

Framework-neutral Dockview wrapper — the only package allowed to import
`dockview-core`. Converts the app's seed-tree layout description into
Dockview's `SerializedDockview`, restores/serialises the opaque persisted
layout blob, and bridges panel maximize/exit-maximize through Dockview's API.

Zero other `@rtc/*` dependencies. Unlike `@rtc/motion-core` (pure, no-DOM
math) this package legitimately touches the DOM: `createDockEngine` mounts
Dockview into a container element. Its only architectural constraint is that
it imports no other `@rtc` package (`layout-dockview-stays-pure` in
`.dependency-cruiser.cjs`) and that `dockview-core` is confined to this
package (`dockview-core-only-in-layout-dockview`) — the engine stays
swappable by replacing one package (ADR-002).
