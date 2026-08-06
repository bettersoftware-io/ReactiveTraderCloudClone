/**
 * Co-located unit test for Task 10's follow-up ruling: driven "drive: <kind>"
 * transcript rows (JarvisMachine.intents.recordDriveOutcome, wired from
 * jarvisDriver.outcomes$ in composition.ts — see JarvisMachine.ts's own
 * `recordDriveOutcome` doc). No dedicated "drive row" component/CSS exists,
 * by design: the fold in JarvisMachine.ts appends a plain jarvis-role entry,
 * so JarvisOverlay's existing `state.entries.map(...)` already renders it —
 * this file proves that rendering path, the same way the shared
 * `ui-contract` tier's JarvisOverlay.contract.spec.ts ("renders a tool chip
 * that transitions running -> done") proves the toolEvent row rendering
 * path, but scoped to client-react (composition/machine wiring is this
 * task's territory; the cross-framework contract spec is Task 12's).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { JarvisEntry } from "@rtc/client-core";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { JarvisOverlay } from "./JarvisOverlay";

afterEach(() => {
  cleanup();
});

describe("JarvisOverlay — drive rows", () => {
  it("renders a 'drive: <kind>' entry through the SAME generic row template as any other jarvis-role entry", () => {
    renderOverlay([
      { id: 0, role: "jarvis", text: "Good morning, sir.", done: true },
      { id: 1, role: "jarvis", text: "drive: switchTab", done: true },
    ]);

    const entries = screen.getAllByTestId("jarvis-entry");
    expect(entries).toHaveLength(2);
    expect(entries[1]?.textContent).toContain("drive: switchTab");
    expect(entries[1]?.getAttribute("data-role")).toBe("jarvis");
    expect(entries[1]?.getAttribute("data-done")).toBe("true");
    // Not narrator-styled — a driven row has no `origin`.
    expect(entries[1]?.hasAttribute("data-origin")).toBe(false);
  });

  it("renders MULTIPLE drive rows in arrival order, alongside an ordinary reply", () => {
    renderOverlay([
      { id: 0, role: "jarvis", text: "Good morning, sir.", done: true },
      { id: 1, role: "user", text: "set up the vol workspace", done: true },
      { id: 2, role: "jarvis", text: "Setting it up now.", done: true },
      { id: 3, role: "jarvis", text: "drive: switchTab", done: true },
      { id: 4, role: "jarvis", text: "drive: eqIndicator", done: true },
    ]);

    const entries = screen.getAllByTestId("jarvis-entry");
    expect(
      entries.map((entry) => {
        return entry.textContent;
      }),
    ).toEqual([
      "Good morning, sir.",
      "set up the vol workspace",
      "Setting it up now.",
      "drive: switchTab",
      "drive: eqIndicator",
    ]);
  });
});

function renderOverlay(
  entries: readonly JarvisEntry[],
): ReturnType<typeof render> {
  const hooks = {
    useJarvis: () => {
      return {
        state: {
          open: true,
          skin: "singularity",
          unread: 0,
          unreadNarration: false,
          phase: "idle",
          entries,
          pendingConfirmation: null,
          available: true,
        },
        close: () => {},
        toggle: () => {},
        send: () => {},
        approveConfirmation: () => {},
        declineConfirmation: () => {},
        setSkin: () => {},
      };
    },
  } as unknown as ViewModel;

  return render(
    <ViewModelContext.Provider value={hooks}>
      <JarvisOverlay />
    </ViewModelContext.Provider>,
  );
}
