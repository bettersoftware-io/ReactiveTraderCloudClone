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
import { afterEach, describe, expect, it } from "vitest";

import { jarvisOverlayDriveRowPage } from "#tests/ui/pages/JarvisOverlayDriveRowPage";

const page = jarvisOverlayDriveRowPage();

afterEach(() => {
  page.unmountAll();
});

describe("JarvisOverlay — drive rows", () => {
  it("renders a 'drive: <kind>' entry through the SAME generic row template as any other jarvis-role entry", () => {
    page.mount([
      { id: 0, role: "jarvis", text: "Good morning, sir.", done: true },
      { id: 1, role: "jarvis", text: "drive: switchTab", done: true },
    ]);

    expect(page.entryCount()).toBe(2);
    expect(page.entryText(1)).toContain("drive: switchTab");
    expect(page.entryRole(1)).toBe("jarvis");
    expect(page.entryDone(1)).toBe("true");
    // Not narrator-styled — a driven row has no `origin`.
    expect(page.entryHasOrigin(1)).toBe(false);
  });

  it("renders MULTIPLE drive rows in arrival order, alongside an ordinary reply", () => {
    page.mount([
      { id: 0, role: "jarvis", text: "Good morning, sir.", done: true },
      { id: 1, role: "user", text: "set up the vol workspace", done: true },
      { id: 2, role: "jarvis", text: "Setting it up now.", done: true },
      { id: 3, role: "jarvis", text: "drive: switchTab", done: true },
      { id: 4, role: "jarvis", text: "drive: eqIndicator", done: true },
    ]);

    expect(page.entryTexts()).toEqual([
      "Good morning, sir.",
      "set up the vol workspace",
      "Setting it up now.",
      "drive: switchTab",
      "drive: eqIndicator",
    ]);
  });
});
