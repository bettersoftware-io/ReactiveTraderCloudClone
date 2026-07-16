import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { MotionProbe } from "./MotionProbe";

test("MotionProbe renders the reanimated + skia probe surface", async () => {
  await render(<MotionProbe />);
  expect(screen.getByTestId("motion-probe")).toBeTruthy();
});
