import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { BootPreferencePresenter } from "../BootPreferencePresenter";
import { createCountingPort } from "../createCountingPort.testHelpers";

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
    const { port, calls } = createCountingPort(
      new PreferencesSimulator(),
      "bootVariant$",
    );
    const presenter = new BootPreferencePresenter(port);

    presenter.current();
    presenter.current();

    expect(calls()).toBe(1);
  });
});
