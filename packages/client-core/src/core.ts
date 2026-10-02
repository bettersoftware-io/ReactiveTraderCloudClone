import type { CoreFactory } from "@rtc/core-api";

import { createApp, createMachineFactories } from "#/composition";

export {
  createApp,
  createMachineFactories,
  RXJS_CORE_BRAND,
} from "#/composition";

/**
 * The RxJS core as a `CoreFactory` — what each web client's
 * `coreSelection.ts` `loadCore` resolves to for the `"rxjs"` impl. It lives
 * behind the `@rtc/client-core/core` subpath export, NOT the root index, so
 * that a client reaches it only through a dynamic `import()`: that is what
 * lets the bundler split this composition root into its own lazy chunk like
 * the two alternative cores (approach B, ADR-006 Decision 6), leaving the
 * entry bundle with no core at all. The root index still exports `createApp`
 * and `createMachineFactories` for the consumers that compose directly —
 * React Native, the presenter-direct e2e peer, the ui-contract fixtures.
 */
export const rxjsCore: CoreFactory = { createApp, createMachineFactories };
