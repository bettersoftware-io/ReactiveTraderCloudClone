import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { StatusBar } from "#/shell/StatusBar/StatusBar";

afterEach(cleanup);

test("renders connection state, a status item, build and clock", () => {
  render(<StatusBar />);
  expect(screen.getByText("CONNECTED")).toBeDefined();
  expect(screen.getByText("BUILD v4.0.1")).toBeDefined();
  expect(screen.getByText(/UTC/)).toBeDefined();
  expect(screen.getByText("LAT")).toBeDefined();
});
