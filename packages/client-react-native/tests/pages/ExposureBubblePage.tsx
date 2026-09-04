// packages/client-react-native/tests/pages/ExposureBubblePage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

/** The shape of a rendered node this walk cares about. Declared structurally
 * rather than imported from `react-test-renderer`, which ships no types here
 * and is not a direct dependency. */
interface RenderedNode {
  readonly type?: unknown;
  readonly children?: readonly unknown[] | null;
}

function countIn(node: unknown, type: string): number {
  if (node === null || typeof node !== "object") {
    return 0;
  }

  if (Array.isArray(node)) {
    return node.reduce<number>((total, child) => {
      return total + countIn(child, type);
    }, 0);
  }

  const { type: nodeType, children } = node as RenderedNode;

  return (children ?? []).reduce<number>(
    (total, child) => {
      return total + countIn(child, type);
    },
    nodeType === type ? 1 : 0,
  );
}

export interface ExposureBubblePage {
  /** Takes the caller-composed element rather than `ExposureBubble`'s own
   * props — the spec's own `bubble(overrides)` builder stays spec-side
   * (mirrors Wave A/C1's element-taking pages, e.g. `BootCanvasPage`). */
  mount(element: ReactElement): Promise<void>;
  unmountAll(): Promise<void>;
  /** How many host elements of `type` the rendered tree contains. A bubble is
   * pure Skia, so no part of it carries a `testID` to query — the jest mock
   * renders each Skia primitive as a host element named after it, and
   * counting those is the only real assertion this spec can make about which
   * layers were drawn. */
  countHosts(type: string): number;
}

/** The framework surface for `ExposureBubble.test.tsx`. */
export function exposureBubblePage(): ExposureBubblePage {
  return {
    async mount(element: ReactElement): Promise<void> {
      await renderWithTheme(element);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    countHosts(type: string): number {
      return countIn(screen.toJSON(), type);
    },
  };
}
