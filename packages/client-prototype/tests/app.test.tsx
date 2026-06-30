import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { App } from "#/App";

test("reaches the themed shell after boot", () => {
  bootToApp();
  expect(screen.getByTestId("app-root")).toBeDefined();
});

test("switching skin updates the --accent CSS variable on :root", () => {
  bootToApp();
  const select = screen.getByLabelText("Theme skin") as HTMLSelectElement;

  select.value = "neon";
  fireEvent.change(select);

  const accent = document.documentElement.style.getPropertyValue("--accent");
  expect(accent).toBe("#ff2bd6"); // neon dark accent
});

test("toggling mode flips dark↔light", () => {
  bootToApp();
  const toggle = screen.getByLabelText("Toggle dark or light mode");

  const before = document.documentElement.style.background;
  fireEvent.click(toggle);
  expect(document.documentElement.style.background).not.toBe(before);
});

// — helpers ——————————————————————————————————————————————————————————————————

function bootToApp(): void {
  render(<App />);
  // prefers-reduced-motion is unset in jsdom (matchMedia → matches:false), so
  // skip the splash explicitly to reach the shell deterministically.
  fireEvent.click(screen.getByTestId("boot-skip"));
}
