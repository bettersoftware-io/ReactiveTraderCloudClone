import { describe, expect, it } from "vitest";

import { DEFAULT_BOOT_VARIANT } from "@rtc/domain";

import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeBootPreferenceContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("current() reads the default synchronously and follows setVariant", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.bootPreference;
        // Synchronous on purpose: a `current()` that ignored the store and
        // returned a hardcoded default would still pass this line, which is
        // why the post-set read below is the one that matters.
        expect(p.current()).toBe(DEFAULT_BOOT_VARIANT);
        p.setVariant("laser");
        await settle();
        expect(p.current()).toBe("laser");
      } finally {
        await h.teardown();
      }
    });
  });
}
