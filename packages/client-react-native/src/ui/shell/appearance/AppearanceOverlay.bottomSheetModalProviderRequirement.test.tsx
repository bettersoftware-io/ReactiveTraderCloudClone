// packages/client-react-native/src/ui/shell/appearance/AppearanceOverlay.bottomSheetModalProviderRequirement.test.tsx
//
// AppearanceOverlay.test.tsx (and every other jest-tier test that mounts a
// BottomSheetModal) runs against the package-wide test double at
// `__mocks__/@gorhom/bottom-sheet.tsx` — a context-free `View` stand-in. That
// double is exactly why the Critical bug this file proves went unnoticed:
// jest's own suite was green while `tests/visual/scenarios.tsx`'s
// `shell/appearance` scenario would redbox on the real component, because it
// mounts `AppearanceOverlay` (a `BottomSheetModal`) with no
// `BottomSheetModalProvider` ancestor anywhere above it.
//
// This file exercises the REAL `BottomSheetModal` / `BottomSheetModalProvider`
// (via `jest.requireActual`), proving the mechanism the fix in
// `tests/visual/scenarios.tsx` relies on: absent a provider, the real
// component throws; wrapped in one, it does not. A full end-to-end render of
// the actual `shell/appearance` scenario against the real module was also
// tried while building this fix and rejected — see the second test below.
import { expect, jest, test } from "@jest/globals";
import { Text } from "react-native";

import { bottomSheetModalProviderRequirementPage } from "#tests/pages/BottomSheetModalProviderRequirementPage";

// `jest.requireActual` bypasses the package-wide `__mocks__/@gorhom/
// bottom-sheet.tsx` double directly — no `jest.unmock` call needed, unlike a
// plain `import`/`require` of the same module, which the double would still
// intercept.
const real = jest.requireActual(
  "@gorhom/bottom-sheet",
) as typeof import("@gorhom/bottom-sheet");

const page = bottomSheetModalProviderRequirementPage();

test("the REAL BottomSheetModal throws 'BottomSheetModalInternalContext cannot be null' with no provider ancestor — the exact crash AppearanceOverlay hit on the shell/appearance route", async () => {
  const onError = jest.fn();
  // React's default (uncaught-by-an-app-boundary) error reporter logs the
  // thrown value via console.error even though the boundary below does
  // catch it — expected noise for a deliberately-thrown error, muted so it
  // doesn't read as a real test failure in CI output.
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {
    return undefined;
  });

  await page.renderAndCaptureThrow(
    <real.BottomSheetModal>
      <Text>content</Text>
    </real.BottomSheetModal>,
    onError,
  );

  consoleError.mockRestore();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]?.[0]).toEqual(
    expect.stringContaining("BottomSheetModalInternalContext"),
  );
});

test("the REAL BottomSheetModal does NOT throw once wrapped in a BottomSheetModalProvider — the fix `tests/visual/scenarios.tsx` applies", async () => {
  const onError = jest.fn();

  await page.renderAndCaptureThrow(
    <real.BottomSheetModalProvider>
      <real.BottomSheetModal>
        <Text>content</Text>
      </real.BottomSheetModal>
    </real.BottomSheetModalProvider>,
    onError,
  );

  expect(onError).not.toHaveBeenCalled();
});
