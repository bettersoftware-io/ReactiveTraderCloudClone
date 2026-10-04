import type { CoreFactory } from "@rtc/core-api";

import { createApp, createMachineFactories } from "#/composition";

export {
  createApp,
  createMachineFactories,
  RXJS_CORE_BRAND,
} from "#/composition";
// The saved-layouts controller and the workspace persistence writer are public
// for the ui-contract fixtures (`tests/ui/contract/<framework>/
// viewModelFromWorld.ts`), which reproduce composition.ts's wiring over the
// neutral World: a fixture that re-implemented the preset or persistence rules
// would prove nothing about the real ones. Otherwise only `composition.ts`
// uses them.
export * from "#/layout/createLayoutPresets";
export * from "#/layout/workspacePersistenceWriter";
export * from "#/presenters/index";

/**
 * The RxJS core as a `CoreFactory` — what each web client's
 * `coreSelection.ts` `loadCore` resolves to for the `"rxjs"` impl. This
 * module is the whole RxJS core's public surface: the composition root and,
 * through the barrel above, every presenter class and machine factory. A web
 * client reaches it only through a dynamic `import()`: that is what lets the
 * bundler put the core in its own lazy chunk, like the two alternative cores
 * (ADR-006 Decision 6), leaving the entry bundle with no core at all
 * (dependency-cruiser `web-clients-load-cores-lazily`, `pnpm
 * check:core-bundle`). The consumers that compose or construct directly —
 * React Native, the presenter-direct e2e peer, the test pages, harnesses and
 * fixtures — import this package statically.
 */
export const rxjsCore: CoreFactory = { createApp, createMachineFactories };
