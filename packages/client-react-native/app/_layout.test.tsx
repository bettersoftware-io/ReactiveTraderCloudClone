import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import RootLayout from "./_layout";

// AsyncStorage has no native module under jest, so importing the real one
// throws at require time (it's on _layout's static import graph via AppRoot →
// buildNativePorts, evaluated even though the fonts-loading fallback never
// renders AppRoot). Same stub as src/app/AppRoot.test.tsx.
jest.mock("@react-native-async-storage/async-storage", () => {
  return {
    __esModule: true,
    default: {
      getItem: (): Promise<null> => {
        return Promise.resolve(null);
      },
      setItem: (): Promise<void> => {
        return Promise.resolve();
      },
    },
  };
});

// The real useAppFonts (expo-font) resolves synchronously within RNTL's
// render()-triggered act flush under jest-expo's iOS preset — its native font
// loader mock succeeds immediately, so `fontsLoaded` would flip true mid-test
// and mount the tab navigator, which throws outside a real expo-router
// context. Pin the hook false so this test deterministically exercises the
// fallback branch (the mount smoke this test is for), independent of the
// router.
jest.mock("#/ui/theme/fonts", () => {
  return {
    useAppFonts: (): boolean => {
      return false;
    },
  };
});

test("root layout mounts inside the gesture-handler root", async () => {
  await render(<RootLayout />);
  // Fonts are not loaded in jsdom, so the gated fallback renders — proving the
  // tree (now wrapped in GestureHandlerRootView) mounts without throwing.
  expect(screen.getByTestId("fonts-loading")).toBeTruthy();
});
