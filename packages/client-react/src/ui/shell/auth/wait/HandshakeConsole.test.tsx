import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { HandshakeConsole } from "./HandshakeConsole";

afterEach(() => {
  cleanup();
});

test("renders all three handshake lines legibly at base state", () => {
  render(<HandshakeConsole />);

  const root = screen.getByTestId("auth-wait-handshake");
  expect(root).not.toBeNull();
  expect(root.textContent).toContain("SECURE CHANNEL OPEN");
  expect(root.textContent).toContain("CREDENTIALS SEALED");
  expect(root.textContent).toContain("AWAITING AUTH GRANT");
});

test("exposes the wait as a live region for assistive tech", () => {
  render(<HandshakeConsole />);

  const status = screen.getByRole("status");
  expect(status.textContent).toContain("AWAITING AUTH GRANT");
});
