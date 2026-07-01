import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { App } from "#/App";

afterEach(cleanup);

test("nav switches the active placeholder panel", () => {
  boot();
  fireEvent.click(screen.getByText("EQUITIES"));
  expect(screen.getByTestId("panel-equities")).toBeDefined();
});

test("Preferences toggling animatedBg flips --amb-play", () => {
  boot();
  fireEvent.click(screen.getByLabelText("Account"));
  fireEvent.click(screen.getByText(/Preferences/));
  fireEvent.click(screen.getByRole("switch", { name: "Animated background" }));
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe(
    "running",
  );
});

test("Sign Out shows LockScreen, AUTHENTICATE returns to shell", () => {
  boot();
  fireEvent.click(screen.getByLabelText("Account"));
  fireEvent.click(screen.getByText(/Sign Out/));
  expect(screen.getByText("SESSION LOCKED")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /Authenticate/i }));
  expect(screen.getByTestId("app-shell")).toBeDefined();
});

test("a header menu opens and closes on backdrop click", () => {
  boot();
  fireEvent.click(screen.getByLabelText("Language"));
  expect(screen.getByText("Français")).toBeDefined();
  fireEvent.click(screen.getByTestId("menu-backdrop"));
  expect(screen.queryByText("Français")).toBeNull();
});

// — helpers —————————————————————————————————————————————————————————————————————

function boot(): void {
  render(<App />);
  fireEvent.click(screen.getByTestId("boot-skip"));
}
