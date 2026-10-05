import { describe, expect, it, vi } from "vitest";

import {
  ROSTER,
  type RosterEntry,
  WORKSPACE_PERSIST_DEBOUNCE_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { everySessionStream, signIn } from "#/suites/sessionKit";
import {
  createPanelEvent,
  FX_TICKS_SPEC,
  leafIds,
  readLayout,
  replyToTurn,
} from "#/suites/workspaceKit";

const NOW: number = 1_800_000_000_000;
const DEMO: RosterEntry = ROSTER[0];

/** `app.dispose()` releases everything the composition holds: after it, no
 * stream any port method returned has a live subscription, and nothing the
 * app wired keeps reacting to its own presenters. A property of the whole
 * composition, so it is not keyed by member. The first case runs a realistic
 * session first — sign in through `presenters.auth`, a Jarvis turn that
 * spawns a live price panel and docks it, then one warm period on 39
 * port-backed presenter streams a mounted workspace reads — so what dispose
 * must release is whatever that session left the app holding, not only what
 * composition alone opens. Ending the app must not lose state either: a
 * workspace-layout change still inside the persistence debounce is written
 * by `dispose()` (a hot swap disposes the core seconds after a drag), never
 * a layout a reset already discarded, and with nothing pending nothing is
 * written. */
export function describeDisposeContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(`${label} :: dispose`, () => {
    it("after a signed-in session, dispose() leaves no port stream subscribed", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ transport: true, countPortStreams: true });

        try {
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          await replyToTurn(
            h,
            [createPanelEvent("ticks", FX_TICKS_SPEC)],
            clock.settle,
          );
          h.app.presenters.dockPanel("ticks");
          await clock.settle();
          const warm = everySessionStream(h.app).map((stream) => {
            return collect(stream);
          });
          await clock.settle();

          for (const c of warm) {
            c.unsubscribe();
          }

          await clock.settle();
          // A positive witness first: the session left the app holding SOME
          // port stream, so a zero after dispose() is a release, not a
          // counter nobody fed.
          expect(h.driver.livePortSubscriptions()).toBeGreaterThan(0);
          await h.app.dispose();
          await clock.settle();
          expect(h.driver.livePortSubscriptions()).toBe(0);
        } finally {
          await h.teardown();
        }
      });
    });

    it("dispose() releases the transport gate: a later sign-out does not disconnect", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({ transport: true });

        try {
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          expect(h.driver.transportCalls()).toEqual(["disconnect", "connect"]);
          await h.app.dispose();
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["disconnect", "connect"]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a Jarvis turn still in flight at dispose() releases its ask", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness({ countPortStreams: true });

        try {
          h.app.presenters.jarvis.intents.send("still thinking");
          await clock.settle();
          // A positive witness first: the ask is open and unanswered.
          expect(h.driver.pendingAsks()).toEqual(["still thinking"]);
          expect(h.driver.livePortSubscriptions()).toBeGreaterThan(0);
          await h.app.dispose();
          await clock.settle();
          expect(h.driver.livePortSubscriptions()).toBe(0);
        } finally {
          await h.teardown();
        }
      });
    });

    it("a resumed session's transport gate is released by dispose(): a later sign-out does not disconnect", async () => {
      await withFakeClock(async (clock) => {
        vi.setSystemTime(NOW);
        const h = makeHarness({
          transport: true,
          session: {
            token: "stored",
            user: DEMO.user,
            username: DEMO.username,
            exp: NOW + 60_000,
          },
        });

        try {
          expect(h.driver.transportCalls()).toEqual(["connect"]);
          await h.app.dispose();
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.transportCalls()).toEqual(["connect"]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("dispose() writes a workspace-layout change still inside the persistence debounce", async () => {
      await withFakeClock(async (clock) => {
        const h1 = makeHarness();
        let stored: string | null = null;
        let maximized = "";

        try {
          const { intents } = h1.app.presenters.layoutFor("fx");
          [maximized] = leafIds(
            (await readLayout(h1, "fx", clock.settle)).root,
          );
          intents.maximize(maximized);
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS - 1);
          // A positive witness first: the debounce has not written yet, so
          // whatever lands below is dispose()'s own write.
          expect(h1.driver.storedWorkspaceLayout()).toBe(null);
          await h1.app.dispose();
          stored = h1.driver.storedWorkspaceLayout();
        } finally {
          await h1.teardown();
        }

        expect(stored).not.toBe(null);
        const h2 = makeHarness({ workspaceLayout: stored });

        try {
          expect((await readLayout(h2, "fx", clock.settle)).maximized).toBe(
            maximized,
          );
        } finally {
          await h2.teardown();
        }
      });
    });

    it("dispose() inside the debounce after a reset does not write back the pre-reset layout", async () => {
      await withFakeClock(async (clock) => {
        const h1 = makeHarness();
        let stored: string | null = null;

        try {
          const { intents } = h1.app.presenters.layoutFor("fx");
          const [a] = leafIds((await readLayout(h1, "fx", clock.settle)).root);
          // The change the reset discards is still inside the debounce when
          // the reset lands, so the write dispose() makes is the first one
          // after it: it must carry the reset's layout, not this change.
          intents.maximize(a);
          await clock.settle();
          expect((await readLayout(h1, "fx", clock.settle)).maximized).toBe(a);
          h1.app.presenters.resetWorkspaceLayout();
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS - 1);
          // A positive witness first: nothing has been written yet, so what
          // is stored below is dispose()'s own write (or none).
          expect(h1.driver.storedWorkspaceLayout()).toBe(null);
          await h1.app.dispose();
          stored = h1.driver.storedWorkspaceLayout();
        } finally {
          await h1.teardown();
        }

        expect(stored ?? "").not.toContain('"maximized":"');
        const h2 = makeHarness({ workspaceLayout: stored });

        try {
          expect((await readLayout(h2, "fx", clock.settle)).maximized).toBe(
            null,
          );
        } finally {
          await h2.teardown();
        }
      });
    });

    it("dispose() with no layout change pending writes nothing", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const { intents } = h.app.presenters.layoutFor("fx");
          const [a] = leafIds((await readLayout(h, "fx", clock.settle)).root);
          intents.maximize(a);
          await clock.advance(WORKSPACE_PERSIST_DEBOUNCE_MS);
          expect(h.driver.storedWorkspaceLayout()).toContain(
            `"maximized":"${a}"`,
          );
          const writes = collect(h.app.ports.preferences.workspaceLayout$());
          const baseline = writes.values.length;
          // The port drops a write of the value it already holds, so the
          // stored value is moved away from the live layout first: any write
          // dispose() made would land as a new value. It is also the positive
          // witness that the counter sees a write at all.
          h.app.ports.preferences.setWorkspaceLayout(null);
          expect(writes.values.length).toBe(baseline + 1);
          await h.app.dispose();
          await clock.settle();
          expect(writes.values.length).toBe(baseline + 1);
          expect(h.driver.storedWorkspaceLayout()).toBe(null);
          writes.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });

    it("dispose() resolves when called twice", async () => {
      const h = makeHarness();

      try {
        await expect(h.app.dispose()).resolves.toBeUndefined();
        await expect(h.app.dispose()).resolves.toBeUndefined();
      } finally {
        await h.teardown();
      }
    });
  });
}
