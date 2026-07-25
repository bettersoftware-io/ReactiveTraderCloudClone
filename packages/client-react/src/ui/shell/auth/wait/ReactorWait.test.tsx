import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { ReactorWait } from "./ReactorWait";

afterEach(() => {
  cleanup();
});

test("renders the status line legibly at base state", () => {
  render(<ReactorWait />);

  const root = screen.getByTestId("auth-wait-reactor");
  expect(root).not.toBeNull();
  expect(root.textContent).toContain("AWAITING AUTH GRANT");
});

test("exposes the wait as a live region for assistive tech", () => {
  render(<ReactorWait />);

  const status = screen.getByRole("status");
  expect(status.textContent).toContain("AWAITING AUTH GRANT");
});

test("the spinning rings are decorative and hidden from assistive tech", () => {
  render(<ReactorWait />);

  const rings = screen
    .getByTestId("auth-wait-reactor")
    .querySelectorAll("svg[aria-hidden='true']");
  expect(rings.length).toBe(2);
});
