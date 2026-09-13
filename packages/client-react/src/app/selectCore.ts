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

// Validation only — fail closed on an unknown value at module init.
resolveCoreImpl(import.meta.env.VITE_CORE_IMPL);

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
  document.documentElement.dataset.coreImpl = import.meta.env.VITE_CORE_IMPL;
}
