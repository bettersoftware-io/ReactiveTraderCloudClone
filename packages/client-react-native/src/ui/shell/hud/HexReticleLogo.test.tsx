// packages/client-react-native/src/ui/shell/hud/HexReticleLogo.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";

import { hexReticleLogoPage } from "#tests/pages/HexReticleLogoPage";

const mockMotion = jest.fn<() => boolean>();
afterEach(() => {
  return page.unmountAll();
});

test("renders the reticle when motion is enabled", async () => {
  mockMotion.mockReturnValue(true);
  await page.mount();
  expect(page.exists("hud-logo")).toBe(true);
});

test("renders a static reticle when motion is disabled (freeze / reduced)", async () => {
  mockMotion.mockReturnValue(false);
  await page.mount();
  expect(page.exists("hud-logo")).toBe(true);
});

// The ring and triangles used to be animated <G>s with a `transform` prop. On
// iOS they vanished from the live header once the loops ran (displaced out of
// the view). Each now turns as its own view.
test("the ring and the triangles each turn as a view transform on their own layer", async () => {
  mockMotion.mockReturnValue(false);
  await page.mount();

  expect(page.layerRotation("hud-logo-ring")).toBe("0deg");
  expect(page.layerRotation("hud-logo-triangles")).toBe("0deg");
});

jest.mock("./useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return mockMotion();
    },
  };
});

jest.mock("#/ui/theme/useTheme", () => {
  return {
    useTheme: () => {
      return { accentPrimary: "#00E5FF", accent2: "#7C4DFF" };
    },
  };
});

const page = hexReticleLogoPage();
