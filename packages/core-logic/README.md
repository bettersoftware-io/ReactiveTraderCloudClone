# @rtc/core-logic

The pure rules, with no stream library, shared by the application cores
(`@rtc/client-core-rxjs`, `@rtc/client-core-async`, `@rtc/client-core-effect`) and
the UIs: reducers, folds, patches, the synchronous workspace / Jarvis
controllers, and the view helpers a UI calls directly (`blotter/`, `admin/`,
and `layout/`'s `lockedWidthPx`, `maximizeBoundaryPath`, `visibleRootOf`). Pluggable-core
slice 8 moved them here so the alternative cores need no runtime dependency
on the RxJS core.

**Purity rule** (dependency-cruiser `core-logic-stays-pure` + grep gate 43):
no runtime `rxjs` / `@rx-state/core` import, and runtime deps on
`@rtc/domain` and `@rtc/shared` only (`@rtc/core-api` for types). A stream
operation a rule needs is injected by the core that calls it (see
`createAuthDeps`'s `AuthDepsPrimitives`).
