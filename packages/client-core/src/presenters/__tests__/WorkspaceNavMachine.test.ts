import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { WorkspaceTab } from "#/layout/defaultLayoutPort";

import { createWorkspaceNavMachine } from "../WorkspaceNavMachine";

describe("WorkspaceNavMachine", () => {
  it("starts with activeTab 'fx'", async () => {
    const m = createWorkspaceNavMachine();
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({ activeTab: "fx" });
    m.dispose();
  });

  it("switchTab(tab) folds the new tab into state", async () => {
    const m = createWorkspaceNavMachine();
    m.intents.switchTab("equities");
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({ activeTab: "equities" });
    m.dispose();
  });

  it("switchTab can move through every WorkspaceTab", async () => {
    const m = createWorkspaceNavMachine();

    m.intents.switchTab("credit");
    expect(await firstValueFrom(m.state$)).toEqual({ activeTab: "credit" });

    m.intents.switchTab("admin");
    expect(await firstValueFrom(m.state$)).toEqual({ activeTab: "admin" });

    m.intents.switchTab("equities");
    expect(await firstValueFrom(m.state$)).toEqual({ activeTab: "equities" });

    m.intents.switchTab("fx");
    expect(await firstValueFrom(m.state$)).toEqual({ activeTab: "fx" });

    m.dispose();
  });

  it("repeated same-tab switches emit only once (distinctUntilChanged)", () => {
    const m = createWorkspaceNavMachine();
    const received: WorkspaceNavStateSnapshot[] = [];
    const sub = m.state$.subscribe((s) => {
      received.push(s);
    });

    m.intents.switchTab("credit");
    m.intents.switchTab("credit");
    m.intents.switchTab("credit");

    expect(received).toEqual([{ activeTab: "fx" }, { activeTab: "credit" }]);

    sub.unsubscribe();
    m.dispose();
  });

  it("switching away and back to the same tab re-emits (distinctUntilChanged compares only CONSECUTIVE values)", () => {
    const m = createWorkspaceNavMachine();
    const received: WorkspaceNavStateSnapshot[] = [];
    const sub = m.state$.subscribe((s) => {
      received.push(s);
    });

    m.intents.switchTab("credit");
    m.intents.switchTab("fx");
    m.intents.switchTab("credit");

    expect(received).toEqual([
      { activeTab: "fx" },
      { activeTab: "credit" },
      { activeTab: "fx" },
      { activeTab: "credit" },
    ]);

    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() completes switchTab intents without throwing", () => {
    const m = createWorkspaceNavMachine();
    m.dispose();
    expect(() => {
      m.intents.switchTab("admin");
    }).not.toThrow();
  });
});

interface WorkspaceNavStateSnapshot {
  readonly activeTab: WorkspaceTab;
}
