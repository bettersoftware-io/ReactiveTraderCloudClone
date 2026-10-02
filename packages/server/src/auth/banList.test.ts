import { describe, expect, it, type Mock, vi } from "vitest";

import {
  type BanListOptions,
  createBanList,
  STRIKE_WEIGHT,
  type StrikeReason,
} from "#/auth/banList";

describe("banList", () => {
  it("weights each kind of misbehaviour: a wrong password is cheap, scripted abuse is not", () => {
    expect(STRIKE_WEIGHT).toEqual<Readonly<Record<StrikeReason, number>>>({
      "login-failed": 1,
      "login-rate-limited": 2,
      "frame-too-large": 3,
      "message-flood": 3,
    });
  });

  it("bans after strikesToBan weighted strikes inside the window, and reports it once", () => {
    const onBan = createOnBan();
    const bans = createBanList(createOptions({ onBan }));

    expect(bans.strike("1.2.3.4", "login-failed", 0)).toBe(false);
    expect(bans.strike("1.2.3.4", "login-failed", 10)).toBe(false);
    expect(bans.strike("1.2.3.4", "frame-too-large", 20)).toBe(true);
    expect(bans.isBanned("1.2.3.4", 21)).toBe(true);
    expect(bans.bannedUntil("1.2.3.4", 21)).toBe(20 + FIFTEEN_MINUTES);
    expect(onBan).toHaveBeenCalledTimes(1);
    expect(onBan).toHaveBeenCalledWith(
      "1.2.3.4",
      20 + FIFTEEN_MINUTES,
      "frame-too-large",
    );
  });

  it("forgets strikes once the window has passed", () => {
    const bans = createBanList(createOptions());

    bans.strike("1.2.3.4", "login-failed", 0);
    bans.strike("1.2.3.4", "login-failed", 0);
    bans.strike("1.2.3.4", "login-failed", 0);
    bans.strike("1.2.3.4", "login-failed", 0);

    expect(bans.strike("1.2.3.4", "login-failed", TEN_MINUTES + 1)).toBe(false);
    expect(bans.isBanned("1.2.3.4", TEN_MINUTES + 2)).toBe(false);
  });

  it("lifts the ban when it expires and does not extend it on further strikes", () => {
    const bans = createBanList(createOptions({ strikesToBan: 1 }));

    bans.strike("1.2.3.4", "login-failed", 0);

    expect(bans.strike("1.2.3.4", "login-failed", 1)).toBe(false);
    expect(bans.bannedUntil("1.2.3.4", 1)).toBe(FIFTEEN_MINUTES);
    expect(bans.isBanned("1.2.3.4", FIFTEEN_MINUTES)).toBe(false);
    expect(bans.bannedUntil("1.2.3.4", FIFTEEN_MINUTES)).toBeNull();
  });

  it("a strike on a banned IP does not extend the ban and does not call onBan again", () => {
    const onBan = createOnBan();
    const bans = createBanList(createOptions({ strikesToBan: 1, onBan }));

    expect(bans.strike("1.2.3.4", "login-failed", 0)).toBe(true);
    expect(bans.strike("1.2.3.4", "message-flood", 1_000)).toBe(false);
    expect(bans.strike("1.2.3.4", "message-flood", 2_000)).toBe(false);

    expect(bans.bannedUntil("1.2.3.4", 2_001)).toBe(FIFTEEN_MINUTES);
    expect(onBan).toHaveBeenCalledTimes(1);
  });

  it("bounds the table: expired entries are swept, then the oldest goes", () => {
    const bans = createBanList(
      createOptions({ maxEntries: 2, strikesToBan: 1 }),
    );

    bans.strike("a", "login-failed", 0);
    bans.strike("b", "login-failed", 1);
    bans.strike("c", "login-failed", 2);

    expect(bans.size()).toBe(2);
    expect(bans.isBanned("a", 3)).toBe(false);
    expect(bans.isBanned("b", 3)).toBe(true);
    expect(bans.isBanned("c", 3)).toBe(true);
  });

  it("sweeps expired entries before evicting a live one", () => {
    const bans = createBanList(
      createOptions({ maxEntries: 2, strikesToBan: 1 }),
    );

    bans.strike("a", "login-failed", 0);
    bans.strike("b", "login-failed", FIFTEEN_MINUTES + 1);
    bans.strike("c", "login-failed", FIFTEEN_MINUTES + 2);

    expect(bans.size()).toBe(2);
    expect(bans.isBanned("b", FIFTEEN_MINUTES + 3)).toBe(true);
    expect(bans.isBanned("c", FIFTEEN_MINUTES + 3)).toBe(true);
  });
});

const TEN_MINUTES = 10 * 60_000;
const FIFTEEN_MINUTES = 15 * 60_000;

function createOptions(
  overrides: Partial<BanListOptions> = {},
): BanListOptions {
  return {
    strikesToBan: 5,
    strikeWindowMs: TEN_MINUTES,
    banMs: FIFTEEN_MINUTES,
    maxEntries: 100,
    ...overrides,
  };
}

function createOnBan(): Mock<NonNullable<BanListOptions["onBan"]>> {
  return vi.fn<NonNullable<BanListOptions["onBan"]>>();
}
