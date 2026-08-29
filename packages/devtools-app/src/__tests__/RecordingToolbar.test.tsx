// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recording } from "@rtc/devtools-core";
import {
  InspectorStore,
  LiveHistory,
  PROTOCOL_VERSION,
  RECORDING_VERSION,
  serializeRecording,
} from "@rtc/devtools-core";

import { RecordingToolbar } from "#/recording/RecordingToolbar";
import type { RecordingModel } from "#/recording/useRecording";
import { useRecording } from "#/recording/useRecording";

afterEach(cleanup);

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
    mount({ store });

    expect((screen.getByTestId("export") as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByTestId("record-toggle")); // start
    emitOne(store);
    fireEvent.click(screen.getByTestId("record-toggle")); // stop

    const exportButton = screen.getByTestId("export") as HTMLButtonElement;
    expect(exportButton.disabled).toBe(false);

    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    fireEvent.click(exportButton);

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
    mount({ store });

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    emitOne(store);

    const button = screen.getByTestId("export-buffer") as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    fireEvent.click(button);

    // exportBuffer downloads the current LiveHistory window regardless of
    // Record/Stop state — the same real download side effect as Export.
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.download).toMatch(/^recording-rtc-web-\d+\.json$/);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("import failure shows importError", async () => {
    const store = new InspectorStore();
    mount({ store });

    const file = new File(["not json"], "bad.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByTestId("import"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("import-error")).toBeTruthy();
    });
    expect(screen.queryByTestId("recording-banner")).toBeNull();
  });

  it("a File.text() rejection surfaces as importError, not an unhandled rejection", async () => {
    const store = new InspectorStore();
    mount({ store });

    const file = new File(["irrelevant"], "r.json", {
      type: "application/json",
    });
    vi.spyOn(file, "text").mockRejectedValue(new Error("read failed"));

    fireEvent.change(screen.getByTestId("import"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("import-error").textContent).toContain(
        "read failed",
      );
    });
  });

  it("imported state shows the banner and Back to live clears it", async () => {
    const store = new InspectorStore();
    mount({ store });

    const rec = sampleRecording();
    const file = new File([serializeRecording(rec)], "r.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByTestId("import"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByTestId("recording-banner").textContent).toContain(
        "imported-app",
      );
    });
    expect(screen.queryByTestId("import-error")).toBeNull();

    fireEvent.click(screen.getByTestId("back-to-live"));
    expect(screen.queryByTestId("recording-banner")).toBeNull();
  });

  it("stopping without a recorder in progress is a no-op", () => {
    const store = new InspectorStore();
    const captured: CapturedModel = { model: null };
    mount({
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

interface MountOptions {
  store: InspectorStore;
  appId?: string | null;
  captureModel?: (model: RecordingModel) => void;
}

// Harness is nested inside mount() (not a module-top-level declaration), so
// Biome's fast-refresh export-only-modules check — which only guards
// top-level component declarations — doesn't apply, and a test file may not
// export anything at all (lint/suspicious/noExportsInTest).
function mount({ store, appId = "rtc-web", captureModel }: MountOptions): void {
  // Wires `useRecording` + `RecordingToolbar` together the way `InspectorApp`
  // does: an always-on `LiveHistory` fed by a `store.tap()` tee, passed into
  // the hook alongside the store and appId.
  function Harness(): ReactElement {
    const history = useMemo((): LiveHistory => {
      return new LiveHistory();
    }, []);

    useEffect((): (() => void) => {
      return store.tap((msg) => {
        history.record(msg);
      });
    }, [history]);

    const model = useRecording(store, history, appId);

    captureModel?.(model);

    return <RecordingToolbar model={model} />;
  }

  render(<Harness />);
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
