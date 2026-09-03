import { cleanup, render, screen } from "@testing-library/react";

import type { DiffEntry } from "@rtc/devtools-core";

import { DiffView } from "#/timeline/DiffView";

interface DiffViewProps {
  entries: DiffEntry[];
  noPrior: boolean;
}

export interface DiffViewPage {
  mountDiffView(props: DiffViewProps): void;
  rerenderWith(props: DiffViewProps): void;
  unmountAll(): void;
  hasText(text: string): boolean;
  textCount(text: string): number;
}

/** The framework surface for `DiffView.test.tsx`. */
export function diffViewPage(): DiffViewPage {
  let lastRerender: ((props: DiffViewProps) => void) | null = null;

  return {
    mountDiffView(props: DiffViewProps): void {
      const { rerender } = render(<DiffView {...props} />);

      lastRerender = (next: DiffViewProps): void => {
        rerender(<DiffView {...next} />);
      };
    },
    rerenderWith(props: DiffViewProps): void {
      if (lastRerender === null) {
        throw new Error("mountDiffView must be called before rerenderWith");
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
    textCount(text: string): number {
      return screen.queryAllByText(text).length;
    },
  };
}
