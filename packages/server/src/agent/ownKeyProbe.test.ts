import { afterEach, describe, expect, it, vi } from "vitest";

import { type JarvisProvider, ownModelsFor } from "@rtc/domain";

import {
  createFakeAnthropicProviderFailingOnce,
  createFakeChatProvider,
  type FakeChatProviderOptions,
} from "./fakeChatProvider.testHelpers.js";
import { PROBE_TOOL_NAME, probeOwnKey } from "./ownKeyProbe.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("probeOwnKey", () => {
  it("passes every listed OpenAI model that completes a tool-calling turn, and never prints the key", async () => {
    const run = await probeWith("openai", { toolName: PROBE_TOOL_NAME });

    expect(run.passed).toBe(true);
    expect(run.output).toContain(
      "key check: GET https://api.openai.com/v1/models -> 200 accepted",
    );

    for (const model of ownModelsFor("openai")) {
      expect(run.output).toContain(`PASS ${model.brain}`);
    }

    expect(run.output).not.toContain(KEY);
  });

  it("confirms OpenRouter's key-check path and shows the cost it reported", async () => {
    const run = await probeWith("openrouter", {
      toolName: PROBE_TOOL_NAME,
      reportedCostUsd: 0.0007,
    });

    expect(run.passed).toBe(true);
    expect(run.output).toContain(
      "key check: GET https://openrouter.ai/api/v1/key -> 200 accepted",
    );
    expect(run.output).toContain("booked $0.001400");
    expect(run.output).not.toContain(KEY);
  });

  it("fails a model whose reply spent reasoning tokens", async () => {
    const run = await probeWith("openai", {
      toolName: PROBE_TOOL_NAME,
      reasoningTokens: 64,
    });

    expect(run.passed).toBe(false);
    expect(run.output).toContain("FAIL own:openai:gpt-6-luna");
    // 64 on each of its two replies.
    expect(run.output).toContain("128 reasoning tokens");
  });

  it("fails a model that never gets the probe tool's answer back", async () => {
    const run = await probeWith("openai", { toolName: "some_other_tool" });

    expect(run.passed).toBe(false);
    expect(run.output).toContain("FAIL own:openai:gpt-6-luna");
    expect(run.output).toContain("the probe tool never ran");
  });

  it("reports a refused turn's status and error type, never its message or the key", async () => {
    const run = await probeWith("openai", {
      toolName: PROBE_TOOL_NAME,
      failWith: {
        status: 429,
        body: {
          error: {
            type: "insufficient_quota",
            code: "insufficient_quota",
            message: `${SECRET_TEXT} for ${KEY}`,
          },
        },
      },
    });

    expect(run.passed).toBe(false);
    expect(run.output).toContain(
      "FAIL own:openai:gpt-6-luna: status 429, type insufficient_quota, code insufficient_quota",
    );
    expect(run.output).not.toContain(SECRET_TEXT);
    expect(run.output).not.toContain(KEY);
  });

  it("shows what Anthropic answers a key low on credit: its status and error type", async () => {
    const run = await probeWith("anthropic", {
      toolName: PROBE_TOOL_NAME,
      failWith: {
        status: 400,
        body: {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: `Your credit balance is too low. ${SECRET_TEXT} ${KEY}`,
          },
        },
      },
    });

    expect(run.passed).toBe(false);

    for (const model of ownModelsFor("anthropic")) {
      expect(run.output).toContain(
        `FAIL ${model.brain}: status 400, type invalid_request_error`,
      );
    }

    expect(run.output).not.toContain(SECRET_TEXT);
    expect(run.output).not.toContain("credit balance");
    expect(run.output).not.toContain(KEY);
  });

  it("passes a model whose request failed once and succeeded on the SDK's retry", async () => {
    const provider = createFakeAnthropicProviderFailingOnce(PROBE_TOOL_NAME);
    const lines: string[] = [];

    const passed = await probeOwnKey({
      provider: "anthropic",
      key: KEY,
      fetchFn: provider.fetchFn,
      print: (line: string): void => {
        lines.push(line);
      },
    });

    expect(lines.join("\n")).not.toContain("FAIL");

    for (const model of ownModelsFor("anthropic")) {
      expect(lines.join("\n")).toContain(`PASS ${model.brain}`);
    }

    expect(passed).toBe(true);
  });

  it("clips a provider's error type and code to 64 printable characters", async () => {
    const run = await probeWith("openai", {
      toolName: PROBE_TOOL_NAME,
      failWith: {
        status: 400,
        body: {
          error: {
            type: `${"t".repeat(100)}\u001b[31m`,
            code: `c\u0007${"c".repeat(100)}`,
          },
        },
      },
    });

    const line =
      run.output.split("\n").find((candidate) => {
        return candidate.startsWith("FAIL own:openai:gpt-6-luna");
      }) ?? "";

    expect(line).toContain(`type ${"t".repeat(64)},`);
    expect(line).toContain(`code c${"c".repeat(63)}`);
    expect(line).not.toContain("t".repeat(65));
    expect(line).not.toContain("c".repeat(65));
    // Printable ASCII only: no escape, no bell.
    expect(
      [...line].every((char) => {
        const code = char.charCodeAt(0);

        return code >= 0x20 && code < 0x7f;
      }),
    ).toBe(true);
  });

  it("stops at a refused key check, before any turn", async () => {
    const provider = createFakeChatProvider({
      toolName: PROBE_TOOL_NAME,
      keyCheckStatus: 401,
    });
    const lines: string[] = [];

    const passed = await probeOwnKey({
      provider: "openrouter",
      key: KEY,
      fetchFn: provider.fetchFn,
      print: (line: string): void => {
        lines.push(line);
      },
    });

    expect(passed).toBe(false);
    expect(lines.join("\n")).toContain("-> 401 refused");
    expect(
      provider.requests.filter((request) => {
        return request.method === "POST";
      }),
    ).toEqual([]);
  });
});

interface ProbeRun {
  readonly passed: boolean;
  readonly output: string;
}

async function probeWith(
  provider: JarvisProvider,
  options: FakeChatProviderOptions,
): Promise<ProbeRun> {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fake = createFakeChatProvider(options);
  const lines: string[] = [];

  const passed = await probeOwnKey({
    provider,
    key: KEY,
    fetchFn: fake.fetchFn,
    print: (line: string): void => {
      lines.push(line);
    },
  });

  return { passed, output: lines.join("\n") };
}

const KEY = "sk-probe-test-key-7f3a";

/** Stands for whatever a provider's error message may say. */
const SECRET_TEXT = "MESSAGE-must-stay-out";
