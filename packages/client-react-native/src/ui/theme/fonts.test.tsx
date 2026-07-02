import { expect, test } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";

import { useAppFonts } from "#/ui/theme/fonts";

test("reports a boolean load state for the bundled fonts", async () => {
  // @testing-library/react-native's `renderHook` is async (returns a
  // Promise<RenderHookResult>), unlike the React DOM Testing Library.
  const { result } = await renderHook(() => {
    return useAppFonts();
  });
  expect(typeof result.current).toBe("boolean");
});
