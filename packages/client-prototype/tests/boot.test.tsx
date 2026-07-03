import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { BootSequence } from "#/shell/Boot/BootSequence";
import { ThemeProvider } from "#/theme/ThemeProvider";

afterEach(cleanup);

test("Boot skip triggers the fade then fires onDone after the fade window", () => {
  vi.useFakeTimers();
  const onDone = vi.fn();
  render(
    <ThemeProvider>
      <BootSequence onDone={onDone} />
    </ThemeProvider>,
  );
  act(() => {
    screen.getByTestId("boot-skip").click();
  });
  // fade started, onDone NOT yet called
  expect(onDone).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(900);
  });
  expect(onDone).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

test("Boot shows the branded wordmark and subtitle", () => {
  render(
    <ThemeProvider>
      <BootSequence onDone={vi.fn()} />
    </ThemeProvider>,
  );
  expect(screen.getByText("REACTIVE TRADER")).toBeTruthy();
  expect(
    screen.getByText("TACTICAL TRADING OPERATING SYSTEM · v4.0"),
  ).toBeTruthy();
});
