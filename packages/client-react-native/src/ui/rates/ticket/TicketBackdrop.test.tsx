// packages/client-react-native/src/ui/rates/ticket/TicketBackdrop.test.tsx
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { afterEach, expect, jest, test } from "@jest/globals";
import type { SharedValue } from "react-native-reanimated";

import { ticketBackdropPage } from "#tests/pages/TicketBackdropPage";

let mockMotionEnabled = true;
const mockClose = jest.fn();
// Every props object the library's `BottomSheetBackdrop` was rendered with.
const mockLibraryBackdropProps: Record<string, unknown>[] = [];

const page = ticketBackdropPage();

afterEach(() => {
  return page.unmountAll();
});

// The props gorhom hands a `backdropComponent` (`BottomSheet.tsx`: an
// `animatedIndex`, an `animatedPosition` and `StyleSheet.absoluteFill`). Only
// the identity of `animatedIndex` is asserted, so the pass-through is proven
// without this test owning the library's own interpolation.
const animatedIndex = { value: 0 } as SharedValue<number>;
const backdropProps: BottomSheetBackdropProps = {
  animatedIndex,
  animatedPosition: { value: 0 } as SharedValue<number>,
  style: undefined,
};

// The reduced-motion / Freeze arm: a scrim with NO tie to `animatedIndex`, so
// the `enableDynamicSizing` re-measure cannot move it after the content has
// settled.
test("paints a static scrim, not the index-interpolated one, when shell motion is off", async () => {
  mockMotionEnabled = false;
  mockLibraryBackdropProps.length = 0;
  await page.mount(backdropProps);

  expect(mockLibraryBackdropProps).toEqual([]);
  expect(page.rawStyleOf("ticket-backdrop-static")).toContainEqual({
    backgroundColor: "rgba(0,6,10,0.78)",
  });
});

// Tap-to-dismiss is what `BottomSheetBackdrop`'s `pressBehavior="close"` gave
// us, and the static arm has to carry it itself — a scrim you cannot tap
// through OR dismiss would trap the user behind the sheet.
test("the static scrim still closes the sheet on press", async () => {
  mockMotionEnabled = false;
  mockClose.mockClear();
  await page.mount(backdropProps);

  await page.press("ticket-backdrop-static");
  expect(mockClose).toHaveBeenCalledTimes(1);
});

// The other arm, so this is proven to BE a gate: with motion on the library
// component renders, still fading in and out with the sheet, still fed the
// sheet's own `animatedIndex` — and tinted with the theme's `bgOverlay`
// (opacity pinned to 1: the token's rgba carries the design's alpha).
test("defers to the library backdrop, themed to bgOverlay, when shell motion is on", async () => {
  mockMotionEnabled = true;
  mockLibraryBackdropProps.length = 0;
  await page.mount(backdropProps);

  expect(page.exists("ticket-backdrop-static")).toBe(false);
  expect(mockLibraryBackdropProps).toHaveLength(1);
  expect(mockLibraryBackdropProps[0]).toMatchObject({
    animatedIndex,
    appearsOnIndex: 0,
    disappearsOnIndex: -1,
    pressBehavior: "close",
    opacity: 1,
  });
  expect(mockLibraryBackdropProps[0].style).toContainEqual({
    backgroundColor: "rgba(0,6,10,0.78)",
  });
});

// Replaces the package-wide double at `__mocks__/@gorhom/bottom-sheet.tsx` for
// this file only. Two reasons it has to be local: that double renders no
// `backdropComponent` at all (its `BottomSheetModal` renders only `children`),
// so nothing there exercises this component; and it cannot export
// `useBottomSheet` even if it wanted to — Biome's
// `useComponentExportOnlyModules` is an error in this repo and a mock file may
// export only components.
jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native") as typeof import("react-native");

  return {
    BottomSheetBackdrop: (props: Record<string, unknown>) => {
      mockLibraryBackdropProps.push(props);
      return <View testID="library-backdrop" />;
    },
    useBottomSheet: () => {
      return { close: mockClose };
    },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotionEnabled;
    },
  };
});
