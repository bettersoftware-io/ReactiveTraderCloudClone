import { describe, expect, it } from "vitest";

import { PRESENTER_MANIFEST } from "#/devtools/presenterManifest";

describe("PRESENTER_MANIFEST", () => {
  it("names the stream members the ViewModel binds, per presenter", () => {
    expect(PRESENTER_MANIFEST.priceStream).toEqual({ methods: ["price$"] });
    expect(PRESENTER_MANIFEST.blotter).toEqual({
      props: ["trades$", "newTradeIds$", "activity$"],
    });
    expect(PRESENTER_MANIFEST.rfqs).toEqual({
      props: ["rfqs$", "allQuotes$"],
      methods: ["quotesForRfq$"],
    });
    expect(PRESENTER_MANIFEST.connection).toEqual({ props: ["status$"] });
  });

  it("marks the shared machine seams", () => {
    expect(PRESENTER_MANIFEST.incident).toEqual({ machine: true });
    expect(PRESENTER_MANIFEST.eqWorkspace).toEqual({ machine: true });
  });

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
