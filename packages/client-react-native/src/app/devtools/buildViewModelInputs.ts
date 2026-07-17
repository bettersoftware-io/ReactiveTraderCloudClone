import {
  createMachineFactories,
  type MachineFactories,
  type Presenters,
} from "@rtc/client-core";
import {
  type DevtoolsHub,
  instrumentMachineFactories,
  instrumentPresenters,
  type PresenterManifest,
} from "@rtc/devtools-core";

export interface NativeDevtools {
  hub: DevtoolsHub;
  manifest: PresenterManifest;
}

export interface ViewModelInputs {
  presenters: Presenters;
  factories: MachineFactories;
}

/** Applies the same presenter/machine decorators client-react applies at its
 * composition root — but only when `devtools` is provided (dev builds). Returns
 * the (possibly instrumented) presenters and the machine factories to feed
 * `createViewModel`. When `devtools` is null (production), it returns the
 * presenters untouched and plain factories — zero devtools cost, matching how a
 * production RN build ships dormant. Pure and socket-free, so it is unit-tested
 * directly with an in-memory-transport hub. */
export function buildViewModelInputs(
  presenters: Presenters,
  devtools: NativeDevtools | null,
): ViewModelInputs {
  if (!devtools) {
    return {
      presenters,
      factories: createMachineFactories(presenters),
    };
  }

  const instrumented = instrumentPresenters(
    presenters,
    devtools.manifest,
    devtools.hub,
  );

  return {
    presenters: instrumented,
    factories: instrumentMachineFactories(
      createMachineFactories(instrumented),
      devtools.hub,
    ),
  };
}
