import { describe, expect, it, vi } from "vitest";

import { ROSTER } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const NOW: number = 1_800_000_000_000;
const EVERY_USER_TABS = ["fx", "credit", "equities", "ops"] as const;

/** `presenters.workspaceNav` — the app's active workspace tab, a singleton
 * machine retained for the session. */
export function describeWorkspaceNavContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("opens on fx, synchronously", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.workspaceNav.state$);
        expect(c.values).toEqual([
          { activeTab: "fx", visibleTabs: EVERY_USER_TABS },
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("switchTab moves the active tab; switching to the tab already active emits nothing", async () => {
      const h = makeHarness();

      try {
        const nav = h.app.presenters.workspaceNav;
        const c = collect(nav.state$);
        nav.intents.switchTab("credit");
        await settle();
        nav.intents.switchTab("credit");
        await settle();
        nav.intents.switchTab("equities");
        await settle();
        expect(
          c.values.map((value) => {
            return value.activeTab;
          }),
        ).toEqual(["fx", "credit", "equities"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("keeps the active tab across a full unsubscribe: a late subscriber opens on it", async () => {
      const h = makeHarness();

      try {
        const nav = h.app.presenters.workspaceNav;
        const first = collect(nav.state$);
        nav.intents.switchTab("ops");
        await settle();
        first.unsubscribe();
        const late = collect(nav.state$);
        expect(late.values.at(0)?.activeTab).toBe("ops");
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("opens with no admin tab, and a switch to admin is refused: nothing is emitted", async () => {
      const h = makeHarness();

      try {
        const nav = h.app.presenters.workspaceNav;
        const c = collect(nav.state$);
        expect(c.values.at(0)?.visibleTabs).not.toContain("admin");
        nav.intents.switchTab("admin");
        await settle();
        expect(c.values).toHaveLength(1);
        expect(c.values.at(-1)?.activeTab).toBe("fx");
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("an administrator's sign-in shows the admin tab, last, and a switch to it is accepted", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.workspaceNav.state$);
          h.app.presenters.auth.login(ROSTER[0].username, "pw");
          await clock.settle();
          h.driver.resolveLogin({
            ok: true,
            token: "tok",
            user: { ...ROSTER[0].user, access: "admin" },
            exp: NOW + 1_000,
          });
          await clock.settle();
          expect(c.values.at(-1)?.visibleTabs).toEqual([
            ...EVERY_USER_TABS,
            "admin",
          ]);
          h.app.presenters.workspaceNav.intents.switchTab("admin");
          await clock.settle();
          expect(c.values.at(-1)?.activeTab).toBe("admin");
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("a signed-in user who is not an administrator does not see the admin tab", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.workspaceNav.state$);
          h.app.presenters.auth.login(ROSTER[0].username, "pw");
          await clock.settle();
          h.driver.resolveLogin({
            ok: true,
            token: "tok",
            user: ROSTER[0].user,
            exp: NOW + 1_000,
          });
          await clock.settle();
          expect(c.values.at(-1)?.visibleTabs).toEqual(EVERY_USER_TABS);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("signing out while on admin lands on fx and hides the admin tab", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.workspaceNav.state$);
          h.app.presenters.auth.login(ROSTER[0].username, "pw");
          await clock.settle();
          h.driver.resolveLogin({
            ok: true,
            token: "tok",
            user: { ...ROSTER[0].user, access: "admin" },
            exp: NOW + 1_000,
          });
          await clock.settle();
          h.app.presenters.workspaceNav.intents.switchTab("admin");
          await clock.settle();
          expect(c.values.at(-1)?.activeTab).toBe("admin");
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            activeTab: "fx",
            visibleTabs: EVERY_USER_TABS,
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });
  });
}
