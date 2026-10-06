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
  createCoreHost,
  runBoot,
} from "@rtc/web-boot";

import { createReactTreeMount } from "#/app/reactTreeMount";
import { reactTreeMountPage } from "#tests/ui/pages/ReactTreeMountPage";

import { Boom } from "./Boom";
import { BoomOnClick } from "./BoomOnClick";

afterEach(() => {
  page.removeContainers();
});

// React 19 does not rethrow an uncaught render error from `root.render` or
// `flushSync`: it reports it and leaves the container empty. The core host's
// `mount` contract is "the tree is in the DOM when it returns", so a tree
// that fails its first render must make `mount` THROW — otherwise a swap onto
// a core whose UI cannot render is published as a success.
describe("createReactTreeMount", () => {
  it("throws from mount when the first render fails, leaving the container empty", () => {
    const rootEl = page.createContainer();
    const tree = createReactTreeMount(rootEl, vi.fn());

    expect(() => {
      tree.mount(<Boom />);
    }).toThrow("boom");
    expect(page.isEmpty(rootEl)).toBe(true);
  });

  it("mounts a tree that renders, and unmounts it", () => {
    const rootEl = page.createContainer();
    const tree = createReactTreeMount(rootEl, vi.fn());

    tree.mount(<div data-testid="ok" />);
    expect(page.shows(rootEl, "ok")).toBe(true);

    tree.unmount();
    expect(page.isEmpty(rootEl)).toBe(true);
  });

  it("still reports an error a mounted tree throws later, outside a mount", () => {
    const rootEl = page.createContainer();
    const report = vi.fn();
    const tree = createReactTreeMount(rootEl, report);
    tree.mount(<BoomOnClick />);

    page.clickButtonIn(rootEl);

    expect(report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "boom later" }),
    );
  });
});

describe("the core host over the React tree mount", () => {
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

const page = reactTreeMountPage();

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

/** A host over fake cores whose mount is the real React tree mount, rendering
 * a tree that throws for the effect core — as `main.tsx` would render an
 * `AppRoot` whose UI fails on the new core. */
function createHostHarness(initial: CoreImpl = "rxjs"): HostHarness {
  const disposed: CoreImpl[] = [];
  const cores = {
    rxjs: createFakeCore("rxjs", disposed),
    async: createFakeCore("async", disposed),
    effect: createFakeCore("effect", disposed),
  };
  const tree = createReactTreeMount(page.createContainer(), vi.fn());
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
      tree.mount(
        composition.impl === "effect" ? <Boom /> : <div data-testid="ok" />,
      );
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
