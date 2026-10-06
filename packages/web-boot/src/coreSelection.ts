import type {
  CoreFactory,
  CoreImpl,
  CoreOption,
  CoreSelection,
  StateStream,
} from "@rtc/core-api";

/** Every application core a page can boot. Not exported — nothing outside
 * this module reads it (knip); the parallel `CORE_IMPLS` in
 * `tests/scripts/lib/coreImpl.ts` and `@rtc/ui-contract`'s
 * `PreferencesModalPage.ts` are deliberate, independent duplicates (see
 * their own doc comments), not consumers of this one. */
const CORE_IMPLS: readonly CoreImpl[] = ["rxjs", "async", "effect"];

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

/** Which precedence-chain step decided the booted core — surfaced so the
 * boot log (`[core] booted ${impl} from ${source}`) can say WHY, not just
 * WHAT: `"url"` (`?core=`, this load only), `"stored"` (a persisted
 * Preferences choice), `"build"` (`VITE_CORE_IMPL`), or `"fallback"` (no
 * input at all — the hardcoded `"rxjs"`). */
export type CoreChoiceSource = "url" | "stored" | "build" | "fallback";

export interface CoreChoice {
  readonly impl: CoreImpl;
  /** Which precedence step decided `impl` — see `CoreChoiceSource`. */
  readonly source: CoreChoiceSource;
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
 * `selectCore` fail-closed behaviour, unchanged in substance. `source`
 * records which step won, for the boot log.
 */
export function resolveCoreChoice(inputs: CoreChoiceInputs): CoreChoice {
  const warnings: string[] = [];
  let clearStored = false;

  if (inputs.url !== null) {
    if (isCoreImpl(inputs.url)) {
      return { impl: inputs.url, source: "url", warnings, clearStored };
    }

    warnings.push(
      `?core="${inputs.url}" is not one of ${CORE_IMPLS.join(", ")} — ignored`,
    );
  }

  if (inputs.stored !== null) {
    if (isCoreImpl(inputs.stored)) {
      return { impl: inputs.stored, source: "stored", warnings, clearStored };
    }

    warnings.push(
      `stored core "${inputs.stored}" is not one of ${CORE_IMPLS.join(", ")} — cleared`,
    );
    clearStored = true;
  }

  const build = inputs.buildDefault || undefined;

  if (build === undefined) {
    return { impl: "rxjs", source: "fallback", warnings, clearStored };
  }

  if (!isCoreImpl(build)) {
    throw new Error(
      `VITE_CORE_IMPL="${build}" is not one of ${CORE_IMPLS.join(", ")}`,
    );
  }

  return { impl: build, source: "build", warnings, clearStored };
}

/** How each lazily loaded core's module is fetched — injectable so the
 * selection in `loadCore` is unit-testable without really importing a whole
 * core (seconds under vitest on a loaded runner). */
export interface CoreImporters {
  readonly rxjs: () => Promise<RxjsCoreModule>;
  readonly async: () => Promise<AsyncCoreModule>;
  readonly effect: () => Promise<EffectCoreModule>;
}

/** The slice of `@rtc/client-core-rxjs`'s module `loadCore` reads. */
interface RxjsCoreModule {
  readonly rxjsCore: CoreFactory;
}

/** The slice of `@rtc/client-core-async`'s module `loadCore` reads. */
interface AsyncCoreModule {
  readonly asyncCore: CoreFactory;
}

/** The slice of `@rtc/client-core-effect`'s module `loadCore` reads. */
interface EffectCoreModule {
  readonly effectCore: CoreFactory;
}

/** The real importers. Each `import()` specifier must stay a string literal
 * here: that is what lets the bundler split each core into its own lazy
 * chunk (`pnpm check:core-bundle` witnesses it). All three are sibling
 * packages reached the same way; `@rtc/client-adapters`, which the UI imports
 * eagerly, holds only the adapters, so none of the three cores is in the
 * entry bundle (ADR-006 Decision 6). A static import of a core from this
 * client's source is a dependency-cruiser error
 * (`web-clients-load-cores-lazily`). */
const DEFAULT_CORE_IMPORTERS: CoreImporters = {
  rxjs: () => {
    return import("@rtc/client-core-rxjs");
  },
  async: () => {
    return import("@rtc/client-core-async");
  },
  effect: () => {
    return import("@rtc/client-core-effect");
  },
};

/**
 * Resolves the `CoreFactory` for `impl`. Every core is a dynamic import the
 * bundler splits into its own chunk, fetched only once chosen — the RxJS
 * default included, so the entry bundle privileges none of the three. A
 * failed chunk fetch rejects with the importer's own error.
 */
export async function loadCore(
  impl: CoreImpl,
  importers: CoreImporters = DEFAULT_CORE_IMPORTERS,
): Promise<CoreFactory> {
  if (impl === "async") {
    return (await importers.async()).asyncCore;
  }

  if (impl === "effect") {
    return (await importers.effect()).effectCore;
  }

  return (await importers.rxjs()).rxjsCore;
}

/** Formats a caught storage exception into one log line — shared by every
 * storage accessor below so a denial/quota/private-browsing failure reads
 * the same wherever it's logged. */
function describeStorageFailure(action: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `${action}: ${reason}`;
}

/** Reads the persisted core choice; unreadable storage (denied, absent)
 * reads as null rather than throwing. A caught exception (not mere absence)
 * is reported via `warn` when given — non-fatal, but diagnosable. */
export function readStoredChoice(
  storage: Pick<Storage, "getItem"> | undefined,
  warn?: (message: string) => void,
): string | null {
  try {
    return storage?.getItem(CORE_CHOICE_KEY) ?? null;
  } catch (error) {
    warn?.(
      describeStorageFailure("failed to read the stored core choice", error),
    );
    return null;
  }
}

/** Persists the core choice; reports a failed write (quota, denied, absent
 * storage) rather than throwing. A caught exception is reported via `warn`
 * when given — failure to persist is non-fatal, but diagnosable. */
export function saveCoreChoice(
  storage: Pick<Storage, "setItem"> | undefined,
  impl: CoreImpl,
  warn?: (message: string) => void,
): boolean {
  try {
    if (storage === undefined) {
      return false;
    }

    storage.setItem(CORE_CHOICE_KEY, impl);
    return true;
  } catch (error) {
    warn?.(
      describeStorageFailure(`failed to persist core choice "${impl}"`, error),
    );
    return false;
  }
}

/** Clears the persisted core choice; unreadable storage holds nothing to
 * clear. A caught exception is reported via `warn` when given. */
export function clearCoreChoice(
  storage: Pick<Storage, "removeItem"> | undefined,
  warn?: (message: string) => void,
): void {
  try {
    storage?.removeItem(CORE_CHOICE_KEY);
  } catch (error) {
    warn?.(
      describeStorageFailure("failed to clear the stored core choice", error),
    );
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

/**
 * The href the boot-error screen's "Load the default core" action reloads
 * onto: `href` with `?core=rxjs` forced — not merely `?core=` stripped.
 * Stripping alone would fall through to the next precedence step (the
 * stored choice, then the build default `VITE_CORE_IMPL`), which can be the
 * very core whose chunk just failed to load (e.g. a stale `dev:*:effect`
 * dist) — landing right back on the same failure and looping. Forcing the
 * default guarantees the reset lands on a DIFFERENT core than the one that
 * failed, whenever that one wasn't RxJS. Since approach B the RxJS core is a
 * lazy chunk too, so it can fail the same way (a dropped network, a stale
 * dist); the reset is then a plain retry of the same fetch — there is no
 * safer core to fall back to, and a retry is the right recovery for a
 * transient fetch failure anyway.
 */
export function defaultCoreResetHref(href: string): string {
  const url = new URL(href);
  url.searchParams.set(CORE_PARAM, "rxjs");
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
  /** The core this composition runs on. */
  readonly current: CoreImpl;
  /** The host's swap: replaces the running core in place, no reload. */
  readonly swapTo: (impl: CoreImpl) => void;
  /** The host's report of why the last swap left the page on `current`. */
  readonly failure$: StateStream<string | null>;
}

/**
 * One composition's `CoreSelection`: the core it runs on, the choices on
 * offer, and how to switch. `select` hands the choice to the core host,
 * which swaps the running core in place (spec
 * 2026-10-05-core-hot-swap-design.md §2) and reports a failed swap through
 * `failure$`. Re-selecting the current core is a no-op.
 */
export function createCoreSelection(deps: CoreSelectionDeps): CoreSelection {
  return {
    current: deps.current,
    options: CORE_OPTIONS,
    failure$: deps.failure$,
    select: (impl: CoreImpl): void => {
      if (impl !== deps.current) {
        deps.swapTo(impl);
      }
    },
  };
}

function isCoreImpl(value: string): value is CoreImpl {
  return (CORE_IMPLS as readonly string[]).includes(value);
}
