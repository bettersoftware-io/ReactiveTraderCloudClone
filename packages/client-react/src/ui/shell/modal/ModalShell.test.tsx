import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModalShell } from "./ModalShell";

afterEach(() => {
  cleanup();
});

describe("ModalShell", () => {
  it("renders nothing when closed", () => {
    renderShell(false);
    expect(screen.queryByTestId("shell-root")).toBeNull();
  });

  it("renders chrome, children and testids when open", () => {
    renderShell(true);
    expect(screen.getByTestId("shell-root")).toBeTruthy();
    expect(screen.getByText("TITLE")).toBeTruthy();
    expect(screen.getByText("SUB")).toBeTruthy();
    expect(screen.getByText("NOTE")).toBeTruthy();
    expect(screen.getByTestId("shell-child")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeTruthy();
  });

  it("fires onClose from the ✕ control", () => {
    const onClose = renderShell(true);
    fireEvent.click(screen.getByTestId("shell-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose from the DONE button", () => {
    const onClose = renderShell(true);
    fireEvent.click(screen.getByTestId("shell-done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

function renderShell(open: boolean, onClose = vi.fn()): typeof onClose {
  render(
    <ModalShell
      open={open}
      title="TITLE"
      subtitle="SUB"
      footNote="NOTE"
      ariaLabel="Test dialog"
      closeAriaLabel="Close test dialog"
      rootTestid="shell-root"
      closeTestid="shell-close"
      doneTestid="shell-done"
      onClose={onClose}
    >
      <div data-testid="shell-child">content</div>
    </ModalShell>,
  );
  return onClose;
}
