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

import { createCoreSelection } from "./coreSelection";

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
  /** What `takePreferencesReopen()` would answer, without consuming it: a
   * pure read a UI may repeat during a render it might not commit. */
  peekPreferencesReopen(): boolean;
}

type CoreSwapPhase = "covering" | "loading" | "handover" | "revealing";

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
  /** Asked once per swap, as it starts: how long this swap's cover takes
   * to enter, hold and leave (the motion settings may change between two
   * swaps of one page). */
  readonly cover: () => CoverTimings;
  readonly sleep: (ms: number) => Promise<void>;
  readonly nextMacrotask: () => Promise<void>;
  /** Calls `onExpired` after `ms`, unless the function it returns is called
   * first. A cancellable timer, not a `sleep`: the wait it guards normally
   * ends long before, and nothing may be left pending when it does. */
  readonly startTimer: (ms: number, onExpired: () => void) => () => void;
}

/** How long a swap waits for the old core's `dispose()` to settle. All three
 * cores settle within a few milliseconds; this only has to be long enough
 * that a slow machine never reaches it. */
export const DISPOSE_TIMEOUT_MS = 5_000;

export interface CoreHost {
  readonly state$: StateStream<CoreHostState>;
  /** Mounts the boot composition. Called once by the entry file. Throws
   * when it cannot be composed or mounted, leaving nothing composed. */
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
 * Creates the host. `swapTo(impl)` runs, in order: ask for this swap's cover
 * timings, cover, load the new core, unmount the UI and wait one macrotask
 * (deferred machine disposals run), `await` the old core's `dispose()` (for
 * at most `DISPOSE_TIMEOUT_MS`), end
 * the devtools composition, compose the new core over the same ports and
 * mount it, publish (attribute, console line, saved choice, URL), then lift
 * the cover once the minimum hold — measured from the end of covering — has
 * passed.
 *
 * Failures (spec §1's table): a load that rejects leaves the page on the old
 * core, still mounted; a `createApp` (or `instrument`) that throws composes
 * the previous core again; when that throws too, `onFatal` gets the second
 * error and the first is a `[core]` warning. The reason reaches the UI
 * through `CoreSelection.failure$`. A `dispose()` that has not settled in
 * time ends in `onFatal` too: the next core is never composed over ports a
 * half-disposed core may still hold.
 *
 * Any other throw is split by whether a core is mounted. Between the unmount
 * and a successful mount nothing is on screen, so the throw ends in
 * `onFatal`, every composed-but-unmounted app is disposed and `state$` says
 * `fatal`. Before the unmount or after the mount the page keeps a working
 * core, so the throw is a `[core]` warning and the swap finishes. `swapTo`
 * never rejects, and the in-flight guard is always released: a `warn` that
 * throws is swallowed, and an `onFatal` that throws becomes a warning.
 *
 * `start()` follows the same rule for the boot composition: when composing
 * or mounting it throws, the composed app is disposed, `state$` says `fatal`
 * and the error is rethrown for the entry file's boot-error screen.
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
      coreSelection: createCoreSelection({
        current: impl,
        swapTo: (next: CoreImpl): void => {
          void swapTo(next);
        },
        failure$,
      }),
      takePreferencesReopen: (): boolean => {
        const reopen = reopenPending;
        reopenPending = false;
        return reopen;
      },
      peekPreferencesReopen: (): boolean => {
        return reopenPending;
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
    let cover: CoverTimings;
    let held: Promise<void>;
    let core: CoreFactory;

    try {
      cover = deps.cover();
      states.next({ phase: "covering", from, to });
      await deps.sleep(cover.enterMs);
      held = deps.sleep(cover.holdMs);
      states.next({ phase: "loading", from, to });
    } catch (error) {
      const reason = describeError(error);
      failures.next(`Could not switch to the ${to} core: ${reason}`);
      warn(
        `[core] could not switch to the ${to} core, staying on ${from}: ${reason}`,
      );
      return;
    }

    try {
      core = await deps.load(to);
    } catch (error) {
      const reason = describeError(error);
      failures.next(`Could not load the ${to} core: ${reason}`);
      warn(
        `[core] could not load the ${to} core, staying on ${from}: ${reason}`,
      );
      await liftCover(held, cover.exitMs, from, to);
      return;
    }

    states.next({ phase: "handover", from, to });
    const handover = await handOver(previous, core, to);

    if (handover === null) {
      return;
    }

    publishHandover(handover, from, to);
    await liftCover(held, cover.exitMs, from, to);
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
    let previousDisposeAsked = false;
    let previousDisposeTimedOut = false;
    let startFailure: string | null = null;

    try {
      deps.unmount();
      await deps.nextMacrotask();
      previousDisposeAsked = true;

      if (!(await disposeWithinLimit(previous))) {
        previousDisposeTimedOut = true;
        throw new Error(
          `the ${previous.impl} core did not finish disposing within ${DISPOSE_TIMEOUT_MS / 1000} s`,
        );
      }

      deps.endComposition();
      let composition: Composition;

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

      // Asked once only: a dispose that timed out must not be awaited
      // again. The disposals here are limited too, so a hang in one of them
      // cannot keep the fatal screen from showing.
      if (!previousDisposeAsked) {
        await disposeWithinLimit(previous);
      }

      if (orphan !== null && orphan !== previous) {
        await disposeWithinLimit(orphan);
      }

      if (previousDisposeTimedOut) {
        // The throw skipped this step, and an attached inspector would keep
        // holding the old composition's streams.
        runOrWarn("ending the devtools composition", () => {
          deps.endComposition();
        });
      }

      if (startFailure !== null) {
        // The fallback failed as well: say why the swap needed one, without
        // claiming the page is back on a core.
        warn(`[core] the ${to} core failed to start: ${startFailure}`);
      }

      reportFatal(error);
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
      warn(`[core] the ${to} core failed to start, back on ${from}: ${reason}`);
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
        warn(
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
      warn(`[core] ${step} failed: ${describeError(error)}`);
    }
  }

  /** Logs a warning. A console that throws has nowhere left to report to,
   * so its throw is dropped: a warning never ends a swap. */
  function warn(message: string): void {
    try {
      deps.warn(message);
    } catch {
      // Nothing can report a failing console.
    }
  }

  /** Hands the error to `onFatal`; a throw from it becomes a warning. */
  function reportFatal(error: unknown): void {
    try {
      deps.onFatal(error);
    } catch (failure) {
      warn(
        `[core] reporting the fatal error failed: ${describeError(failure)}`,
      );
    }
  }

  async function disposeQuietly(composed: Running): Promise<void> {
    try {
      await composed.app.dispose();
    } catch (error) {
      warn(
        `[core] the ${composed.impl} core failed to dispose: ${describeError(error)}`,
      );
    }
  }

  /** Disposes `composed`, waiting at most `DISPOSE_TIMEOUT_MS`. The answer
   * is whether it settled in time; a late settle changes nothing. */
  function disposeWithinLimit(composed: Running): Promise<boolean> {
    return new Promise((resolve) => {
      const cancelTimer = deps.startTimer(DISPOSE_TIMEOUT_MS, () => {
        resolve(false);
      });

      void disposeQuietly(composed).then(() => {
        cancelTimer();
        resolve(true);
      });
    });
  }

  async function liftCover(
    held: Promise<void>,
    exitMs: number,
    from: CoreImpl,
    to: CoreImpl,
  ): Promise<void> {
    try {
      await held;
      states.next({ phase: "revealing", from, to });
      await deps.sleep(exitMs);
    } catch (error) {
      warn(`[core] lifting the cover failed: ${describeError(error)}`);
    }
  }

  return {
    state$: state(states, states.getValue()),
    start: (): void => {
      const impl = deps.initial.impl;

      try {
        deps.mount(compose(impl, deps.initial.core, false));
      } catch (error) {
        // Nothing is on screen: drop what was composed, as a fatal swap does.
        const orphan = running;
        running = null;
        states.next({ phase: "fatal" });

        if (orphan !== null) {
          void disposeQuietly(orphan);
        }

        throw error;
      }

      runOrWarn(`publishing ${impl}`, () => {
        deps.publish(impl);
      });
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
