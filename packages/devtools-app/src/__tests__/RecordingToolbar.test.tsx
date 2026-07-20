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
import { useRecording } from "#/recording/useRecording";

afterEach(cleanup);

beforeEach(() => {
  // jsdom does not implement object URLs; the export path may touch them.
  vi.stubGlobal("URL", {
    createObjectURL: () => {
      return "blob:fake";
    },
    revokeObjectURL: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

    expect((screen.getByTestId("export") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("exportBuffer is always enabled once history has frames", () => {
    const store = new InspectorStore();
    mount({ store });

    store.apply({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });
    emitOne(store);

    const button = screen.getByTestId("export-buffer") as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    // No throw / no crash is the behavioral contract here — exportBuffer
    // downloads the current LiveHistory window regardless of Record/Stop
    // state.
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
});

interface MountOptions {
  store: InspectorStore;
  appId?: string | null;
}

// Harness is nested inside mount() (not a module-top-level declaration), so
// Biome's fast-refresh export-only-modules check — which only guards
// top-level component declarations — doesn't apply, and a test file may not
// export anything at all (lint/suspicious/noExportsInTest).
function mount({ store, appId = "rtc-web" }: MountOptions): void {
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
