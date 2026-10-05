import type { CoreFactory, CoreImpl } from "@rtc/core-api";

import {
  CORE_PARAM,
  type CoreChoiceSource,
  clearCoreChoice,
  readStoredChoice,
  resolveCoreChoice,
} from "./coreSelection";

/** What `bootCore` needs from its host page — every effectful input, so the
 * resolve-then-load sequence is testable without a real DOM location or
 * `localStorage`. */
export interface BootEnv {
  readonly href: string;
  readonly storage: Storage | undefined;
  readonly buildDefault: string | undefined;
  readonly warn: (message: string) => void;
  readonly load: (impl: CoreImpl) => Promise<CoreFactory>;
}

export interface BootResult {
  readonly impl: CoreImpl;
  readonly core: CoreFactory;
  /** Which precedence step decided `impl` — see `CoreChoiceSource`; the
   * caller's boot-log line names it (`formatBootedMessage`). */
  readonly source: CoreChoiceSource;
}

/**
 * Resolves which core to boot (`?core=` > stored choice > build default >
 * `"rxjs"`), clears an invalid stored value, logs any warnings, then loads
 * the chosen core. Publishes nothing itself — the caller (`main.tsx`) owns
 * `<html data-core-impl>` and the render.
 *
 * Deliberately NOT an `async function`: resolving the choice is synchronous,
 * so an invalid `buildDefault` (`VITE_CORE_IMPL`) — a developer error, not a
 * runtime failure — throws synchronously out of this call, exactly as it did
 * before this module existed (an uncaught module-init error). Only `load`'s
 * promise (e.g. a failed chunk fetch) is asynchronous, and only ITS
 * rejection propagates as this function's rejection — the boot-error screen
 * (`renderBootError`) is for that case alone, never for a bad build default.
 * There is no silent fallback to a different core either way.
 */
export function bootCore(env: BootEnv): Promise<BootResult> {
  const url = new URL(env.href).searchParams.get(CORE_PARAM);
  const choice = resolveCoreChoice({
    url,
    stored: readStoredChoice(env.storage, env.warn),
    buildDefault: env.buildDefault,
  });

  for (const warning of choice.warnings) {
    env.warn(warning);
  }

  if (choice.clearStored) {
    clearCoreChoice(env.storage, env.warn);
  }

  return env.load(choice.impl).then((core) => {
    return { impl: choice.impl, core, source: choice.source };
  });
}

/** Formats the one-line boot log `main.tsx` prints after a successful boot
 * (`console.info(formatBootedMessage(impl, source))`) — names both WHAT
 * booted and WHY (which precedence step decided it), so a deployed build
 * booting on an unexpected core is diagnosable from the console alone. */
export function formatBootedMessage(
  impl: CoreImpl,
  source: CoreChoiceSource,
): string {
  return `[core] booted ${impl} from ${source}`;
}

/**
 * Runs a resolved `bootCore()` promise through `onBooted`, routing to
 * `onError` a rejection from EITHER stage: the initial core load (`boot`
 * itself rejecting), or an exception thrown inside `onBooted` (e.g.
 * the core host's first `createApp`/render blowing up). `.then(onBooted).catch(onError)`
 * is used rather than `boot.then(onBooted, onError)` deliberately: the
 * two-argument form's `onError` only ever sees `boot`'s OWN rejection — a
 * throw inside `onBooted` produces a NEW rejected promise `onError` never
 * sees. Chaining `.catch` after `.then` sees both.
 *
 * `bootCore`'s own SYNCHRONOUS throw (an invalid `VITE_CORE_IMPL` — a
 * developer error) happens before `runBoot` is even called — while `boot` is
 * being constructed, as an argument expression — so it is untouched by any
 * of this: it still escapes as an uncaught module-init error, exactly as
 * before `runBoot` existed.
 */
export function runBoot(
  boot: Promise<BootResult>,
  onBooted: (result: BootResult) => void,
  onError: (error: unknown) => void,
): Promise<void> {
  return boot.then(onBooted).catch(onError);
}

/**
 * Plain-DOM boot failure, rendered without any application core (none
 * loaded successfully): the error message plus a button that clears the
 * stored choice and reloads onto the default core. `root` is the same
 * element `main.tsx` would otherwise mount React/Solid into.
 */
export function renderBootError(
  root: HTMLElement,
  error: unknown,
  reset: () => void,
): void {
  const message = document.createElement("p");
  message.textContent = `The application core failed to load: ${error instanceof Error ? error.message : String(error)}`;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Load the default core";
  button.dataset.testid = "boot-core-reset";
  button.addEventListener("click", reset);

  root.replaceChildren(message, button);
}
