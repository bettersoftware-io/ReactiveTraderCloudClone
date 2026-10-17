import { describe, expect, it } from "vitest";

import type { WorkspaceTab } from "@rtc/core-api";

import {
  createFakeRouteHistory,
  type FakeRouteHistory,
} from "#/routes/__tests__/createFakeRouteHistory";
import {
  createWorkspaceRouteSync,
  type WorkspaceRouteSync,
} from "#/routes/workspaceRouteSync";

describe("createWorkspaceRouteSync", () => {
  it("mounts on no path by replacing it with the active tab", () => {
    const h = createHarness("");
    h.create().observe("fx");

    expect(h.history.writes).toEqual(["replace /fx"]);
  });

  it("mounts on another tab's URL by switching to it, with no writes", () => {
    const h = createHarness("/credit");
    h.create().observe("fx");

    expect(h.switched).toEqual(["credit"]);
    expect(h.history.writes).toEqual([]);
  });

  it("observing the tab last observed does nothing", () => {
    const h = createHarness("/credit", { reenter: false });
    const sync = h.create();
    sync.observe("fx");
    sync.observe("fx");

    expect(h.switched).toEqual(["credit"]);
    expect(h.history.writes).toEqual([]);
  });

  it("mounts on a login route by replacing it with the active tab", () => {
    const h = createHarness("/sign-in");
    h.create().observe("equities");

    expect(h.history.writes).toEqual(["replace /equities"]);
  });

  it("pushes a later tab change", () => {
    const h = createHarness("/fx");
    const sync = h.create();
    sync.observe("fx");
    sync.observe("credit");

    expect(h.history.writes).toEqual(["push /credit"]);
  });

  it("follows Back to a tab route by switching, without writing", () => {
    const h = createHarness("/fx");
    const sync = h.create();
    sync.observe("fx");
    sync.observe("credit");
    h.history.writes.length = 0;
    h.history.traverse("/fx");

    expect(h.switched).toEqual(["fx"]);
    expect(h.history.writes).toEqual([]);
  });

  it("rewrites a traversal onto a login route to the tab on screen", () => {
    const h = createHarness("/fx");
    const sync = h.create();
    sync.observe("fx");
    sync.observe("credit");
    h.history.writes.length = 0;
    h.history.traverse("/create-account");

    expect(h.history.writes).toEqual(["replace /credit"]);
    expect(h.switched).toEqual([]);
  });

  it("rewrites a traversal onto no route to the tab on screen", () => {
    const h = createHarness("/fx");
    h.create().observe("fx");
    h.history.writes.length = 0;
    h.history.traverse("");

    expect(h.history.writes).toEqual(["replace /fx"]);
  });

  it("survives a second mount over the same history", () => {
    const h = createHarness("/credit", { reenter: false });
    const first = h.create();
    first.observe("fx");
    first.dispose();
    h.create().observe("fx");

    expect(h.switched).toEqual(["credit", "credit"]);
    expect(h.history.writes).toEqual([]);
  });

  it("dispose stops listening", () => {
    const h = createHarness("/fx");
    const sync = h.create();
    sync.observe("fx");
    sync.dispose();
    h.history.writes.length = 0;
    h.history.traverse("/credit");

    expect(h.switched).toEqual([]);
    expect(h.history.writes).toEqual([]);
  });
});

interface WorkspaceHarness {
  readonly history: FakeRouteHistory;
  readonly switched: WorkspaceTab[];
  create(): WorkspaceRouteSync;
}

interface WorkspaceHarnessOptions {
  /** Makes switchTab behave like Solid: the tab changes and the observer
   * hears it synchronously. Off, a switch is only recorded. */
  readonly reenter?: boolean;
}

function createHarness(
  path: string,
  { reenter = true }: WorkspaceHarnessOptions = {},
): WorkspaceHarness {
  const history = createFakeRouteHistory(path);
  const switched: WorkspaceTab[] = [];

  function create(): WorkspaceRouteSync {
    const sync = createWorkspaceRouteSync({
      routes: history,
      switchTab: (tab: WorkspaceTab): void => {
        switched.push(tab);

        if (reenter) {
          sync.observe(tab);
        }
      },
    });

    return sync;
  }

  return {
    history,
    switched,
    create,
  };
}
