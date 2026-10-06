import { createRoot, type JSX } from "solid-js";
import { insert } from "solid-js/web";

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

/** The disposer of the reactive root a mount is building, captured as soon
 * as the root exists so a failed render can still be torn down. */
interface BuiltRoot {
  dispose: (() => void) | null;
}

/**
 * Creates the mount `main.tsx` renders every composition into.
 *
 * It does what `solid-js/web`'s `render` does — a reactive root that inserts
 * the tree into the container — except on failure: `render` returns its
 * disposer only on success, so a tree that throws while rendering leaves its
 * partly built root (and any subscription it opened on the new core's
 * presenters) alive. Here the disposer is captured first and called before
 * the error is rethrown.
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
      const built: BuiltRoot = { dispose: null };

      try {
        createRoot((dispose) => {
          built.dispose = dispose;
          insert(rootEl, tree());
        });
      } catch (error) {
        built.dispose?.();
        rootEl.textContent = "";
        throw error;
      }

      disposeTree = built.dispose;
    },
    unmount,
    destroy: unmount,
  };
}
