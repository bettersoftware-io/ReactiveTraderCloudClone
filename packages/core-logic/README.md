# @rtc/core-logic

The rxjs-free rules every application core composes over (`@rtc/client-core`,
`@rtc/client-core-async`, `@rtc/client-core-effect`): reducers, folds,
patches and the synchronous workspace / Jarvis controllers. Pluggable-core
slice 8 moved them here so the alternative cores need no runtime dependency
on the RxJS core.

**Purity rule** (dependency-cruiser `core-logic-stays-pure` + grep gate 43):
no runtime `rxjs` / `@rx-state/core` import, and runtime deps on
`@rtc/domain` and `@rtc/shared` only (`@rtc/core-api` for types). A stream
operation a rule needs is injected by the core that calls it (see
`createAuthDeps`'s `AuthDepsPrimitives`).
