import { afterEach, describe, expect, it, type Mock, vi } from "vitest";

import type {
  App,
  AppCommands,
  AppPorts,
  CoreFactory,
  CoreImpl,
  MachineFactories,
  Presenters,
} from "@rtc/core-api";

import {
  type Composition,
  type CoreHost,
  type CoreHostDeps,
  type CoreHostState,
  createCoreHost,
} from "./coreHost";
import { CORE_OPTIONS } from "./coreSelection";

afterEach(() => {
  vi.useRealTimers();
});

describe("createCoreHost", () => {
  it("1. start() composes the initial core once over the given ports, mounts generation 1, publishes its impl", () => {
    const harness = createHarness();

    harness.start();

    expect(harness.log).toEqual(["createApp:rxjs", "mount:1", "publish:rxjs"]);
    const [composition] = harness.mounted;
    expect(composition?.impl).toBe("rxjs");
    expect(composition?.generation).toBe(1);
    expect(composition?.coreSelection.current).toBe("rxjs");
    expect(composition?.coreSelection.options).toBe(CORE_OPTIONS);

    // The composition's selection drives the host: picking another core
    // starts a swap at once (the overlay covers synchronously).
    composition?.coreSelection.select("effect");
    expect(harness.states.at(-1)).toEqual({
      phase: "covering",
      from: "rxjs",
      to: "effect",
    });
  });

  it("2. swapTo runs the steps in order", async () => {
    const harness = createHarness();
    harness.start();
    harness.log.length = 0;

    await harness.host.swapTo("effect");

    expect(harness.log).toEqual([
      "cover",
      "load",
      "unmount",
      "macrotask",
      "dispose:rxjs",
      "endComposition",
      "createApp:effect",
      "mount:2",
      "publish:effect",
      "persist:effect",
      "stripCoreParam",
      "lift",
    ]);
  });

  it("3. both compositions receive the same ports object", async () => {
    const harness = createHarness();
    harness.start();

    await harness.host.swapTo("effect");

    const [first] = harness.cores.rxjs.received;
    const [second] = harness.cores.effect.received;
    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it("4. swapTo(current) does nothing; a second swapTo during a swap does nothing", async () => {
    const harness = createHarness();
    harness.start();
    harness.log.length = 0;

    await harness.host.swapTo("rxjs");
    expect(harness.log).toEqual([]);
    expect(harness.states).toEqual([{ phase: "running", impl: "rxjs" }]);

    const pending = createDeferred<CoreFactory>();
    harness.loadResults.effect = pending.promise;
    const first = harness.host.swapTo("effect");
    await harness.host.swapTo("async");
    pending.resolve(harness.cores.effect.core);
    await first;

    expect(harness.load).toHaveBeenCalledTimes(1);
    expect(harness.load).toHaveBeenCalledWith("effect");
    expect(harness.log.filter(isCreateApp)).toEqual(["createApp:effect"]);
  });

  it("5. a rejected load leaves the page on the old core and reports why; the next swapTo clears it", async () => {
    const harness = createHarness();
    harness.start();
    harness.loadResults.effect = Promise.reject(new Error("chunk 404"));

    await harness.host.swapTo("effect");

    expect(harness.states.at(-1)).toEqual({ phase: "running", impl: "rxjs" });
    expect(harness.unmount).not.toHaveBeenCalled();
    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.log).not.toContain("dispose:rxjs");
    expect(harness.failures.at(-1)).toBe(
      "Could not load the effect core: chunk 404",
    );
    expect(harness.warnings).toEqual([
      "[core] could not load the effect core, staying on rxjs: chunk 404",
    ]);

    await harness.host.swapTo("async");

    expect(harness.failures.at(-1)).toBeNull();
    expect(harness.states.at(-1)).toEqual({ phase: "running", impl: "async" });
  });

  it("6. a throwing createApp recomposes the previous core and reports why; the saved choice is untouched", async () => {
    const harness = createHarness();
    harness.start();
    harness.cores.effect.createError = new Error("effect broke");
    harness.log.length = 0;

    await harness.host.swapTo("effect");

    expect(harness.log).toEqual([
      "cover",
      "load",
      "unmount",
      "macrotask",
      "dispose:rxjs",
      "endComposition",
      "createApp:effect",
      "endComposition",
      "createApp:rxjs",
      "mount:2",
      "publish:rxjs",
      "lift",
    ]);
    expect(harness.mounted.at(-1)?.impl).toBe("rxjs");
    expect(harness.mounted.at(-1)?.coreSelection.current).toBe("rxjs");
    expect(harness.failures.at(-1)).toBe(
      "The effect core failed to start: effect broke",
    );
    expect(harness.warnings).toEqual([
      "[core] the effect core failed to start, back on rxjs: effect broke",
    ]);
    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.states.at(-1)).toEqual({ phase: "running", impl: "rxjs" });
    expect(harness.infos).toEqual([]);
  });

  it("7. when both compositions throw, onFatal is called once with the second error and nothing is mounted", async () => {
    const harness = createHarness();
    harness.start();
    const second = new Error("rxjs broke too");
    harness.cores.effect.createError = new Error("effect broke");
    harness.cores.rxjs.createError = second;

    await harness.host.swapTo("effect");

    expect(harness.onFatal).toHaveBeenCalledTimes(1);
    expect(harness.onFatal).toHaveBeenCalledWith(second);
    expect(harness.mounted).toHaveLength(1);
    expect(harness.publish).toHaveBeenCalledTimes(1);
    expect(harness.persist).not.toHaveBeenCalled();
  });

  it("8. a rejected old.dispose() is logged as a warning and the swap completes", async () => {
    const harness = createHarness();
    harness.start();
    harness.cores.rxjs.disposeError = new Error("stuck fiber");

    await harness.host.swapTo("effect");

    expect(harness.warnings).toEqual([
      "[core] the rxjs core failed to dispose: stuck fiber",
    ]);
    expect(harness.mounted.at(-1)?.impl).toBe("effect");
    expect(harness.states.at(-1)).toEqual({ phase: "running", impl: "effect" });
  });

  it("9. an unsaved choice is a warning; the swap stands", async () => {
    const harness = createHarness({ persisted: false });
    harness.start();

    await harness.host.swapTo("effect");

    expect(harness.warnings).toEqual([
      "[core] the choice of effect was not saved; it will not survive a reload",
    ]);
    expect(harness.mounted.at(-1)?.impl).toBe("effect");
    expect(harness.publish).toHaveBeenLastCalledWith("effect");
    expect(harness.stripCoreParam).toHaveBeenCalledTimes(1);
    expect(harness.states.at(-1)).toEqual({ phase: "running", impl: "effect" });
  });

  it("10. the splash plays for the first composition only", async () => {
    const harness = createHarness({ splash: true });
    harness.start();

    await harness.host.swapTo("effect");

    expect(harness.cores.rxjs.splashDecisions).toEqual([true]);
    expect(harness.cores.effect.splashDecisions).toEqual([false]);
  });

  it("11. takePreferencesReopen() is true exactly once, and only on a composition a swap produced", async () => {
    const harness = createHarness();
    harness.start();
    const [boot] = harness.mounted;

    expect(boot?.takePreferencesReopen()).toBe(false);

    await harness.host.swapTo("effect");
    const swapped = harness.mounted.at(-1);

    expect(swapped?.takePreferencesReopen()).toBe(true);
    expect(swapped?.takePreferencesReopen()).toBe(false);

    harness.cores.async.createError = new Error("async broke");
    await harness.host.swapTo("async");
    const recomposed = harness.mounted.at(-1);

    expect(recomposed?.impl).toBe("effect");
    expect(recomposed?.takePreferencesReopen()).toBe(true);
  });

  it("12. state$ walks the phases, and the hold is measured from the end of covering", async () => {
    vi.useFakeTimers();

    expect(await walkPhases(800)).toEqual([
      "running@0",
      "covering@0",
      "loading@160",
      "handover@960",
      "revealing@960",
      "running@1160",
    ]);
    expect(await walkPhases(0)).toEqual([
      "running@0",
      "covering@0",
      "loading@160",
      "handover@160",
      "revealing@660",
      "running@860",
    ]);
  });

  it("13. the console line names both cores", async () => {
    const harness = createHarness();
    harness.start();

    await harness.host.swapTo("effect");

    expect(harness.infos).toEqual(["[core] swapped rxjs to effect"]);
  });
});

interface FakeCore {
  readonly core: CoreFactory;
  /** Each `ports` argument `createApp` received, in order. */
  readonly received: AppPorts[];
  /** Each `bootSplash.shouldPlay()` answer, one per successful `createApp`. */
  readonly splashDecisions: boolean[];
  /** When set, every later `createApp` throws it. */
  createError: Error | null;
  /** When set, every later `dispose()` rejects with it. */
  disposeError: Error | null;
}

interface HarnessOptions {
  readonly persisted?: boolean;
  readonly splash?: boolean;
  /** When set, the fakes wait on timers (case 12 runs them on vitest's fake
   * timers): every `sleep` waits its `ms`, and `load` resolves after this
   * many ms. Unset, every wait resolves at once. */
  readonly timed?: number;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

interface Harness {
  readonly host: CoreHost;
  /** `host.start()`, then a watch on the boot composition's `failure$`
   * (reachable only through a mounted composition). */
  readonly start: () => void;
  readonly log: string[];
  readonly cores: Record<CoreImpl, FakeCore>;
  /** Overrides `load`'s answer per impl; absent means the fake core. */
  readonly loadResults: Partial<Record<CoreImpl, Promise<CoreFactory>>>;
  readonly mounted: Composition[];
  readonly states: CoreHostState[];
  readonly failures: (string | null)[];
  readonly warnings: string[];
  readonly infos: string[];
  readonly load: Mock<(impl: CoreImpl) => Promise<CoreFactory>>;
  readonly unmount: Mock<() => void>;
  readonly publish: Mock<(impl: CoreImpl) => void>;
  readonly persist: Mock<(impl: CoreImpl) => boolean>;
  readonly stripCoreParam: Mock<() => void>;
  readonly onFatal: Mock<(error: unknown) => void>;
}

const COVER = { enterMs: 160, holdMs: 500, exitMs: 200 } as const;

/** Runs one rxjs → effect swap on fake timers with a load that takes
 * `loadMs`, returning each `state$` phase stamped with the fake clock. */
async function walkPhases(loadMs: number): Promise<string[]> {
  const start = Date.now();
  const stamped: string[] = [];
  const harness = createHarness({ timed: loadMs });
  harness.host.state$.subscribe((state) => {
    stamped.push(`${state.phase}@${Date.now() - start}`);
  });
  harness.start();

  const swap = harness.host.swapTo("effect");
  await vi.runAllTimersAsync();
  await swap;
  return stamped;
}

function createHarness(options: HarnessOptions = {}): Harness {
  const log: string[] = [];
  const cores: Record<CoreImpl, FakeCore> = {
    rxjs: createFakeCore("rxjs", log),
    async: createFakeCore("async", log),
    effect: createFakeCore("effect", log),
  };
  const loadResults: Partial<Record<CoreImpl, Promise<CoreFactory>>> = {};
  const mounted: Composition[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const timed = options.timed;

  const load = vi.fn((impl: CoreImpl): Promise<CoreFactory> => {
    log.push("load");
    const override = loadResults[impl];

    if (override !== undefined) {
      return override;
    }

    if (timed !== undefined) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(cores[impl].core);
        }, timed);
      });
    }

    return Promise.resolve(cores[impl].core);
  });

  const unmount = vi.fn((): void => {
    log.push("unmount");
  });

  const publish = vi.fn((impl: CoreImpl): void => {
    log.push(`publish:${impl}`);
  });

  const persist = vi.fn((impl: CoreImpl): boolean => {
    log.push(`persist:${impl}`);
    return options.persisted ?? true;
  });

  const stripCoreParam = vi.fn((): void => {
    log.push("stripCoreParam");
  });
  const onFatal = vi.fn((_error: unknown): void => {});

  const deps: CoreHostDeps = {
    ports: createFakePorts(options.splash),
    initial: { impl: "rxjs", core: cores.rxjs.core },
    load,
    instrument: (core: CoreFactory, app: App) => {
      return {
        presenters: app.presenters,
        machineFactories: core.createMachineFactories(app.presenters),
      };
    },
    endComposition: () => {
      log.push("endComposition");
    },
    mount: (composition: Composition): void => {
      log.push(`mount:${composition.generation}`);
      mounted.push(composition);
    },
    unmount,
    publish,
    persist,
    stripCoreParam,
    info: (message: string): void => {
      infos.push(message);
    },
    warn: (message: string): void => {
      warnings.push(message);
    },
    onFatal,
    cover: COVER,
    sleep: (ms: number): Promise<void> => {
      if (ms === COVER.enterMs) {
        log.push("cover");
      }

      if (ms === COVER.exitMs) {
        log.push("lift");
      }

      if (timed !== undefined) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
      }

      return Promise.resolve();
    },
    nextMacrotask: () => {
      log.push("macrotask");

      if (timed !== undefined) {
        return new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      }

      return Promise.resolve();
    },
  };

  const host = createCoreHost(deps);
  const states: CoreHostState[] = [];
  host.state$.subscribe((state) => {
    states.push(state);
  });
  const failures: (string | null)[] = [];

  return {
    host,
    start: () => {
      host.start();
      mounted[0]?.coreSelection.failure$.subscribe((failure) => {
        failures.push(failure);
      });
    },
    log,
    cores,
    loadResults,
    mounted,
    states,
    failures,
    warnings,
    infos,
    load,
    unmount,
    publish,
    persist,
    stripCoreParam,
    onFatal,
  };
}

function createFakeCore(impl: CoreImpl, log: string[]): FakeCore {
  const fake: FakeCore = {
    received: [],
    splashDecisions: [],
    createError: null,
    disposeError: null,
    core: {
      createApp: (ports: AppPorts): App => {
        log.push(`createApp:${impl}`);

        if (fake.createError !== null) {
          throw fake.createError;
        }

        fake.received.push(ports);
        fake.splashDecisions.push(ports.bootSplash?.shouldPlay() ?? true);
        return {
          presenters: {} as Presenters,
          ports,
          commands: {} as AppCommands,
          dispose: () => {
            log.push(`dispose:${impl}`);
            return fake.disposeError === null
              ? Promise.resolve()
              : Promise.reject(fake.disposeError);
          },
        };
      },
      createMachineFactories: () => {
        return {} as MachineFactories;
      },
    },
  };
  return fake;
}

function createFakePorts(splash: boolean | undefined): AppPorts {
  const ports = {} as AppPorts;

  if (splash === undefined) {
    return ports;
  }

  return {
    ...ports,
    bootSplash: {
      shouldPlay: () => {
        return splash;
      },
    },
  };
}

function createDeferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });

  return {
    promise,
    resolve: (value: T): void => {
      settle?.(value);
    },
  };
}

function isCreateApp(entry: string): boolean {
  return entry.startsWith("createApp:");
}
