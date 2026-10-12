import { describe, expect, it } from "vitest";

import { PRESENTER_MANIFEST } from "#/devtools/presenterManifest";

// What each entry names is checked against a real composition by the clients'
// devtools integration test, and against the React Native manifest by
// `pnpm check:manifest-drift`. These cases hold the two rules a manifest edit
// can break without either of those noticing.
describe("PRESENTER_MANIFEST", () => {
  it("leaves out the one-shot command presenters on purpose", () => {
    for (const name of ["execution", "rfqQuote", "bootPreference"]) {
      expect(PRESENTER_MANIFEST).not.toHaveProperty(name);
    }
  });

  it("gives every entry something to observe", () => {
    for (const [name, entry] of Object.entries(PRESENTER_MANIFEST)) {
      const observed =
        (entry.props?.length ?? 0) +
        (entry.methods?.length ?? 0) +
        (entry.machine === true ? 1 : 0);

      expect(observed, name).toBeGreaterThan(0);
    }
  });
});
