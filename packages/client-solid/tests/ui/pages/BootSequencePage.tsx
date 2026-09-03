import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

interface BootSequenceHandle {
  unmount(): void;
}

export interface BootSequencePage {
  /** Mounts the given element builder — the spec composes its own
   * `<ViewModelContext.Provider>` + `<BootSequence>` JSX (kept spec-side —
   * moving it page-side would obscure which ViewModel double each test
   * mounts under), so this page owns only the render/unmount mechanics. */
  mount(element: () => JSX.Element): BootSequenceHandle;
  hasText(pattern: RegExp): boolean;
  onlineAttrOfText(pattern: RegExp): string | null;
}

/** The framework surface for `BootSequence.test.tsx`. */
export function bootSequencePage(): BootSequencePage {
  return {
    mount(element: () => JSX.Element): BootSequenceHandle {
      const { unmount } = render(element);

      return { unmount };
    },
    hasText(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    onlineAttrOfText(pattern: RegExp): string | null {
      return screen.getByText(pattern).getAttribute("data-online");
    },
  };
}
