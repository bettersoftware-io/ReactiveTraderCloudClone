// packages/client-react-native/tests/pages/UseBootSceneFontsPage.ts
import { renderHook } from "@testing-library/react-native";

import {
  type BootFontSpec,
  useBootSceneFonts,
} from "#/ui/shell/boot/scenes/bootSceneFonts";

interface RecordingFont {
  __typeface: { source: unknown } | undefined;
  __size: number | undefined;
}

export interface UseBootSceneFontsPage {
  /** Renders the hook once against `specs` and returns its built fonts (or
   * `null`, while the underlying faces are still loading). */
  fontsFor<Spec extends Record<string, BootFontSpec>>(
    specs: Spec,
  ): Promise<Record<keyof Spec, RecordingFont> | null>;
}

/** The framework surface for `bootSceneFonts.test.tsx`. */
export function useBootSceneFontsPage(): UseBootSceneFontsPage {
  return {
    async fontsFor<Spec extends Record<string, BootFontSpec>>(
      specs: Spec,
    ): Promise<Record<keyof Spec, RecordingFont> | null> {
      // A locally-declared, `use`-prefixed function reference (not an
      // inline arrow) — Biome's `useHookAtTopLevel` recognizes the hook
      // call only when `renderHook` is handed a named hook-shaped function
      // by reference, matching the exact `renderHook(useProbe)` shape.
      function useProbe(): ReturnType<typeof useBootSceneFonts<Spec>> {
        return useBootSceneFonts(specs);
      }

      // `renderHook` is async in @testing-library/react-native, unlike the
      // DOM Testing Library's.
      const { result } = await renderHook(useProbe);
      return result.current as unknown as Record<
        keyof Spec,
        RecordingFont
      > | null;
    },
  };
}
