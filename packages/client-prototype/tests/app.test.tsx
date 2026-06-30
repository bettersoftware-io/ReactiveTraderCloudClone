import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "#/App";

test("App mounts and renders the prototype root", () => {
  render(<App />);
  expect(screen.getByTestId("app-root")).toBeDefined();
});
