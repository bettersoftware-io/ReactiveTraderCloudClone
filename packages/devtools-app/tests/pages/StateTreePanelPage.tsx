import { cleanup, render, screen } from "@testing-library/react";

import type { StateTreePanelProps } from "#/panels/StateTreePanel";
import { StateTreePanel } from "#/panels/StateTreePanel";

export interface StateTreePanelPage {
  mountStateTreePanel(props: StateTreePanelProps): void;
  rerenderWith(props: StateTreePanelProps): void;
  unmountAll(): void;
  hasText(text: string): boolean;
}

/** The framework surface shared by `StateTreePanel.test.tsx` and
 * `panels/__tests__/flash.test.tsx` — both mount `StateTreePanel`. */
export function stateTreePanelPage(): StateTreePanelPage {
  let lastRerender: ((props: StateTreePanelProps) => void) | null = null;

  return {
    mountStateTreePanel(props: StateTreePanelProps): void {
      const { rerender } = render(<StateTreePanel {...props} />);

      lastRerender = (next: StateTreePanelProps): void => {
        rerender(<StateTreePanel {...next} />);
      };
    },
    rerenderWith(props: StateTreePanelProps): void {
      if (lastRerender === null) {
        throw new Error(
          "mountStateTreePanel must be called before rerenderWith",
        );
      }

      lastRerender(props);
    },
    unmountAll(): void {
      cleanup();
      lastRerender = null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
  };
}
