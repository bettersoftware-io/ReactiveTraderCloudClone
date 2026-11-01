import { describe, expect, it, vi } from "vitest";

import type {
  OwnKeyInput,
  SavedOwnKey,
  StoredOwnKey,
  StoredSession,
} from "@rtc/core-api";
import { ROSTER } from "@rtc/domain";

import { type FakeClock, withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import type { HarnessSeed } from "#/harness/scriptedPorts";
import { DEMO, NOW, signIn } from "#/suites/sessionKit";

const KEY = "sk-ant-api03-abcdefghij1234";
const NEXT_KEY = "sk-or-v1-abcdefghijklmnop9876";
const OWNER: string = DEMO.user.email;
const OTHER_OWNER: string = ROSTER[1].user.email;
const INPUT: OwnKeyInput = {
  provider: "anthropic",
  key: KEY,
  capUsd: 2,
  remember: true,
};
const SETTING = { provider: "anthropic", key: KEY, capUsd: 2 } as const;
const SAVED: SavedOwnKey = {
  provider: "anthropic",
  masked: "sk-ant-…1234",
  capUsd: 2,
  remember: true,
};

/** `presenters.jarvisOwnKey`: the person's own model key. A shell over the
 * shared `createOwnKeyController`, so these cases pin what each core must
 * bring itself: the fold of `auth.state$` into it, owned by the composition
 * and not by a subscriber (the owner is the signed-in email; anything but
 * `authenticated` is nobody), the masked `saved$`, the order against the
 * transport, and what a dispose leaves. The rules of the fold's steps are
 * `@rtc/core-logic`'s own tests. */
export function describeJarvisOwnKeyContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  async function withHarness(
    seed: HarnessSeed,
    body: (h: CoreHarness, clock: FakeClock) => Promise<void>,
  ): Promise<void> {
    await withFakeClock(async (clock) => {
      vi.setSystemTime(NOW);
      const h = makeHarness(seed);

      try {
        await body(h, clock);
      } finally {
        await h.teardown();
      }
    });
  }

  describe(label, () => {
    it("a save stores the key, sends it, and saved$ shows only the masked form", async () => {
      await withHarness(
        { session: createSession(), ownKey: {} },
        async (h, clock) => {
          const p = h.app.presenters.jarvisOwnKey;
          const saved = collect(p.saved$);
          const returned: unknown = p.save(INPUT);
          await clock.settle();
          expect(returned).toBeUndefined();
          expect(saved.values).toEqual([null, SAVED]);
          expect(h.driver.storedOwnKey()).toEqual({ owner: OWNER, ...INPUT });
          expect(h.driver.ownKeySends()).toEqual([SETTING]);
          saved.unsubscribe();
        },
      );
    });

    it("saved$ never carries the raw key", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const p = h.app.presenters.jarvisOwnKey;
          const saved = collect(p.saved$);
          p.setCap(5);
          await clock.settle();
          p.save({ ...INPUT, key: NEXT_KEY });
          await clock.settle();
          p.remove();
          await clock.settle();
          h.app.presenters.auth.logout();
          await clock.settle();
          // A positive witness: the two keys went through, masked.
          expect(saved.values).toHaveLength(4);
          expect(saved.errors).toEqual([]);

          for (const value of saved.values) {
            const json = JSON.stringify(value);
            expect(json).not.toContain(KEY);
            expect(json).not.toContain(NEXT_KEY);
          }

          saved.unsubscribe();
        },
      );
    });

    it("saved$ replays the latest value to a late subscriber", async () => {
      await withHarness(
        { session: createSession(), ownKey: {} },
        async (h, clock) => {
          const p = h.app.presenters.jarvisOwnKey;
          p.save(INPUT);
          await clock.settle();
          const late = collect(p.saved$);
          expect(late.values).toEqual([SAVED]);
          late.unsubscribe();
        },
      );
    });

    it("signing in restores a stored key for that owner and sends it", async () => {
      await withHarness(
        { ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          expect(saved.values).toEqual([null, SAVED]);
          expect(h.driver.ownKeySends()).toEqual([SETTING]);
          saved.unsubscribe();
        },
      );
    });

    it("a resumed session restores the key at composition", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          expect(h.driver.ownKeySends()).toEqual([SETTING]);
          await clock.settle();
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          expect(saved.values).toEqual([SAVED]);
          saved.unsubscribe();
        },
      );
    });

    it("sign-out wipes the store and saved$ goes null", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.storedOwnKey()).toBe(null);
          expect(h.driver.ownKeySends()).toEqual([SETTING, null]);
          expect(saved.values).toEqual([SAVED, null]);
          saved.unsubscribe();
        },
      );
    });

    it("sign-out wipes with nobody subscribed: the fold is the composition's", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.storedOwnKey()).toBe(null);
          expect(h.driver.ownKeySends()).toEqual([SETTING, null]);
        },
      );
    });

    it("a server-ended session wipes as a sign-out does", async () => {
      await withHarness(
        {
          transport: true,
          session: createSession(),
          ownKey: { stored: createStored(OWNER) },
        },
        async (h, clock) => {
          h.driver.endSession();
          await clock.settle();
          expect(h.driver.storedOwnKey()).toBe(null);
          expect(h.driver.ownKeySends()).toEqual([SETTING, null]);
        },
      );
    });

    it("signing in as someone else wipes the other owner's key", async () => {
      await withHarness(
        { ownKey: { stored: createStored(OTHER_OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          expect(h.driver.storedOwnKey()).toBe(null);
          expect(h.driver.ownKeySends()).toEqual([]);
          expect(saved.values).toEqual([null]);
          saved.unsubscribe();
        },
      );
    });

    it("the first unauthenticated reading wipes nothing", async () => {
      await withHarness(
        { ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          await clock.settle();
          expect(h.driver.storedOwnKey()).toEqual(createStored(OWNER));
          expect(h.driver.ownKeySends()).toEqual([]);
          expect(saved.values).toEqual([null]);
          saved.unsubscribe();
        },
      );
    });

    it("a failed sign-in wipes nothing", async () => {
      await withHarness(
        { ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          h.app.presenters.auth.login(DEMO.username, "wrong");
          await clock.settle();
          h.driver.resolveLogin({ ok: false, reason: "invalid" });
          await clock.settle();
          expect(h.driver.storedOwnKey()).toEqual(createStored(OWNER));
          expect(h.driver.ownKeySends()).toEqual([]);
        },
      );
    });

    it("a lock and an unlock send nothing, wipe nothing, and saved$ stays put", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          h.app.presenters.auth.lock();
          await clock.settle();
          h.app.presenters.auth.unlock("pw");
          await clock.settle();
          h.driver.resolveLogin({
            ok: true,
            token: "tok",
            user: DEMO.user,
            exp: NOW + 60_000,
          });
          await clock.settle();
          expect(h.driver.ownKeySends()).toEqual([SETTING]);
          expect(h.driver.storedOwnKey()).toEqual(createStored(OWNER));
          expect(saved.values).toEqual([SAVED]);
          saved.unsubscribe();
        },
      );
    });

    it("setCap resends with the new cap and keeps the key", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          h.app.presenters.jarvisOwnKey.setCap(null);
          await clock.settle();
          expect(h.driver.ownKeySends()).toEqual([
            SETTING,
            { ...SETTING, capUsd: null },
          ]);
          expect(h.driver.storedOwnKey()).toEqual({
            ...createStored(OWNER),
            capUsd: null,
          });
          expect(saved.values).toEqual([SAVED, { ...SAVED, capUsd: null }]);
          saved.unsubscribe();
        },
      );
    });

    it("remove clears the store and sends clear", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          h.app.presenters.jarvisOwnKey.remove();
          await clock.settle();
          expect(h.driver.storedOwnKey()).toBe(null);
          expect(h.driver.ownKeySends()).toEqual([SETTING, null]);
          expect(saved.values).toEqual([SAVED, null]);
          saved.unsubscribe();
        },
      );
    });

    it("with nobody signed in the intents do nothing, and a remembered key survives", async () => {
      await withHarness(
        { ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const p = h.app.presenters.jarvisOwnKey;
          const saved = collect(p.saved$);
          p.save({ ...INPUT, key: NEXT_KEY });
          await clock.settle();
          p.setCap(9);
          await clock.settle();
          p.remove();
          await clock.settle();
          expect(h.driver.storedOwnKey()).toEqual(createStored(OWNER));
          expect(h.driver.ownKeySends()).toEqual([]);
          expect(saved.values).toEqual([null]);
          saved.unsubscribe();
        },
      );
    });

    it("a key change reaches the transport's owner before the socket opens or closes", async () => {
      await withHarness(
        { transport: true, ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          await signIn(h.app, h.driver.resolveLogin, clock.settle);
          expect(h.driver.wireCalls()).toEqual([
            "disconnect",
            "setOwnKey",
            "connect",
          ]);
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.wireCalls()).toEqual([
            "disconnect",
            "setOwnKey",
            "connect",
            "setOwnKey",
            "disconnect",
          ]);
        },
      );
    });

    it("a recomposition resumes with the key and sends it once", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          expect(h.driver.ownKeySends()).toEqual([SETTING]);
          const b = await h.recompose();
          await clock.settle();
          expect(h.driver.ownKeySends()).toEqual([SETTING, SETTING]);
          expect(h.driver.storedOwnKey()).toEqual(createStored(OWNER));
          const saved = collect(b.presenters.jarvisOwnKey.saved$);
          expect(saved.values).toEqual([SAVED]);
          saved.unsubscribe();
        },
      );
    });

    it("dispose wipes nothing, and a disposed fold hears no more", async () => {
      await withHarness(
        { session: createSession(), ownKey: { stored: createStored(OWNER) } },
        async (h, clock) => {
          const saved = collect(h.app.presenters.jarvisOwnKey.saved$);
          await h.app.dispose();
          await clock.settle();
          expect(h.driver.storedOwnKey()).toEqual(createStored(OWNER));
          expect(h.driver.ownKeySends()).toEqual([SETTING]);
          expect(saved.values).toEqual([SAVED]);
          // Deliberately on the disposed app: a fold its dispose left running
          // would wipe the key the next composition is about to resume with.
          h.app.presenters.auth.logout();
          await clock.settle();
          expect(h.driver.storedOwnKey()).toEqual(createStored(OWNER));
          expect(h.driver.ownKeySends()).toEqual([SETTING]);
          saved.unsubscribe();
        },
      );
    });

    it("with no store the key is held for the session", async () => {
      await withHarness(
        { session: createSession(), ownKey: { noStore: true } },
        async (h, clock) => {
          const p = h.app.presenters.jarvisOwnKey;
          const saved = collect(p.saved$);
          p.save(INPUT);
          await clock.settle();
          p.setCap(3);
          await clock.settle();
          expect(h.driver.ownKeySends()).toEqual([
            SETTING,
            { ...SETTING, capUsd: 3 },
          ]);
          expect(saved.values).toEqual([null, SAVED, { ...SAVED, capUsd: 3 }]);
          saved.unsubscribe();
        },
      );
    });

    it("without a transport that takes a key every member is a no-op and saved$ stays null", async () => {
      await withHarness({ session: createSession() }, async (h, clock) => {
        const p = h.app.presenters.jarvisOwnKey;
        const saved = collect(p.saved$);
        p.save(INPUT);
        await clock.settle();
        p.setCap(3);
        await clock.settle();
        p.remove();
        await clock.settle();
        h.app.presenters.auth.logout();
        await clock.settle();
        expect(saved.values).toEqual([null]);
        expect(saved.errors).toEqual([]);
        saved.unsubscribe();
      });
    });
  });
}

function createStored(owner: string): StoredOwnKey {
  return { owner, ...INPUT };
}

function createSession(): StoredSession {
  return {
    token: "stored",
    user: DEMO.user,
    username: DEMO.username,
    exp: NOW + 60_000,
  };
}
