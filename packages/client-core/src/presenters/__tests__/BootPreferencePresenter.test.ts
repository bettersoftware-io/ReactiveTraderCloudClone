import { describe, expect, it } from "vitest";

import { type PreferencesPort, PreferencesSimulator } from "@rtc/domain";

import { BootPreferencePresenter } from "../BootPreferencePresenter";

describe("BootPreferencePresenter", () => {
  it("current() reads the persisted boot variant synchronously", () => {
    const presenter = new BootPreferencePresenter(
      new PreferencesSimulator({ bootVariant: "laser" }),
    );
    expect(presenter.current()).toBe("laser");
  });

  it("setVariant persists the new variant", () => {
    const prefs = new PreferencesSimulator({ bootVariant: "core" });
    const presenter = new BootPreferencePresenter(prefs);

    presenter.setVariant("docking");

    expect(presenter.current()).toBe("docking");
  });

  it("current() twice calls bootVariant$() once (the stream is captured at construction)", () => {
    const { port, callCount } = createCountingBootVariantPort();
    const presenter = new BootPreferencePresenter(port);

    presenter.current();
    presenter.current();

    expect(callCount()).toBe(1);
  });
});

/** A `PreferencesPort` fake whose `bootVariant$()` call count is
 * observable. */
interface CountingBootVariantPort {
  readonly port: PreferencesPort;
  readonly callCount: () => number;
}

/** Wraps a real `PreferencesSimulator` so `bootVariant$()` calls are
 * counted — a Proxy rather than a spread, since the simulator's methods
 * live on its prototype and a spread would drop them. */
function createCountingBootVariantPort(): CountingBootVariantPort {
  const sim = new PreferencesSimulator();
  let calls = 0;
  const port = new Proxy(sim, {
    get: (
      target: PreferencesSimulator,
      prop: string | symbol,
      receiver: unknown,
    ): unknown => {
      const value = Reflect.get(target, prop, receiver);

      if (prop === "bootVariant$" && typeof value === "function") {
        return (...args: unknown[]) => {
          calls += 1;
          return Reflect.apply(
            value as (...a: unknown[]) => unknown,
            target,
            args,
          );
        };
      }

      return value;
    },
  });
  return {
    port,
    callCount: () => {
      return calls;
    },
  };
}
