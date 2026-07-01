import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { BootSequence } from "#/shell/Boot/BootSequence";
import { ThemeProvider } from "#/theme/ThemeProvider";

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
