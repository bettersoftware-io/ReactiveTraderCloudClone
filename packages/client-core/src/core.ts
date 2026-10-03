import type { CoreFactory } from "@rtc/core-api";

import { createApp, createMachineFactories } from "#/composition";

export {
  createApp,
  createMachineFactories,
  RXJS_CORE_BRAND,
} from "#/composition";
export * from "#/presenters/index";

/**
 * The RxJS core as a `CoreFactory` — what each web client's
 * `coreSelection.ts` `loadCore` resolves to for the `"rxjs"` impl. This
 * module is the whole RxJS core's public surface: the composition root and,
 * through the barrel above, every presenter class and machine factory. It
 * lives behind the `@rtc/client-core/core` subpath export, NOT the root
 * index, so that a web client reaches it only through a dynamic `import()`:
 * that is what lets the bundler split the core into its own lazy chunk like
 * the two alternative cores (ADR-006 Decision 6), leaving the entry bundle
 * with no core at all. The root index exports NONE of it at runtime
 * (`core.publicApi.test.ts` pins that): the consumers that compose or
 * construct directly — React Native, the presenter-direct e2e peer, the test
 * pages, harnesses and fixtures — import this subpath too.
 */
export const rxjsCore: CoreFactory = { createApp, createMachineFactories };
