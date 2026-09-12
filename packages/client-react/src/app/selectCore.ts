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

const IMPL = resolveCoreImpl(import.meta.env.VITE_CORE_IMPL);

/** The application core this build boots. `import.meta.env.VITE_CORE_IMPL`
 * is inlined by Vite, so the two dead branches — and the two unused core
 * packages behind them, which declare `sideEffects: false` — are dropped
 * from the production bundle (`pnpm check:core-bundle` proves it). */
export const activeCore: CoreFactory =
  IMPL === "effect" ? effectCore : IMPL === "async" ? asyncCore : rxjsCore;
