import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { BootSequence } from "#/shell/Boot/BootSequence";
import { ThemeProvider } from "#/theme/ThemeProvider";

afterEach(cleanup);

test("Boot fires onDone when skipped", async () => {
  const onDone = vi.fn();
  render(
    <ThemeProvider>
      <BootSequence onDone={onDone} />
    </ThemeProvider>,
  );
  screen.getByTestId("boot-skip").click();
  expect(onDone).toHaveBeenCalledOnce();
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
