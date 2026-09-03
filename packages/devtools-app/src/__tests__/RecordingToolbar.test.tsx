// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recording } from "@rtc/devtools-core";
import {
  InspectorStore,
  PROTOCOL_VERSION,
  RECORDING_VERSION,
  serializeRecording,
} from "@rtc/devtools-core";

import type { RecordingModel } from "#/recording/useRecording";
import { recordingToolbarPage } from "#tests/pages/RecordingToolbarPage";

const toolbar = recordingToolbarPage();

afterEach(() => {
  toolbar.unmountAll();
});

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom does not implement object URLs; the export path may touch them.
  createObjectURL = vi.fn(() => {
    return "blob:fake";
  });
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RecordingToolbar", () => {
  it("record -> stop enables Export capture", () => {
    const store = new InspectorStore();
    toolbar.mountRecordingToolbar({ store });

    expect(toolbar.isDisabled("export")).toBe(true);

    toolbar.click("record-toggle"); // start
    emitOne(store);
    toolbar.click("record-toggle"); // stop

    expect(toolbar.isDisabled("export")).toBe(false);

    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    toolbar.click("export");

    // The download actually happened: a Blob URL was created and handed to
    // an anchor that got clicked and then revoked — not merely "didn't
    // throw". No "welcome" was applied here, so the bounded capture's appId
    // falls back to "unknown" (Recorder.toRecording's own default).
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.download).toMatch(/^recording-unknown-\d+\.json$/);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("exportBuffer is always enabled once history has frames, and downloads the live window", () => {
    const store = new InspectorStore();
    toolbar.mountRecordingToolbar({ store });

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    emitOne(store);

    expect(toolbar.isDisabled("export-buffer")).toBe(false);

    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    toolbar.click("export-buffer");

    // exportBuffer downloads the current LiveHistory window regardless of
    // Record/Stop state — the same real download side effect as Export.
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.download).toMatch(/^recording-rtc-web-\d+\.json$/);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("import failure shows importError", async () => {
    const store = new InspectorStore();
    toolbar.mountRecordingToolbar({ store });

    const file = new File(["not json"], "bad.json", {
      type: "application/json",
    });
    toolbar.changeFiles("import", [file]);

    await toolbar.waitUntilVisible("import-error");
    expect(toolbar.exists("recording-banner")).toBe(false);
  });

  it("a File.text() rejection surfaces as importError, not an unhandled rejection", async () => {
    const store = new InspectorStore();
    toolbar.mountRecordingToolbar({ store });

    const file = new File(["irrelevant"], "r.json", {
      type: "application/json",
    });
    vi.spyOn(file, "text").mockRejectedValue(new Error("read failed"));

    toolbar.changeFiles("import", [file]);

    await toolbar.waitUntilTextContains("import-error", "read failed");
  });

  it("imported state shows the banner and Back to live clears it", async () => {
    const store = new InspectorStore();
    toolbar.mountRecordingToolbar({ store });

    const rec = sampleRecording();
    const file = new File([serializeRecording(rec)], "r.json", {
      type: "application/json",
    });
    toolbar.changeFiles("import", [file]);

    await toolbar.waitUntilTextContains("recording-banner", "imported-app");
    expect(toolbar.exists("import-error")).toBe(false);

    toolbar.click("back-to-live");
    expect(toolbar.exists("recording-banner")).toBe(false);
  });

  it("stopping without a recorder in progress is a no-op", () => {
    const store = new InspectorStore();
    const captured: CapturedModel = { model: null };
    toolbar.mountRecordingToolbar({
      store,
      captureModel: (model: RecordingModel) => {
        captured.model = model;
      },
    });

    expect(() => {
      captured.model?.stopRecording();
    }).not.toThrow();
    expect(captured.model?.isRecording).toBe(false);
    expect(captured.model?.recording).toBeNull();
  });
});

interface CapturedModel {
  model: RecordingModel | null;
}

function emitOne(store: InspectorStore): void {
  store.apply({
    kind: "batch",
    events: [
      {
        kind: "stream:emission",
        streamId: "fx.EURUSD$",
        value: 1.1,
        coalesced: 1,
        seq: 1,
        ts: 1000,
      },
    ],
  });
}

function sampleRecording(): Recording {
  return {
    version: RECORDING_VERSION,
    appId: "imported-app",
    startedAt: 5000,
    frames: [
      {
        kind: "snapshot",
        streams: [{ streamId: "z.a$", value: 7 }],
        machines: [],
      },
    ],
  };
}
