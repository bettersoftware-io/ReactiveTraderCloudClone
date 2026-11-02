import { describe, expect, it } from "vitest";

import type { JarvisOwnKeyStatus, JarvisOwnKeyView } from "@rtc/domain";

import {
  describeOwnKeyStatus,
  isOwnKeyTroubled,
  parseOwnKeyCap,
} from "./ownKeyCopy.js";

describe("describeOwnKeyStatus", () => {
  it("words each status the server can report", () => {
    expect(describeOwnKeyStatus(view("checking"), "anthropic")).toBe(
      "Checking…",
    );
    expect(describeOwnKeyStatus(view("accepted"), "anthropic")).toBe(
      "Accepted",
    );
    expect(describeOwnKeyStatus(view("refused"), "anthropic")).toBe(
      "Anthropic refused this key",
    );
    expect(describeOwnKeyStatus(view("unreachable"), "anthropic")).toBe(
      "Couldn't reach Anthropic. Try again shortly.",
    );
    expect(describeOwnKeyStatus(view("limited"), "anthropic")).toBe(
      "Too many checks. Try again later.",
    );
  });

  it("reads a key the server has not reported on yet as still being checked", () => {
    expect(describeOwnKeyStatus(null, "openai")).toBe("Checking…");
  });

  it("names the provider the key belongs to", () => {
    expect(describeOwnKeyStatus(view("refused"), "openrouter")).toBe(
      "OpenRouter refused this key",
    );
  });
});

describe("parseOwnKeyCap", () => {
  it("takes a positive amount up to the largest cap and nothing else", () => {
    expect(parseOwnKeyCap("2.5")).toBe(2.5);
    expect(parseOwnKeyCap(" 1000 ")).toBe(1000);
    expect(parseOwnKeyCap("1000.01")).toBeNull();
    expect(parseOwnKeyCap("0")).toBeNull();
    expect(parseOwnKeyCap("-3")).toBeNull();
    expect(parseOwnKeyCap("")).toBeNull();
    expect(parseOwnKeyCap("  ")).toBeNull();
    expect(parseOwnKeyCap("abc")).toBeNull();
    expect(parseOwnKeyCap("Infinity")).toBeNull();
  });
});

describe("isOwnKeyTroubled", () => {
  it("is true for refused, unreachable and limited, false for the rest", () => {
    function status(value: JarvisOwnKeyStatus): boolean {
      return isOwnKeyTroubled(view(value));
    }

    expect(status("refused")).toBe(true);
    expect(status("unreachable")).toBe(true);
    expect(status("limited")).toBe(true);
    expect(status("checking")).toBe(false);
    expect(status("accepted")).toBe(false);
    expect(isOwnKeyTroubled(null)).toBe(false);
  });
});

function view(status: JarvisOwnKeyStatus): JarvisOwnKeyView {
  return { provider: "anthropic", status, capUsd: 1 };
}
