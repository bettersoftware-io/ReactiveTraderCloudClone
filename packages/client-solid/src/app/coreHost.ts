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
    }
  /** No core is composed: a swap failed after the unmount and `onFatal` has
   * the error (the boot-error screen replaces the page). Terminal. */
  | { readonly phase: "fatal" };

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

/** What the post-unmount section left mounted: the new core, or the
 * previous one again with the reason the new one failed to start. */
interface Handover {
  readonly composition: Composition;
  readonly startFailure: string | null;
}

/**
 * Creates the host. `swapTo(impl)` runs, in order: cover, load the new core,
 * unmount the UI and wait one macrotask (deferred machine disposals run),
 * `await` the old core's `dispose()`, end the devtools composition, compose
 * the new core over the same ports and mount it, publish (attribute, console
 * line, saved choice, URL), then lift the cover once the minimum hold —
 * measured from the end of covering — has passed.
 *
 * Failures (spec §1's table): a load that rejects leaves the page on the old
 * core, still mounted; a `createApp` (or `instrument`) that throws composes
 * the previous core again; when that throws too, `onFatal` gets the second
 * error. The reason reaches the UI through `CoreSelection.failure$`.
 *
 * Any other throw is split by whether a core is mounted. Between the unmount
 * and a successful mount nothing is on screen, so the throw ends in
 * `onFatal`, every composed-but-unmounted app is disposed and `state$` says
 * `fatal`. Before the unmount or after the mount the page keeps a working
 * core, so the throw is a `[core]` warning and the swap finishes. `swapTo`
 * never rejects, and the in-flight guard is always released.
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

  /** Composes `core` over the shared ports and makes it the running core.
   * An app whose `instrument` throws is disposed before the throw leaves. */
  function compose(
    impl: CoreImpl,
    core: CoreFactory,
    reopenPreferences: boolean,
  ): Composition {
    const app = core.createApp(ports);
    let instrumented: Pick<Composition, "presenters" | "machineFactories">;

    try {
      instrumented = deps.instrument(core, app);
    } catch (error) {
      void disposeQuietly({ impl, core, app });
      throw error;
    }

    running = { impl, core, app };
    generation += 1;
    let reopenPending = reopenPreferences;

    return {
      impl,
      generation,
      presenters: instrumented.presenters,
      machineFactories: instrumented.machineFactories,
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
    failures.next(null);

    try {
      await runSwap(previous, to);
    } finally {
      swapping = false;
      states.next(
        running === null
          ? { phase: "fatal" }
          : { phase: "running", impl: running.impl },
      );
    }
  }

  async function runSwap(previous: Running, to: CoreImpl): Promise<void> {
    const from = previous.impl;
    let held: Promise<void>;
    let core: CoreFactory;

    try {
      states.next({ phase: "covering", from, to });
      await deps.sleep(deps.cover.enterMs);
      held = deps.sleep(deps.cover.holdMs);
      states.next({ phase: "loading", from, to });
    } catch (error) {
      const reason = describeError(error);
      failures.next(`Could not switch to the ${to} core: ${reason}`);
      deps.warn(
        `[core] could not switch to the ${to} core, staying on ${from}: ${reason}`,
      );
      return;
    }

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
    const handover = await handOver(previous, core, to);

    if (handover === null) {
      return;
    }

    publishHandover(handover, from, to);
    await liftCover(held, from, to);
  }

  /** The section with nothing on screen: unmount, dispose the old core, and
   * mount the new one (or the previous one again). Any throw here ends in
   * `onFatal`, after every app that is composed but not mounted has been
   * disposed; the answer is then null. */
  async function handOver(
    previous: Running,
    core: CoreFactory,
    to: CoreImpl,
  ): Promise<Handover | null> {
    let previousDisposed = false;

    try {
      deps.unmount();
      await deps.nextMacrotask();
      await disposeQuietly(previous);
      previousDisposed = true;
      deps.endComposition();
      let composition: Composition;
      let startFailure: string | null = null;

      try {
        composition = compose(to, core, true);
      } catch (error) {
        startFailure = describeError(error);
        deps.endComposition();
        composition = compose(previous.impl, previous.core, true);
      }

      deps.mount(composition);
      return { composition, startFailure };
    } catch (error) {
      const orphan = running;
      running = null;

      if (!previousDisposed) {
        await disposeQuietly(previous);
      }

      if (orphan !== null && orphan !== previous) {
        await disposeQuietly(orphan);
      }

      deps.onFatal(error);
      return null;
    }
  }

  /** Publishes what the handover mounted. A core is on screen, so a throw
   * from any of these steps is a warning and the next step still runs. */
  function publishHandover(
    handover: Handover,
    from: CoreImpl,
    to: CoreImpl,
  ): void {
    if (handover.startFailure !== null) {
      const reason = handover.startFailure;
      deps.warn(
        `[core] the ${to} core failed to start, back on ${from}: ${reason}`,
      );
      runOrWarn(`publishing ${from}`, () => {
        deps.publish(from);
      });
      failures.next(`The ${to} core failed to start: ${reason}`);
      return;
    }

    runOrWarn(`publishing ${to}`, () => {
      deps.publish(to);
    });
    runOrWarn("logging the swap", () => {
      deps.info(`[core] swapped ${from} to ${to}`);
    });
    runOrWarn(`saving the choice of ${to}`, () => {
      if (!deps.persist(to)) {
        deps.warn(
          `[core] the choice of ${to} was not saved; it will not survive a reload`,
        );
      }
    });
    runOrWarn("removing ?core= from the URL", () => {
      deps.stripCoreParam();
    });
  }

  /** Runs one step on a page that has a mounted core: a throw becomes a
   * `[core]` warning instead of ending the swap. */
  function runOrWarn(step: string, run: () => void): void {
    try {
      run();
    } catch (error) {
      deps.warn(`[core] ${step} failed: ${describeError(error)}`);
    }
  }

  async function disposeQuietly(composed: Running): Promise<void> {
    try {
      await composed.app.dispose();
    } catch (error) {
      deps.warn(
        `[core] the ${composed.impl} core failed to dispose: ${describeError(error)}`,
      );
    }
  }

  async function liftCover(
    held: Promise<void>,
    from: CoreImpl,
    to: CoreImpl,
  ): Promise<void> {
    try {
      await held;
      states.next({ phase: "revealing", from, to });
      await deps.sleep(deps.cover.exitMs);
    } catch (error) {
      deps.warn(`[core] lifting the cover failed: ${describeError(error)}`);
    }
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
