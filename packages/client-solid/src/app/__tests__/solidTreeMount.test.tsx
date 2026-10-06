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

import { runBoot } from "#/app/bootApp";
import {
  type Composition,
  type CoreHost,
  createCoreHost,
} from "#/app/coreHost";
import { createSolidTreeMount } from "#/app/solidTreeMount";
import { solidTreeMountPage } from "#tests/ui/pages/SolidTreeMountPage";

import { Boom } from "./Boom";
import { CleanupProbe } from "./CleanupProbe";

afterEach(() => {
  page.removeContainers();
});

// Solid's `render` throws a render error, but the reactive root it was
// building is never disposed: `render` hands its disposer back only on
// success. The tree mount must dispose whatever the failed mount created
// (subscriptions on the new core's presenters included) before rethrowing.
describe("createSolidTreeMount", () => {
  it("disposes what a failed first render created, then throws, leaving the container empty", () => {
    const rootEl = page.createContainer();
    const cleaned: string[] = [];
    const tree = createSolidTreeMount(rootEl);

    expect(() => {
      tree.mount(() => {
        return (
          <>
            <CleanupProbe cleaned={cleaned} />
            <Boom />
          </>
        );
      });
    }).toThrow("boom");
    expect(cleaned).toEqual(["probe"]);
    expect(page.isEmpty(rootEl)).toBe(true);
  });

  it("mounts a tree that renders, and unmounts it (disposing it)", () => {
    const rootEl = page.createContainer();
    const cleaned: string[] = [];
    const tree = createSolidTreeMount(rootEl);

    tree.mount(() => {
      return <CleanupProbe cleaned={cleaned} />;
    });
    expect(page.shows(rootEl, "probe")).toBe(true);

    tree.unmount();
    expect(cleaned).toEqual(["probe"]);
    expect(page.isEmpty(rootEl)).toBe(true);
  });
});

describe("the core host over the Solid tree mount", () => {
  it("a swap whose UI fails its first render ends in onFatal: nothing published, logged as swapped or saved", async () => {
    const harness = createHostHarness();
    harness.host.start();

    await harness.host.swapTo("effect");

    expect(harness.onFatal).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "boom" }),
    );
    expect(harness.publish.mock.calls).toEqual([["rxjs"]]);
    expect(harness.info).not.toHaveBeenCalled();
    expect(harness.persist).not.toHaveBeenCalled();
  });

  it("a first composition whose UI fails its first render reaches runBoot's onError, and its app is disposed", async () => {
    const harness = createHostHarness("effect");
    const onError = vi.fn();

    await runBoot(
      Promise.resolve({
        impl: "effect" as const,
        core: harness.cores.effect,
        source: "url" as const,
      }),
      () => {
        harness.host.start();
      },
      onError,
    );

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "boom" }),
    );
    expect(harness.publish).not.toHaveBeenCalled();
    expect(harness.disposed).toEqual(["effect"]);
  });
});

const page = solidTreeMountPage();

interface HostHarness {
  readonly host: CoreHost;
  readonly cores: Record<CoreImpl, CoreFactory>;
  readonly publish: Mock<(impl: CoreImpl) => void>;
  readonly persist: Mock<(impl: CoreImpl) => boolean>;
  readonly info: Mock<(message: string) => void>;
  readonly onFatal: Mock<(error: unknown) => void>;
  /** The core of each app whose `dispose()` ran, in order. */
  readonly disposed: CoreImpl[];
}

/** A host over fake cores whose mount is the real Solid tree mount, rendering
 * a tree that throws for the effect core — as `main.tsx` would render an
 * `AppRoot` whose UI fails on the new core. */
function createHostHarness(initial: CoreImpl = "rxjs"): HostHarness {
  const disposed: CoreImpl[] = [];
  const cores = {
    rxjs: createFakeCore("rxjs", disposed),
    async: createFakeCore("async", disposed),
    effect: createFakeCore("effect", disposed),
  };
  const tree = createSolidTreeMount(page.createContainer());
  const publish = vi.fn<(impl: CoreImpl) => void>();
  const persist = vi.fn<(impl: CoreImpl) => boolean>(() => {
    return true;
  });
  const info = vi.fn<(message: string) => void>();
  const onFatal = vi.fn<(error: unknown) => void>();

  const host = createCoreHost({
    ports: {} as AppPorts,
    initial: { impl: initial, core: cores[initial] },
    load: (impl: CoreImpl): Promise<CoreFactory> => {
      return Promise.resolve(cores[impl]);
    },
    instrument: (_core: CoreFactory, app: App) => {
      return {
        presenters: app.presenters,
        machineFactories: {} as MachineFactories,
      };
    },
    endComposition: vi.fn(),
    mount: (composition: Composition): void => {
      tree.mount(() => {
        return composition.impl === "effect" ? (
          <Boom />
        ) : (
          <div data-testid="ok" />
        );
      });
    },
    unmount: tree.unmount,
    publish,
    persist,
    stripCoreParam: vi.fn(),
    info,
    warn: vi.fn(),
    onFatal,
    cover: () => {
      return { enterMs: 0, holdMs: 0, exitMs: 0 };
    },
    sleep: (): Promise<void> => {
      return Promise.resolve();
    },
    nextMacrotask: (): Promise<void> => {
      return Promise.resolve();
    },
    // Never expires: every fake here settles at once.
    startTimer: (): (() => void) => {
      return (): void => {};
    },
  });

  return { host, cores, publish, persist, info, onFatal, disposed };
}

function createFakeCore(impl: CoreImpl, disposed: CoreImpl[]): CoreFactory {
  return {
    createApp: (ports: AppPorts): App => {
      return {
        presenters: {} as Presenters,
        ports,
        commands: {} as AppCommands,
        dispose: (): Promise<void> => {
          disposed.push(impl);
          return Promise.resolve();
        },
      };
    },
    createMachineFactories: (): MachineFactories => {
      return {} as MachineFactories;
    },
  };
}
