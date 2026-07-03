import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { BiometricLine } from "#/ui/shell/lock/BiometricLine";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the decorative biometric readout", async () => {
  await renderWithTheme(<BiometricLine />);
  expect(screen.getByTestId("lock-biometric")).toBeTruthy();
  expect(screen.getByText("BIOMETRIC · ENCRYPTED CHANNEL")).toBeTruthy();
});
