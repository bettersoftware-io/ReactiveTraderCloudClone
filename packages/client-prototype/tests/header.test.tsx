import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { Header } from "#/shell/Header/Header";
import type { Tab } from "#/shell/Header/useMenus";
import { ThemeProvider } from "#/theme/ThemeProvider";

afterEach(cleanup);

test("nav click selects a tab", () => {
  const { onSelectTab } = renderHeader();
  fireEvent.click(screen.getByText("CREDIT"));
  expect(onSelectTab).toHaveBeenCalledWith("credit");
});

test("theme picker opens and switching skin updates --accent", () => {
  renderHeader();
  fireEvent.click(screen.getByLabelText("Theme picker"));
  fireEvent.click(screen.getByText("Neon Grid"));
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#ff2bd6",
  );
});

test("mode toggle flips the themed background", () => {
  renderHeader();
  const before = document.documentElement.style.background;
  fireEvent.click(screen.getByLabelText(/Switch to (dark|light) mode/));
  expect(document.documentElement.style.background).not.toBe(before);
});

// — helpers ———————————————————————————————————————————————————————————————————

interface RenderHeaderResult {
  onSelectTab: ReturnType<typeof vi.fn>;
}

function renderHeader(tab: Tab = "fx"): RenderHeaderResult {
  const onSelectTab = vi.fn();
  render(
    <ThemeProvider>
      <Header tab={tab} onSelectTab={onSelectTab} />
    </ThemeProvider>,
  );
  return { onSelectTab };
}
