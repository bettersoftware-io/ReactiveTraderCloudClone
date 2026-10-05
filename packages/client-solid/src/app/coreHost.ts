/**
 * The core host: the framework-free object that owns what outlives one
 * application core — the ports, the running composition, and the swap
 * sequence (spec 2026-10-05-core-hot-swap-design.md §1). Twin of
 * `client-solid`'s `src/app/coreHost.ts`, byte for byte.
 *
 * The ports are built once per page and handed to every `createApp` as the
 * SAME object; a swap disposes the running core and composes another over
 * them, with no reload. Every effect (mounting the UI, devtools, the URL, the
 * saved choice, the console, time) is injected, so the whole sequence is
 * unit-testable with fake cores.
 */
import { state } from "@rx-state/core";
import { BehaviorSubject } from "rxjs";

import type {
  App,
  AppCommands,
  AppPorts,
  CoreFactory,
  CoreImpl,
  CoreSelection,
  MachineFactories,
  Presenters,
  StateStream,
} from "@rtc/core-api";

import { CORE_OPTIONS } from "./coreSelection";

export interface Composition {
  readonly impl: CoreImpl;
  /** 1 for the boot composition, +1 per mount: the UI root's remount key. */
  readonly generation: number;
  readonly presenters: Presenters;
  readonly machineFactories: MachineFactories;
  readonly commands: AppCommands;
  readonly coreSelection: CoreSelection;
  /** True exactly once, for the composition a swap produced. */
  takePreferencesReopen(): boolean;
}

export type CoreSwapPhase = "covering" | "loading" | "handover" | "revealing";

export type CoreHostState =
  | { readonly phase: "running"; readonly impl: CoreImpl }
  | {
      readonly phase: CoreSwapPhase;
      readonly from: CoreImpl;
      readonly to: CoreImpl;
    };

export interface CoverTimings {
  readonly enterMs: number;
  readonly holdMs: number;
  readonly exitMs: number;
}

export interface CoreHostDeps {
  readonly ports: AppPorts;
  readonly initial: { readonly impl: CoreImpl; readonly core: CoreFactory };
  readonly load: (impl: CoreImpl) => Promise<CoreFactory>;
  /** Applies the devtools decorators to one composition. */
  readonly instrument: (
    core: CoreFactory,
    app: App,
  ) => Pick<Composition, "presenters" | "machineFactories">;
  readonly endComposition: () => void;
  /** Synchronous: the tree is in the DOM when it returns. */
  readonly mount: (composition: Composition) => void;
  /** Synchronous: the tree is gone when it returns. */
  readonly unmount: () => void;
  readonly publish: (impl: CoreImpl) => void;
  readonly persist: (impl: CoreImpl) => boolean;
  readonly stripCoreParam: () => void;
  /** Each receives a complete console line, `[core]` prefix included. */
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly onFatal: (error: unknown) => void;
  readonly cover: CoverTimings;
  readonly sleep: (ms: number) => Promise<void>;
  readonly nextMacrotask: () => Promise<void>;
}

export interface CoreHost {
  readonly state$: StateStream<CoreHostState>;
  /** Mounts the boot composition. Called once by the entry file. */
  start(): void;
  swapTo(impl: CoreImpl): Promise<void>;
}

/** The core a composition runs on, kept so a failed swap can compose it
 * again and a successful one can dispose it. */
interface Running {
  readonly impl: CoreImpl;
  readonly core: CoreFactory;
  readonly app: App;
}

type BootSplashPort = NonNullable<AppPorts["bootSplash"]>;

/**
 * Creates the host. `swapTo(impl)` runs, in order: cover, load the new core,
 * unmount the UI and wait one macrotask (deferred machine disposals run),
 * `await` the old core's `dispose()`, end the devtools composition, compose
 * the new core over the same ports and mount it, publish (attribute, console
 * line, saved choice, URL), then lift the cover once the minimum hold —
 * measured from the end of covering — has passed.
 *
 * Failures (spec §1's table): a load that rejects leaves the page on the old
 * core, still mounted; a `createApp` that throws composes the previous core
 * again; when that throws too, `onFatal` gets the second error. The reason
 * reaches the UI through `CoreSelection.failure$`. Whatever happens, the
 * in-flight guard is released and `state$` returns to `running`.
 */
export function createCoreHost(deps: CoreHostDeps): CoreHost {
  const ports: AppPorts = {
    ...deps.ports,
    bootSplash: playOncePerPage(deps.ports.bootSplash),
  };

  const states = new BehaviorSubject<CoreHostState>({
    phase: "running",
    impl: deps.initial.impl,
  });
  const failures = new BehaviorSubject<string | null>(null);
  const failure$ = state(failures, null);
  let running: Running | null = null;
  let generation = 0;
  let swapping = false;

  function compose(
    impl: CoreImpl,
    core: CoreFactory,
    reopenPreferences: boolean,
  ): Composition {
    const app = core.createApp(ports);
    const { presenters, machineFactories } = deps.instrument(core, app);
    running = { impl, core, app };
    generation += 1;
    let reopenPending = reopenPreferences;

    return {
      impl,
      generation,
      presenters,
      machineFactories,
      commands: app.commands,
      coreSelection: {
        current: impl,
        options: CORE_OPTIONS,
        select: (next: CoreImpl): void => {
          void swapTo(next);
        },
        failure$,
      },
      takePreferencesReopen: (): boolean => {
        const reopen = reopenPending;
        reopenPending = false;
        return reopen;
      },
    };
  }

  async function swapTo(to: CoreImpl): Promise<void> {
    const previous = running;

    if (swapping || previous === null || to === previous.impl) {
      return;
    }

    swapping = true;
    const from = previous.impl;
    failures.next(null);

    try {
      states.next({ phase: "covering", from, to });
      await deps.sleep(deps.cover.enterMs);
      const held = deps.sleep(deps.cover.holdMs);
      states.next({ phase: "loading", from, to });

      let core: CoreFactory;

      try {
        core = await deps.load(to);
      } catch (error) {
        const reason = describeError(error);
        failures.next(`Could not load the ${to} core: ${reason}`);
        deps.warn(
          `[core] could not load the ${to} core, staying on ${from}: ${reason}`,
        );
        await liftCover(held, from, to);
        return;
      }

      states.next({ phase: "handover", from, to });
      deps.unmount();
      await deps.nextMacrotask();
      await disposeQuietly(previous);
      deps.endComposition();

      if (!handOver(previous, core, to)) {
        return;
      }

      await liftCover(held, from, to);
    } finally {
      swapping = false;
      states.next({ phase: "running", impl: running?.impl ?? from });
    }
  }

  /** Composes and mounts `to`, or the previous core again when `to` throws.
   * False when neither composes: `onFatal` has the second error and nothing
   * is mounted. */
  function handOver(
    previous: Running,
    core: CoreFactory,
    to: CoreImpl,
  ): boolean {
    const from = previous.impl;
    let composition: Composition;

    try {
      composition = compose(to, core, true);
    } catch (error) {
      const reason = describeError(error);
      deps.warn(
        `[core] the ${to} core failed to start, back on ${from}: ${reason}`,
      );
      deps.endComposition();
      let fallback: Composition;

      try {
        fallback = compose(from, previous.core, true);
      } catch (fatal) {
        running = null;
        deps.onFatal(fatal);
        return false;
      }

      deps.mount(fallback);
      deps.publish(from);
      failures.next(`The ${to} core failed to start: ${reason}`);
      return true;
    }

    deps.mount(composition);
    deps.publish(to);
    deps.info(`[core] swapped ${from} to ${to}`);

    if (!deps.persist(to)) {
      deps.warn(
        `[core] the choice of ${to} was not saved; it will not survive a reload`,
      );
    }

    deps.stripCoreParam();
    return true;
  }

  async function disposeQuietly(previous: Running): Promise<void> {
    try {
      await previous.app.dispose();
    } catch (error) {
      deps.warn(
        `[core] the ${previous.impl} core failed to dispose: ${describeError(error)}`,
      );
    }
  }

  async function liftCover(
    held: Promise<void>,
    from: CoreImpl,
    to: CoreImpl,
  ): Promise<void> {
    await held;
    states.next({ phase: "revealing", from, to });
    await deps.sleep(deps.cover.exitMs);
  }

  return {
    state$: state(states, states.getValue()),
    start: (): void => {
      deps.mount(compose(deps.initial.impl, deps.initial.core, false));
      deps.publish(deps.initial.impl);
    },
    swapTo,
  };
}

/** Wraps the boot-splash port so the environment's decision is asked once,
 * for the page's first composition; every later composition is told not to
 * play. An absent port means "play" (the cores' own default). */
function playOncePerPage(splash: BootSplashPort | undefined): BootSplashPort {
  let asked = false;

  return {
    shouldPlay: (): boolean => {
      if (asked) {
        return false;
      }

      asked = true;
      return splash?.shouldPlay() ?? true;
    },
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
