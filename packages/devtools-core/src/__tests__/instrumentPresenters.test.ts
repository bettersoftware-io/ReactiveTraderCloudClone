import type { Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import { instrumentPresenters } from "../instrument/presenters";
import type { PresenterManifest } from "../protocol";
import { FakeBlotter } from "./FakeBlotter.testHelpers";
import { FakeOrderTicket } from "./FakeOrderTicket.testHelpers";
import { FakePriceStream } from "./FakePriceStream.testHelpers";

describe("instrumentPresenters", () => {
  it("registers a manifest-listed observable prop with the hub, same reference", () => {
    const hub = new DevtoolsHub();
    const registerStream = vi.spyOn(hub, "registerStream");
    const blotter = new FakeBlotter();
    const manifest: PresenterManifest = { blotter: { props: ["trades$"] } };

    const out = instrumentPresenters({ blotter }, manifest, hub);

    expect(registerStream).toHaveBeenCalledWith(
      "blotter.trades$",
      blotter.trades$,
    );
    expect(out.blotter.trades$).toBe(blotter.trades$);
  });

  it("registers a distinct child stream per arg tuple exactly once, preserving `this`", () => {
    const hub = new DevtoolsHub();
    const registerStream = vi.spyOn(hub, "registerStream");
    const priceStream = new FakePriceStream();
    const manifest: PresenterManifest = {
      priceStream: { methods: ["price$"] },
    };

    const out = instrumentPresenters({ priceStream }, manifest, hub);

    const first = out.priceStream.price$("EURUSD");
    const second = out.priceStream.price$("EURUSD");
    const other = out.priceStream.price$("GBPUSD");

    // `this` still works: same underlying observable returned both times
    // because the private `cache` map inside the real instance was hit.
    expect(second).toBe(first);
    expect(other).not.toBe(first);

    // argsKey JSON-stringifies the whole args tuple (already bracketed), and
    // that gets wrapped in another `[...]` by the id template — so a single
    // string arg nests two bracket pairs. This is the verbatim brief
    // implementation's id shape, not a typo in this test.
    const priceRegistrations = registerStream.mock.calls.filter(([id]) => {
      return id === 'priceStream.price$[["EURUSD"]]';
    });
    expect(priceRegistrations).toHaveLength(1);
    expect(priceRegistrations[0]?.[1]).toBe(first);

    expect(registerStream).toHaveBeenCalledWith(
      'priceStream.price$[["GBPUSD"]]',
      other,
    );
  });

  it("registers machine entries via machineCreated and proxies intents through machineIntent", () => {
    const hub = new DevtoolsHub();
    const machineCreated = vi.spyOn(hub, "machineCreated");
    const machineIntent = vi.spyOn(hub, "machineIntent");
    const orderTicket = new FakeOrderTicket();
    const manifest: PresenterManifest = {
      orderTicket: { machine: true },
    };

    const out = instrumentPresenters({ orderTicket }, manifest, hub);

    expect(machineCreated).toHaveBeenCalledWith(
      "orderTicket",
      [],
      orderTicket.state$,
    );
    expect(out.orderTicket.state$).toBe(orderTicket.state$);

    out.orderTicket.intents.submit("arg1");
    expect(orderTicket.intents.submit).toHaveBeenCalledWith("arg1");
    expect(machineIntent).toHaveBeenCalledWith(expect.any(String), "submit", [
      "arg1",
    ]);
  });

  it("passes non-manifest presenters and non-manifest properties through untouched", () => {
    const hub = new DevtoolsHub();
    const blotter = new FakeBlotter();
    const priceStream = new FakePriceStream();
    const manifest: PresenterManifest = { blotter: { props: ["trades$"] } };

    const out = instrumentPresenters({ blotter, priceStream }, manifest, hub);

    expect(out.priceStream).toBe(priceStream);
    expect(out.blotter.untracked$).toBe(blotter.untracked$);
  });

  it("still returns the real result when the hub throws during registration", () => {
    const hub = new DevtoolsHub();
    vi.spyOn(hub, "registerStream").mockImplementation(() => {
      throw new Error("boom");
    });
    const priceStream = new FakePriceStream();
    const manifest: PresenterManifest = {
      priceStream: { methods: ["price$"] },
    };

    const out = instrumentPresenters({ priceStream }, manifest, hub);

    let result: Observable<number> | undefined;
    expect(() => {
      result = out.priceStream.price$("EURUSD");
    }).not.toThrow();
    expect(result).toBeDefined();
  });
});
