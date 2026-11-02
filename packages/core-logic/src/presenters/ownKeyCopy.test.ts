import { describe, expect, it } from "vitest";

import type { JarvisOwnKeyStatus, JarvisOwnKeyView } from "@rtc/domain";

import { describeOwnKeyStatus } from "./ownKeyCopy.js";

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

function view(status: JarvisOwnKeyStatus): JarvisOwnKeyView {
  return { provider: "anthropic", status, capUsd: 1 };
}
