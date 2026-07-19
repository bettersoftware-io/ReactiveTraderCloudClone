// packages/client-react-native/src/ui/shell/hud/HexReticleLogo.test.tsx
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { JSX } from "react";

const mockMotion = jest.fn<() => boolean>();
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

// Imported after the mocks are registered.
const { HexReticleLogo } = require("./HexReticleLogo") as HexReticleLogoModule;

test("renders the reticle when motion is enabled", async () => {
  mockMotion.mockReturnValue(true);
  await render(<HexReticleLogo />);
  expect(screen.getByTestId("hud-logo")).toBeTruthy();
});

test("renders a static reticle when motion is disabled (freeze / reduced)", async () => {
  mockMotion.mockReturnValue(false);
  await render(<HexReticleLogo />);
  expect(screen.getByTestId("hud-logo")).toBeTruthy();
});

interface HexReticleLogoProps {
  size?: number;
}

interface HexReticleLogoModule {
  HexReticleLogo: (p: HexReticleLogoProps) => JSX.Element;
}
