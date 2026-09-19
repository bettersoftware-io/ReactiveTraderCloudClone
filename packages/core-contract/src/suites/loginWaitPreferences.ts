import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
} from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeLoginWaitPreferencesContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("style$ and delay$ replay their defaults synchronously and follow their own setters independently", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.loginWaitPreferences;
        const style = collect(p.style$);
        const delay = collect(p.delay$);
        expect(style.values).toEqual([DEFAULT_LOGIN_WAIT_STYLE]);
        expect(delay.values).toEqual([DEFAULT_LOGIN_WAIT_DELAY]);
        p.setStyle("reactor");
        await settle();
        expect(style.values.at(-1)).toBe("reactor");
        // Setting one does not emit on the other.
        expect(delay.values).toHaveLength(1);
        p.setDelay("3s");
        await settle();
        expect(delay.values.at(-1)).toBe("3s");
        style.unsubscribe();
        delay.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays each current value synchronously, not the history", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.loginWaitPreferences;
        p.setStyle("reactor");
        p.setDelay("3s");
        await settle();
        const style = collect(p.style$);
        const delay = collect(p.delay$);
        expect(style.values).toEqual(["reactor"]);
        expect(delay.values).toEqual(["3s"]);
        style.unsubscribe();
        delay.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
