import { describe, expect, it } from "vitest";

import { canNarrate } from "#/presenters/narratorGate";

describe("canNarrate", () => {
  it("is false on an own brain whose key was refused", () => {
    expect(
      canNarrate({
        effectiveBrain: OWN,
        ownKey: { provider: "anthropic", status: "refused", capUsd: 1 },
      }),
    ).toBe(false);
  });

  it.each(["checking", "accepted", "unreachable", "limited"] as const)(
    "is true on an own brain whose key is %s",
    (status) => {
      expect(
        canNarrate({
          effectiveBrain: OWN,
          ownKey: { provider: "anthropic", status, capUsd: 1 },
        }),
      ).toBe(true);
    },
  );

  it("is true on a house brain even with a refused key on file", () => {
    expect(
      canNarrate({
        effectiveBrain: "claude-haiku-4-5",
        ownKey: { provider: "anthropic", status: "refused", capUsd: 1 },
      }),
    ).toBe(true);
  });

  it("is true with no key at all", () => {
    expect(canNarrate({ effectiveBrain: "scripted", ownKey: null })).toBe(true);
  });
});

const OWN = "own:anthropic:claude-sonnet-5";
