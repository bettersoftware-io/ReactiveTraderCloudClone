import type { BehaviorSubject } from "rxjs";
import type { World } from "./world";
import type { ComponentToken, MountedComponent } from "./component";

export interface RenderInputs<P> {
  /** Reactive props source; the driver renders the component from its latest value. */
  readonly propsSubject: BehaviorSubject<Partial<P>>;
  /** The controllable hook world; the driver turns it into reactive AppHooks. */
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
}

/** A framework adapter that knows how to render a token into the DOM. */
export interface BehaviourDriver {
  render<P, Page extends MountedComponent<P>>(
    token: ComponentToken<P, Page>,
    inputs: RenderInputs<P>,
  ): MountedRoot;
}

let active: BehaviourDriver | null = null;

export function setDriver(driver: BehaviourDriver): void {
  active = driver;
}

export function getDriver(): BehaviourDriver {
  if (!active) {
    throw new Error(
      "No behaviour-test driver registered. Ensure the tier's setupFiles entry " +
        "(tests/behaviour/react/setup.ts) ran before the spec.",
    );
  }
  return active;
}
