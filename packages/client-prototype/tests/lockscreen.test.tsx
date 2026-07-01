import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { LockScreen } from "#/shell/LockScreen/LockScreen";

afterEach(cleanup);

test("shows the locked identity and authenticates", () => {
  const onAuthenticate = vi.fn();
  render(<LockScreen onAuthenticate={onAuthenticate} />);
  expect(screen.getByText("SESSION LOCKED")).toBeDefined();
  expect(screen.getByText("Anthony Stark")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /Authenticate/i }));
  expect(onAuthenticate).toHaveBeenCalledOnce();
});
