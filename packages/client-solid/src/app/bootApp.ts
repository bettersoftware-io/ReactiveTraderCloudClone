import type { CoreFactory, CoreImpl } from "@rtc/core-api";

import {
  CORE_PARAM,
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
}

/**
 * Resolves which core to boot (`?core=` > stored choice > build default >
 * `"rxjs"`), clears an invalid stored value, logs any warnings, then loads
 * the chosen core. Publishes nothing itself — the caller (`main.tsx`) owns
 * `<html data-core-impl>` and the render. Rejects when `load` rejects (e.g.
 * a failed chunk fetch); there is no silent fallback to a different core.
 */
export async function bootCore(env: BootEnv): Promise<BootResult> {
  const url = new URL(env.href).searchParams.get(CORE_PARAM);
  const choice = resolveCoreChoice({
    url,
    stored: readStoredChoice(env.storage),
    buildDefault: env.buildDefault,
  });

  for (const warning of choice.warnings) {
    env.warn(warning);
  }

  if (choice.clearStored) {
    clearCoreChoice(env.storage);
  }

  return { impl: choice.impl, core: await env.load(choice.impl) };
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
