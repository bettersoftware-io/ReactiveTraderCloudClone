import { type JSX, render } from "@solidjs/web";

/** The core host's `mount` / `unmount` pair over one container, plus the
 * teardown for a fatal swap — the Solid twin of client-react's
 * `reactTreeMount.ts`. */
export interface SolidTreeMount {
  /** Synchronous: the tree is in the DOM when it returns. Throws the error
   * of a tree that fails its first render, after disposing whatever it
   * created and emptying the container. */
  mount(tree: () => JSX.Element): void;
  /** Synchronous: the tree is disposed and gone when it returns. */
  unmount(): void;
  /** The same as `unmount`: a Solid container holds no root of its own. */
  destroy(): void;
}

/**
 * Creates the mount the client's view renders every composition into.
 *
 * Solid 2's `render` is all a mount needs: it registers the container for
 * Solid's delegated events, flushes, so the tree is in the DOM when it
 * returns, and — unlike Solid 1's, which handed its disposer back only on
 * success — disposes the partly built root of a tree that throws while
 * rendering (and any subscription it opened on the new core's presenters)
 * before rethrowing. The mount only empties the container on that path too.
 */
export function createSolidTreeMount(rootEl: HTMLElement): SolidTreeMount {
  let disposeTree: (() => void) | null = null;

  function unmount(): void {
    const dispose = disposeTree;
    disposeTree = null;
    dispose?.();
    rootEl.textContent = "";
  }

  return {
    mount: (tree: () => JSX.Element): void => {
      try {
        disposeTree = render(tree, rootEl);
      } catch (error) {
        rootEl.textContent = "";
        throw error;
      }
    },
    unmount,
    destroy: unmount,
  };
}
