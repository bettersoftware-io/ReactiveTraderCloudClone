import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

// RNTL 14 (React 19) made `render` async — it awaits a concurrent `act`.
test("RNTL renders an RN component and queries it", async () => {
  await render(<Text>hello-rn-harness</Text>);
  expect(screen.getByText("hello-rn-harness")).toBeTruthy();
});
