import { rxjsCore } from "@rtc/client-core";
import { asyncCore } from "@rtc/client-core-async";
import { effectCore } from "@rtc/client-core-effect";
import type { CoreFactory } from "@rtc/core-api";

export const CORE_IMPLS = ["rxjs", "async", "effect"] as const;
export type CoreImpl = (typeof CORE_IMPLS)[number];

/** Fail closed: a typo would otherwise boot RxJS silently, the same failure
 * mode the deploy guard exists to catch for VITE_SERVER_URL. */
export function resolveCoreImpl(raw: string | undefined): CoreImpl {
  if (raw === undefined || raw === "") {
    return "rxjs";
  }

  if ((CORE_IMPLS as readonly string[]).includes(raw)) {
    return raw as CoreImpl;
  }

  throw new Error(
    `VITE_CORE_IMPL="${raw}" is not one of ${CORE_IMPLS.join(", ")}`,
  );
}

/** The validated selection — what `data-core-impl` publishes, so a test or a
 * human reads "rxjs" under vitest/jsdom (no `define`) rather than the raw
 * `import.meta.env` string `"undefined"`. Fails closed on an unknown value
 * at module init. */
export const selectedCoreImpl: CoreImpl = resolveCoreImpl(
  import.meta.env.VITE_CORE_IMPL,
);

/** The application core this build boots. The comparison is made on the
 * literal `import.meta.env.VITE_CORE_IMPL` inlined by Vite's `define`, so
 * rolldown folds the two dead branches and drops the unselected core
 * packages, which declare `sideEffects: false`. `pnpm check:core-bundle`
 * proves it. */
export const activeCore: CoreFactory =
  import.meta.env.VITE_CORE_IMPL === "effect"
    ? effectCore
    : import.meta.env.VITE_CORE_IMPL === "async"
      ? asyncCore
      : rxjsCore;

// Published so a browser test can assert the selected core actually loaded;
// `check:core-bundle` proves the others are absent, this proves this one is
// present.
if (typeof document !== "undefined") {
  document.documentElement.dataset.coreImpl = selectedCoreImpl;
}
