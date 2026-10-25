import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_JARVIS_HOUSE_DAILY_USD,
  DEFAULT_JARVIS_USER_DAILY_USD,
  parseJarvisBudgetConfig,
} from "./jarvisBudgetConfig.js";

describe("parseJarvisBudgetConfig", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the defaults with an empty env, silently", () => {
    expect(parseJarvisBudgetConfig({})).toEqual({
      userDailyUsd: DEFAULT_JARVIS_USER_DAILY_USD,
      houseDailyUsd: DEFAULT_JARVIS_HOUSE_DAILY_USD,
      forceExhausted: false,
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("publishes the documented default values", () => {
    expect(DEFAULT_JARVIS_USER_DAILY_USD).toBe(0.2);
    expect(DEFAULT_JARVIS_HOUSE_DAILY_USD).toBe(3);
  });

  it("parses the user and house daily limits", () => {
    const config = parseJarvisBudgetConfig({
      RTC_JARVIS_USER_DAILY_USD: "0.5",
      RTC_JARVIS_HOUSE_DAILY_USD: "10",
    });

    expect(config.userDailyUsd).toBe(0.5);
    expect(config.houseDailyUsd).toBe(10);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("accepts zero as a valid limit", () => {
    const config = parseJarvisBudgetConfig({
      RTC_JARVIS_USER_DAILY_USD: "0",
      RTC_JARVIS_HOUSE_DAILY_USD: "0",
    });

    expect(config.userDailyUsd).toBe(0);
    expect(config.houseDailyUsd).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["RTC_JARVIS_USER_DAILY_USD", "-1", DEFAULT_JARVIS_USER_DAILY_USD],
    ["RTC_JARVIS_USER_DAILY_USD", "abc", DEFAULT_JARVIS_USER_DAILY_USD],
    ["RTC_JARVIS_USER_DAILY_USD", "", DEFAULT_JARVIS_USER_DAILY_USD],
    ["RTC_JARVIS_HOUSE_DAILY_USD", "-1", DEFAULT_JARVIS_HOUSE_DAILY_USD],
    ["RTC_JARVIS_HOUSE_DAILY_USD", "abc", DEFAULT_JARVIS_HOUSE_DAILY_USD],
    ["RTC_JARVIS_HOUSE_DAILY_USD", "", DEFAULT_JARVIS_HOUSE_DAILY_USD],
  ])(
    "warns naming %s and uses the default for malformed %j",
    (name: string, value: string, fallback: number) => {
      const config = parseJarvisBudgetConfig({ [name]: value });

      const field =
        name === "RTC_JARVIS_USER_DAILY_USD" ? "userDailyUsd" : "houseDailyUsd";
      expect(config[field]).toBe(fallback);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(`malformed ${name} "${value}", using default`),
      );
    },
  );

  it("forces exhaustion on RTC_JARVIS_FORCE_GATE=exhausted", () => {
    expect(
      parseJarvisBudgetConfig({ RTC_JARVIS_FORCE_GATE: "exhausted" })
        .forceExhausted,
    ).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("treats an empty RTC_JARVIS_FORCE_GATE as unset, silently", () => {
    expect(
      parseJarvisBudgetConfig({ RTC_JARVIS_FORCE_GATE: "" }).forceExhausted,
    ).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each(["soft", "hard"])(
    "warns that RTC_JARVIS_FORCE_GATE=%s is retired and gives false",
    (value: string) => {
      expect(
        parseJarvisBudgetConfig({ RTC_JARVIS_FORCE_GATE: value })
          .forceExhausted,
      ).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("retired"),
      );
    },
  );

  it("warns malformed and gives false for any other RTC_JARVIS_FORCE_GATE value", () => {
    expect(
      parseJarvisBudgetConfig({ RTC_JARVIS_FORCE_GATE: "bogus" })
        .forceExhausted,
    ).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'malformed RTC_JARVIS_FORCE_GATE "bogus", using default',
      ),
    );
  });
});
