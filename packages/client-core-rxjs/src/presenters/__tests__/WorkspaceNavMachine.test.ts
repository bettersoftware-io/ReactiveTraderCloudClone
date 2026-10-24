import { BehaviorSubject, firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { WorkspaceTab } from "@rtc/core-api";
import type { AccessLevel } from "@rtc/domain";

import { createWorkspaceNavMachine } from "../WorkspaceNavMachine";

describe("WorkspaceNavMachine", () => {
  it("starts with activeTab 'fx'", async () => {
    const m = createWorkspaceNavMachine(of(null));
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({
      activeTab: "fx",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });
    m.dispose();
  });

  it("switchTab(tab) folds the new tab into state", async () => {
    const m = createWorkspaceNavMachine(of(null));
    m.intents.switchTab("equities");
    const state = await firstValueFrom(m.state$);
    expect(state).toEqual({
      activeTab: "equities",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });
    m.dispose();
  });

  it("switchTab can move through every WorkspaceTab", async () => {
    const m = createWorkspaceNavMachine(of(null));

    m.intents.switchTab("credit");
    expect(await firstValueFrom(m.state$)).toEqual({
      activeTab: "credit",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });

    m.intents.switchTab("ops");
    expect(await firstValueFrom(m.state$)).toEqual({
      activeTab: "ops",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });

    m.intents.switchTab("equities");
    expect(await firstValueFrom(m.state$)).toEqual({
      activeTab: "equities",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });

    m.intents.switchTab("fx");
    expect(await firstValueFrom(m.state$)).toEqual({
      activeTab: "fx",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });

    m.dispose();
  });

  it("repeated same-tab switches emit only once (distinctUntilChanged)", () => {
    const m = createWorkspaceNavMachine(of(null));
    const received: WorkspaceNavStateSnapshot[] = [];
    const sub = m.state$.subscribe((s) => {
      received.push(s);
    });

    m.intents.switchTab("credit");
    m.intents.switchTab("credit");
    m.intents.switchTab("credit");

    expect(received).toEqual([
      { activeTab: "fx", visibleTabs: ["fx", "credit", "equities", "ops"] },
      { activeTab: "credit", visibleTabs: ["fx", "credit", "equities", "ops"] },
    ]);

    sub.unsubscribe();
    m.dispose();
  });

  it("switching away and back to the same tab re-emits (distinctUntilChanged compares only CONSECUTIVE values)", () => {
    const m = createWorkspaceNavMachine(of(null));
    const received: WorkspaceNavStateSnapshot[] = [];
    const sub = m.state$.subscribe((s) => {
      received.push(s);
    });

    m.intents.switchTab("credit");
    m.intents.switchTab("fx");
    m.intents.switchTab("credit");

    expect(received).toEqual([
      { activeTab: "fx", visibleTabs: ["fx", "credit", "equities", "ops"] },
      { activeTab: "credit", visibleTabs: ["fx", "credit", "equities", "ops"] },
      { activeTab: "fx", visibleTabs: ["fx", "credit", "equities", "ops"] },
      { activeTab: "credit", visibleTabs: ["fx", "credit", "equities", "ops"] },
    ]);

    sub.unsubscribe();
    m.dispose();
  });

  it("a switch to admin is refused while the access stream says user, and emits nothing", () => {
    const m = createWorkspaceNavMachine(of<AccessLevel | null>("user"));
    const received: WorkspaceNavStateSnapshot[] = [];
    const sub = m.state$.subscribe((s) => {
      received.push(s);
    });

    m.intents.switchTab("admin");

    expect(received).toHaveLength(1);
    expect(received[0].activeTab).toBe("fx");
    expect(received[0].visibleTabs).not.toContain("admin");

    sub.unsubscribe();
    m.dispose();
  });

  it("follows the access stream: admin shows the tab, losing access on admin lands on fx", () => {
    const access$ = new BehaviorSubject<AccessLevel | null>(null);
    const m = createWorkspaceNavMachine(access$);
    const received: WorkspaceNavStateSnapshot[] = [];
    const sub = m.state$.subscribe((s) => {
      received.push(s);
    });

    access$.next("admin");
    m.intents.switchTab("admin");
    access$.next(null);

    expect(received.at(-3)?.visibleTabs).toContain("admin");
    expect(received.at(-2)?.activeTab).toBe("admin");
    expect(received.at(-1)).toEqual({
      activeTab: "fx",
      visibleTabs: ["fx", "credit", "equities", "ops"],
    });

    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() releases the access subscription", () => {
    const access$ = new BehaviorSubject<AccessLevel | null>(null);
    const m = createWorkspaceNavMachine(access$);

    expect(access$.observed).toBe(true);
    m.dispose();
    expect(access$.observed).toBe(false);
  });

  it("dispose() completes switchTab intents without throwing", () => {
    const m = createWorkspaceNavMachine(of(null));
    m.dispose();
    expect(() => {
      m.intents.switchTab("ops");
    }).not.toThrow();
  });
});

interface WorkspaceNavStateSnapshot {
  readonly activeTab: WorkspaceTab;
  readonly visibleTabs: readonly WorkspaceTab[];
}
