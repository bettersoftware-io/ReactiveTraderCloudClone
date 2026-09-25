import { describe, expect, it } from "vitest";

import {
  BOOT_DURATION_MS,
  BOOT_TICK_MS,
  BOOT_VARIANTS,
  LOGIN_WAIT_VARIANTS,
} from "@rtc/domain";

import {
  bootProgress,
  describeAuthFailure,
  nextBootVariant,
  nextLoginWaitVariant,
} from "#/presenters/shellFolds";

describe("shellFolds", () => {
  it("bootProgress runs 0 → 100 over the boot duration and clamps at 100", () => {
    const ticks = Math.ceil(BOOT_DURATION_MS / BOOT_TICK_MS);

    expect(bootProgress(0)).toBe(0);
    expect(bootProgress(Math.floor(ticks / 2))).toBe(
      Math.round((Math.floor(ticks / 2) / ticks) * 100),
    );
    expect(bootProgress(ticks)).toBe(100);
    expect(bootProgress(ticks * 10)).toBe(100);
  });

  it("nextBootVariant is the cyclic successor in BOOT_VARIANTS", () => {
    expect(nextBootVariant(BOOT_VARIANTS[0])).toBe(BOOT_VARIANTS[1]);
    expect(nextBootVariant(BOOT_VARIANTS[BOOT_VARIANTS.length - 1])).toBe(
      BOOT_VARIANTS[0],
    );
  });

  it("nextLoginWaitVariant is the cyclic successor in LOGIN_WAIT_VARIANTS", () => {
    expect(nextLoginWaitVariant(LOGIN_WAIT_VARIANTS[0])).toBe(
      LOGIN_WAIT_VARIANTS[1],
    );
    expect(
      nextLoginWaitVariant(LOGIN_WAIT_VARIANTS[LOGIN_WAIT_VARIANTS.length - 1]),
    ).toBe(LOGIN_WAIT_VARIANTS[0]);
  });

  it("describeAuthFailure names each failure reason", () => {
    expect(describeAuthFailure("invalid")).toBe("Invalid credentials");
    expect(describeAuthFailure("unavailable")).toBe("Service unavailable");
  });
});
