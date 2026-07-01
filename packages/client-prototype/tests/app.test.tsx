import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { App } from "#/App";

afterEach(cleanup);

test("reaches the themed shell after boot", () => {
  bootToApp();
  expect(screen.getByTestId("app-shell")).toBeDefined();
});

test("theme picker switches skin (--accent → neon)", () => {
  bootToApp();
  fireEvent.click(screen.getByLabelText("Theme picker"));
  fireEvent.click(screen.getByText("Neon Grid"));
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#ff2bd6",
  );
});

test("mode toggle flips dark↔light", () => {
  bootToApp();
  const before = document.documentElement.style.background;
  fireEvent.click(screen.getByLabelText(/Switch to (dark|light) mode/));
  expect(document.documentElement.style.background).not.toBe(before);
});

// — helpers —————————————————————————————————————————————————————————————————————

function bootToApp(): void {
  render(<App />);
  // prefers-reduced-motion is unset in jsdom (matchMedia → matches:false), so
  // skip the splash explicitly to reach the shell deterministically.
  fireEvent.click(screen.getByTestId("boot-skip"));
}
