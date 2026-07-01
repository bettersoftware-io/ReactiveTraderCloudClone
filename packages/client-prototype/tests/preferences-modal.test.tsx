import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { PreferencesModal } from "#/shell/Preferences/PreferencesModal";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--amb-play");
});

test("toggling Animated background switch flips --amb-play to running", () => {
  renderModal();
  fireEvent.click(screen.getByRole("switch", { name: "Animated background" }));
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe(
    "running",
  );
});

test("DONE closes the modal", () => {
  const { onClose } = renderModal();
  fireEvent.click(screen.getByText("DONE"));
  expect(onClose).toHaveBeenCalledOnce();
});

test("selecting a density segment updates the active state", () => {
  renderModal();
  const compact = screen.getByText("Compact");
  fireEvent.click(compact);
  expect(compact.getAttribute("data-on")).toBe("true");
});

interface ModalHarness {
  onClose(): void;
}

function renderModal(): ModalHarness {
  const onClose = vi.fn();
  render(
    <PreferencesProvider>
      <PreferencesModal onClose={onClose} />
    </PreferencesProvider>,
  );
  return { onClose };
}
