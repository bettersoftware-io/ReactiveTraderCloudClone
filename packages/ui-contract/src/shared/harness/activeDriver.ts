import type { BehaviorSubject } from "rxjs";

import type { ComponentToken, MountedComponent } from "./component";
import type { World } from "./world";

interface RenderInputs<P> {
  /** Reactive props source; the driver renders the component from its latest value. */
  readonly propsSubject: BehaviorSubject<Partial<P>>;
  /** The controllable hook world; the driver turns it into reactive ViewModel. */
  readonly world: World;
}

export interface MountedRoot {
  readonly root: HTMLElement;
  readonly unmount: () => void;
  /**
   * Optional hook provided by the framework driver to flush pending re-renders
   * after a synchronous state mutation (e.g. BehaviorSubject.next()). The React
   * driver wraps mutations with `act()`; other drivers leave this undefined.
   */
  readonly flushSync?: (fn: () => void) => void;
  /**
   * Async counterpart to flushSync: runs an async mutation (e.g. resolving
   * promises whose .then() chains apply buffered state) and flushes the
   * re-renders it triggers before resolving. The React driver wraps it with
   * `act(async …)`; other drivers leave this undefined and the harness simply
   * awaits the fn.
   */
  readonly flushAsync?: (fn: () => Promise<void>) => Promise<void>;
}

/** A framework adapter that knows how to render a token into the DOM. */
export interface UiContractDriver {
  render<P, Page extends MountedComponent<P>>(
    token: ComponentToken<P, Page>,
    inputs: RenderInputs<P>,
  ): MountedRoot;
}

let active: UiContractDriver | null = null;

export function setDriver(driver: UiContractDriver): void {
  active = driver;
}

export function getDriver(): UiContractDriver {
  if (!active) {
    throw new Error(
      "No ui-contract test driver registered. Ensure the tier's setupFiles entry " +
        "(tests/ui/contract/react/setup.ts) ran before the spec.",
    );
  }

  return active;
}
