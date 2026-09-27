// Which application core an e2e run targets. The harness's own knob is
// RTC_CORE_IMPL — devServer.ts forwards it to the spawned Vite server as
// VITE_CORE_IMPL, the runner configs name their report directories after it,
// and the login scenario asserts the booted core against it. But
// VITE_CORE_IMPL is the knob every `dev:*` script and the README teach, and
// `VITE_CORE_IMPL=async pnpm test:e2e` used to be silently overwritten by an
// unset RTC_CORE_IMPL, so a green "async" run was really an RxJS one (it
// happened, 2026-09-27). The entry points therefore resolve both once and
// write the answer back as RTC_CORE_IMPL for everything downstream.

export const CORE_IMPLS = ["rxjs", "async", "effect"] as const;

export type CoreImpl = (typeof CORE_IMPLS)[number];

/** The core the run targets: RTC_CORE_IMPL, else VITE_CORE_IMPL, else rxjs.
 * Throws when both are set and disagree, or when the name is unknown. */
export function resolveCoreImpl(env: NodeJS.ProcessEnv): CoreImpl {
  const rtc = env.RTC_CORE_IMPL || undefined;
  const vite = env.VITE_CORE_IMPL || undefined;

  if (rtc && vite && rtc !== vite) {
    throw new Error(
      `RTC_CORE_IMPL="${rtc}" and VITE_CORE_IMPL="${vite}" disagree — set one of them`,
    );
  }

  const chosen = rtc ?? vite ?? "rxjs";

  if (!isCoreImpl(chosen)) {
    throw new Error(`"${chosen}" is not one of ${CORE_IMPLS.join(", ")}`);
  }

  return chosen;
}

/** Resolve the run's core and record it as RTC_CORE_IMPL in `env`. */
export function adoptCoreImpl(env: NodeJS.ProcessEnv): void {
  env.RTC_CORE_IMPL = resolveCoreImpl(env);
}

function isCoreImpl(value: string): value is CoreImpl {
  return (CORE_IMPLS as readonly string[]).includes(value);
}
