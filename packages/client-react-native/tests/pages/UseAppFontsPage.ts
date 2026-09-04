// packages/client-react-native/tests/pages/UseAppFontsPage.ts
import { renderHook } from "@testing-library/react-native";

import { useAppFonts } from "#/ui/theme/fonts";

interface HookResultBox<T> {
  current: T;
}

export interface UseAppFontsPage {
  mount(): Promise<void>;
  readonly value: boolean;
}

/** The framework surface for `fonts.test.tsx`. Named `appFontsPage` (not
 * `useAppFontsPage`) despite the interface's `Use*` name — a `use`-prefixed
 * factory reads as a hook to `react-hooks/rules-of-hooks`, which then
 * rejects the spec's own top-level `const page = appFontsPage();` call as a
 * hook invoked outside a component. */
export function appFontsPage(): UseAppFontsPage {
  let result: HookResultBox<boolean> | null = null;

  return {
    async mount(): Promise<void> {
      // A locally-declared, `use`-prefixed function reference (not an
      // inline arrow) — Biome's `useHookAtTopLevel` recognizes the hook
      // call only when `renderHook` is handed a named hook-shaped function
      // by reference, matching the exact `renderHook(useProbe)` shape (C1's
      // `UseGyroDriftPage` precedent).
      function useProbe(): boolean {
        return useAppFonts();
      }

      const rendered = await renderHook(useProbe);
      result = rendered.result;
    },
    get value(): boolean {
      if (!result) {
        throw new Error("mount() must be called before reading value");
      }

      return result.current;
    },
  };
}
