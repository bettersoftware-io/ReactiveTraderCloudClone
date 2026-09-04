// packages/client-react-native/tests/pages/UseTickFlashPage.tsx
import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";

import { useTickFlash } from "#/ui/rates/useTickFlash";

interface ProbeProps {
  value: number;
  enabled: boolean;
}

export interface UseTickFlashPage {
  mount(value: number, enabled: boolean): Promise<void>;
  rerender(value: number, enabled: boolean): Promise<void>;
  hasText(text: string): boolean;
}

/** The framework surface for `useTickFlash.test.tsx`. Named `tickFlashPage`
 * (not `useTickFlashPage`) despite the interface's `Use*` name — a
 * `use`-prefixed factory reads as a hook to `react-hooks/rules-of-hooks`,
 * which then rejects the spec's own top-level `const page =
 * tickFlashPage();` call as a hook invoked outside a component. */
export function tickFlashPage(): UseTickFlashPage {
  // Declared ONCE inside the factory body (not module scope, and not
  // redeclared per call) so the file has no unexported top-level component —
  // mirrors `UseRowInsertFlashPage`'s identical shape and satisfies Biome's
  // `useComponentExportOnlyModules`. A fresh function identity on every
  // `probeTree()` call would make React treat each rerender as a full
  // remount rather than a true rerender of the same component.
  function Probe({ value, enabled }: ProbeProps): React.JSX.Element {
    const { flashStyle } = useTickFlash(value, enabled);
    return (
      <Animated.View style={flashStyle}>
        <Text>flash</Text>
      </Animated.View>
    );
  }

  function probeTree({ value, enabled }: ProbeProps): ReactElement {
    return <Probe value={value} enabled={enabled} />;
  }

  let rerenderFn: ((el: ReactElement) => Promise<void>) | undefined;

  return {
    async mount(value: number, enabled: boolean): Promise<void> {
      const result = await render(probeTree({ value, enabled }));
      rerenderFn = result.rerender;
    },
    async rerender(value: number, enabled: boolean): Promise<void> {
      if (!rerenderFn) {
        throw new Error("mount() must be called before rerender()");
      }

      await rerenderFn(probeTree({ value, enabled }));
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
  };
}
