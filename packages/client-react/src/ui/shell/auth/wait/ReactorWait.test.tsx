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

test("renders the indeterminate bar below the status content, decorative to assistive tech", () => {
  render(<ReactorWait />);

  const root = screen.getByTestId("auth-wait-reactor");
  const track = root.querySelector('[aria-hidden="true"]');
  expect(track).not.toBeNull();
  expect(track?.querySelector("div")).not.toBeNull();
});

test("no longer owns the reactor rings — those wrap the emblem via ReactorRings", () => {
  render(<ReactorWait />);

  const root = screen.getByTestId("auth-wait-reactor");
  expect(root.querySelectorAll("svg").length).toBe(0);
});
