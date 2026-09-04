// packages/client-react-native/tests/pages/UseRowInsertFlashPage.tsx
import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";

import { useRowInsertFlash } from "#/ui/blotter/useRowInsertFlash";

interface ProbeProps {
  isNew: boolean;
  enabled: boolean;
}

export interface UseRowInsertFlashPage {
  mount(isNew: boolean, enabled: boolean): Promise<void>;
  rerender(isNew: boolean, enabled: boolean): Promise<void>;
  hasText(text: string): boolean;
}

/** The framework surface for `useRowInsertFlash.test.tsx`. Reanimated is
 * globally jest-mocked, so this can only assert mount/transition survival
 * and that a style is returned — it cannot assert timing. Named
 * `rowInsertFlashPage` (not `useRowInsertFlashPage`) despite the interface's
 * `Use*` name — a `use`-prefixed factory reads as a hook to
 * `react-hooks/rules-of-hooks`, which then rejects the spec's own top-level
 * `const page = rowInsertFlashPage();` call as a hook invoked outside a
 * component. */
export function rowInsertFlashPage(): UseRowInsertFlashPage {
  // Declared ONCE inside the factory body (not module scope, and not
  // redeclared per call) so the file has no unexported top-level component —
  // mirrors the base spec's own nested `Probe` and satisfies Biome's
  // `useComponentExportOnlyModules`. A fresh function identity on every
  // `probeTree()` call would make React treat each rerender as a full
  // remount rather than a true rerender of the same component, defeating the
  // point of `rerender()`'s isNew/enabled transitions — so `Probe` is
  // declared exactly once and `probeTree` only varies its props.
  function Probe({ isNew, enabled }: ProbeProps): React.JSX.Element {
    const { flashStyle } = useRowInsertFlash(
      isNew,
      "#22c55e",
      "#00060a",
      enabled,
    );
    return (
      <Animated.View style={flashStyle}>
        <Text>row</Text>
      </Animated.View>
    );
  }

  function probeTree({ isNew, enabled }: ProbeProps): ReactElement {
    return <Probe isNew={isNew} enabled={enabled} />;
  }

  let rerenderFn: ((el: ReactElement) => Promise<void>) | undefined;

  return {
    async mount(isNew: boolean, enabled: boolean): Promise<void> {
      const result = await render(probeTree({ isNew, enabled }));
      rerenderFn = result.rerender;
    },
    async rerender(isNew: boolean, enabled: boolean): Promise<void> {
      if (!rerenderFn) {
        throw new Error("mount() must be called before rerender()");
      }

      await rerenderFn(probeTree({ isNew, enabled }));
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
  };
}
