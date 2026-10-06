import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

/** The core host's `mount` / `unmount` pair over one React root, plus the
 * root's own teardown for a fatal swap. */
export interface ReactTreeMount {
  /** Synchronous: the tree is in the DOM when it returns. Throws the error
   * of a tree that fails its first render, leaving the container empty. */
  mount(tree: ReactNode): void;
  /** Synchronous: the tree is gone when it returns. */
  unmount(): void;
  /** Unmounts the root for good; the mount is unusable afterwards. */
  destroy(): void;
}

/** An error React reported while `mount` was flushing. Boxed, so a thrown
 * `undefined` still counts as a failure. */
interface MountFailure {
  readonly error: unknown;
}

/**
 * Creates the React root `main.tsx` mounts every composition into.
 *
 * React 19 does not rethrow an uncaught render error from `root.render` or
 * `flushSync`: it hands the error to the root's `onUncaughtError` (by default
 * `reportError`) and leaves the container empty. The core host's `mount`
 * contract is "the tree is in the DOM when it returns", so an error raised
 * while `mount` is flushing is captured and rethrown, and the host's failure
 * handling (`onFatal`, or `runBoot`'s `onError` for the first composition)
 * takes over. An uncaught error at any other time — a mounted tree failing
 * later — goes to `reportUncaught`, React's own default.
 */
export function createReactTreeMount(
  rootEl: HTMLElement,
  reportUncaught: (error: unknown) => void = reportError,
): ReactTreeMount {
  let mounting = false;
  let mountFailure: MountFailure | null = null;

  const root = createRoot(rootEl, {
    onUncaughtError: (error: unknown): void => {
      if (mounting) {
        mountFailure = { error };
        return;
      }

      reportUncaught(error);
    },
  });

  function renderNow(tree: ReactNode): void {
    flushSync(() => {
      root.render(tree);
    });
  }

  return {
    mount: (tree: ReactNode): void => {
      mounting = true;
      mountFailure = null;

      try {
        renderNow(tree);
      } finally {
        mounting = false;
      }

      const failure = mountFailure as MountFailure | null;

      if (failure !== null) {
        renderNow(null);
        throw failure.error;
      }
    },
    unmount: (): void => {
      renderNow(null);
    },
    destroy: (): void => {
      root.unmount();
    },
  };
}
