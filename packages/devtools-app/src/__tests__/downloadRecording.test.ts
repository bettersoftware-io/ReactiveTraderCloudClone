// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Recording } from "@rtc/devtools-core";
import { RECORDING_VERSION } from "@rtc/devtools-core";

import { downloadRecording } from "#/recording/downloadRecording";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadRecording", () => {
  it("names the file recording-<appId>-<startedAt>.json and clicks an anchor", () => {
    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    const createUrl = vi.fn(() => {
      return "blob:fake";
    });
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createUrl,
      revokeObjectURL: revokeUrl,
    });

    downloadRecording(sample());

    expect(anchor.download).toBe("recording-rtc-web-1234.json");
    expect(anchor.href).toContain("blob:fake");
    expect(createUrl).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });
});

function sample(): Recording {
  return {
    version: RECORDING_VERSION,
    appId: "rtc-web",
    startedAt: 1234,
    frames: [{ kind: "snapshot", streams: [], machines: [] }],
  };
}
