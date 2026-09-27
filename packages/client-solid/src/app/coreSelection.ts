import { rxjsCore } from "@rtc/client-core";
import type {
  CoreFactory,
  CoreImpl,
  CoreOption,
  CoreSelection,
} from "@rtc/core-api";

/** Every application core a page can boot. */
export const CORE_IMPLS: readonly CoreImpl[] = ["rxjs", "async", "effect"];

/** The `localStorage` key the chosen core is persisted under. */
export const CORE_CHOICE_KEY = "rtc.coreImpl";

/** The `?core=` URL parameter name. */
export const CORE_PARAM = "core";

export const CORE_OPTIONS: readonly CoreOption[] = [
  {
    impl: "rxjs",
    label: "RxJS",
    description: "Observables and operators — the default core.",
  },
  {
    impl: "async",
    label: "async/await",
    description: "Plain async/await and AsyncIterable, no stream library.",
  },
  {
    impl: "effect",
    label: "Effect-TS",
    description: "Effect's fibers, layers and streams.",
  },
];

export interface CoreChoiceInputs {
  /** The `?core=` value, or null if absent from the URL. */
  readonly url: string | null;
  /** The persisted `localStorage["rtc.coreImpl"]` value, or null if absent or unreadable. */
  readonly stored: string | null;
  /** `import.meta.env.VITE_CORE_IMPL` — the build-time default. */
  readonly buildDefault: string | undefined;
}

export interface CoreChoice {
  readonly impl: CoreImpl;
  /** Human-readable warnings for an ignored/cleared invalid value — log these, never throw them. */
  readonly warnings: readonly string[];
  /** True when the stored value was invalid and should be cleared via `clearCoreChoice`. */
  readonly clearStored: boolean;
}

/**
 * Resolves which core to boot from the precedence chain: `?core=` (this load
 * only, never persisted) > the stored choice > the build default
 * (`VITE_CORE_IMPL`) > `"rxjs"`. An unknown `?core=` or stored value is
 * ignored/cleared with a warning and falls through to the next step; an
 * unknown build default is a developer error and throws — today's
 * `selectCore` fail-closed behaviour, unchanged in substance.
 */
export function resolveCoreChoice(inputs: CoreChoiceInputs): CoreChoice {
  const warnings: string[] = [];
  let clearStored = false;

  if (inputs.url !== null) {
    if (isCoreImpl(inputs.url)) {
      return { impl: inputs.url, warnings, clearStored };
    }

    warnings.push(
      `?core="${inputs.url}" is not one of ${CORE_IMPLS.join(", ")} — ignored`,
    );
  }

  if (inputs.stored !== null) {
    if (isCoreImpl(inputs.stored)) {
      return { impl: inputs.stored, warnings, clearStored };
    }

    warnings.push(
      `stored core "${inputs.stored}" is not one of ${CORE_IMPLS.join(", ")} — cleared`,
    );
    clearStored = true;
  }

  const build = inputs.buildDefault || undefined;

  if (build === undefined) {
    return { impl: "rxjs", warnings, clearStored };
  }

  if (!isCoreImpl(build)) {
    throw new Error(
      `VITE_CORE_IMPL="${build}" is not one of ${CORE_IMPLS.join(", ")}`,
    );
  }

  return { impl: build, warnings, clearStored };
}

/**
 * Resolves the `CoreFactory` for `impl`. RxJS is statically imported (its
 * adapters are in the entry bundle anyway); async and Effect are dynamic
 * imports the bundler splits into their own chunks, fetched only once chosen.
 */
export async function loadCore(impl: CoreImpl): Promise<CoreFactory> {
  if (impl === "async") {
    return (await import("@rtc/client-core-async")).asyncCore;
  }

  if (impl === "effect") {
    return (await import("@rtc/client-core-effect")).effectCore;
  }

  return rxjsCore;
}

/** Reads the persisted core choice; unreadable storage (denied, absent) reads as null, never throws. */
export function readStoredChoice(
  storage: Pick<Storage, "getItem"> | undefined,
): string | null {
  try {
    return storage?.getItem(CORE_CHOICE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Persists the core choice; reports a failed write (quota, denied, absent storage) rather than throwing. */
export function saveCoreChoice(
  storage: Pick<Storage, "setItem"> | undefined,
  impl: CoreImpl,
): boolean {
  try {
    if (storage === undefined) {
      return false;
    }

    storage.setItem(CORE_CHOICE_KEY, impl);
    return true;
  } catch {
    return false;
  }
}

/** Clears the persisted core choice; unreadable storage holds nothing to clear. */
export function clearCoreChoice(
  storage: Pick<Storage, "removeItem"> | undefined,
): void {
  try {
    storage?.removeItem(CORE_CHOICE_KEY);
  } catch {
    // Unreadable storage holds nothing to clear.
  }
}

/**
 * Strips `?core=` from `href`, leaving every other parameter and the hash
 * untouched. Returns `href` unchanged when the parameter is already absent —
 * `new URL(href).toString()` alone would add a trailing `/` to an
 * origin-only URL (`https://x.test` -> `https://x.test/`) even with nothing
 * to strip, so the no-op case is short-circuited explicitly.
 */
export function urlWithoutCoreParam(href: string): string {
  if (!new URL(href).searchParams.has(CORE_PARAM)) {
    return href;
  }

  const url = new URL(href);
  url.searchParams.delete(CORE_PARAM);
  return url.toString();
}

/** `window.localStorage`, or `undefined` when it throws (private-browsing
 * denial, disabled storage) rather than propagating the exception up
 * through boot. */
export function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export interface CoreSelectionDeps {
  readonly current: CoreImpl;
  readonly storage: Storage | undefined;
  readonly href: () => string;
  readonly navigate: (href: string) => void;
}

/**
 * The app-shell `CoreSelection` value: the currently active core, the
 * choices on offer, and how to switch. `select` saves the choice and reloads
 * the page with `?core=` stripped (so a link opened as `?core=effect` does
 * not reload straight back onto Effect, since the URL parameter outranks the
 * stored choice); when the choice cannot be persisted, it carries the choice
 * for this load only via `?core=` instead. Re-selecting the current core is
 * a no-op.
 */
export function createCoreSelection(deps: CoreSelectionDeps): CoreSelection {
  return {
    current: deps.current,
    options: CORE_OPTIONS,
    select: (impl: CoreImpl): void => {
      if (impl === deps.current) {
        return;
      }

      const clean = urlWithoutCoreParam(deps.href());

      if (saveCoreChoice(deps.storage, impl)) {
        deps.navigate(clean);
        return;
      }

      // Storage unavailable: carry the choice for this load in the URL instead.
      const url = new URL(clean);
      url.searchParams.set(CORE_PARAM, impl);
      deps.navigate(url.toString());
    },
  };
}

function isCoreImpl(value: string): value is CoreImpl {
  return (CORE_IMPLS as readonly string[]).includes(value);
}
