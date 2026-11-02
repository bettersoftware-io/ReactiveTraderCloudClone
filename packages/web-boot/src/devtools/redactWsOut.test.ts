import { describe, expect, it } from "vitest";

import { redactWsOut } from "#/devtools/redactWsOut";

describe("redactWsOut", () => {
  it("replaces a jarvis.key set payload with its action and a redacted flag", () => {
    expect(
      redactWsOut("jarvis.key", {
        action: "set",
        provider: "anthropic",
        key: "sk-ant-SECRET",
        capUsd: 1,
      }),
    ).toEqual({ action: "set", redacted: true });
  });

  it("redacts a jarvis.key frame whatever its shape, leaking nothing", () => {
    expect(
      JSON.stringify(redactWsOut("jarvis.key", "sk-ant-SECRET")),
    ).not.toContain("SECRET");
    expect(redactWsOut("jarvis.key", undefined)).toEqual({ redacted: true });
    expect(redactWsOut("jarvis.key", { action: "clear" })).toEqual({
      action: "clear",
      redacted: true,
    });
  });

  it("passes every other frame through untouched", () => {
    const payload = { text: "hi" };

    expect(redactWsOut("jarvis.chat", payload)).toBe(payload);
  });
});
