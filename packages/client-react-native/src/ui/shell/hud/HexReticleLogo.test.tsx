// packages/client-react-native/src/ui/shell/hud/HexReticleLogo.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";

import { hexReticleLogoPage } from "#tests/pages/HexReticleLogoPage";

const mockMotion = jest.fn<() => boolean>();
const page = hexReticleLogoPage();

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
