import { useCallback, useEffect, useRef, useState } from "react";

import {
  type InspectorState,
  InspectorStore,
  LiveHistory,
  parseRecording,
  Recorder,
  type Recording,
} from "@rtc/devtools-core";

import { downloadRecording } from "#/recording/downloadRecording";

interface ImportedRecording {
  history: LiveHistory;
  /** Full fold incl. log — timeline rows + "present" for the import. */
  state: InspectorState;
  appId: string;
}

export interface RecordingModel {
  isRecording: boolean;
  frameCount: number;
  /** Last bounded capture (Record/Stop path). */
  recording: Recording | null;
  imported: ImportedRecording | null;
  importError: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  /** Bounded capture export (unchanged behavior). */
  exportRecording: () => void;
  /** Retroactive `LiveHistory` export — the current rolling buffer, not a
   * bounded Record/Stop capture. */
  exportBuffer: () => void;
  importRecording: (file: File) => Promise<void>;
  /** Clears `imported`, returning the panels to the live seam. */
  backToLive: () => void;
}

/** Owns recording state for the toolbar: a bounded Record/Stop capture (tees
 * the store's applied messages into a `Recorder`), a retroactive export of
 * the always-on `history` buffer, and importing a `.json` recording as a
 * standalone datasource. Nothing is ever sent to the app. */
export function useRecording(
  store: InspectorStore,
  history: LiveHistory,
  appId: string | null,
): RecordingModel {
  const recorderRef = useRef<Recorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [imported, setImported] = useState<ImportedRecording | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // While recording, tee every applied message into the recorder and keep the
  // live frame counter fresh.
  useEffect((): undefined | (() => void) => {
    if (!isRecording) {
      return undefined;
    }

    const recorder = recorderRef.current;

    if (!recorder) {
      return undefined;
    }

    const untap = store.tap((msg) => {
      recorder.capture(msg);
      setFrameCount(recorder.frameCount);
    });

    return (): void => {
      untap();
    };
  }, [isRecording, store]);

  const startRecording = useCallback((): void => {
    const recorder = new Recorder();
    recorder.start(store.getSnapshot(), Date.now());
    recorderRef.current = recorder;
    setFrameCount(recorder.frameCount);
    setIsRecording(true);
  }, [store]);

  const stopRecording = useCallback((): void => {
    const recorder = recorderRef.current;

    if (!recorder) {
      return;
    }

    recorder.stop();
    setRecording(recorder.toRecording());
    setIsRecording(false);
  }, []);

  const exportRecording = useCallback((): void => {
    if (recording) {
      downloadRecording(recording);
    }
  }, [recording]);

  const exportBuffer = useCallback((): void => {
    downloadRecording(
      history.toRecording(appId ?? "unknown", history.firstTs ?? Date.now()),
    );
  }, [history, appId]);

  const importRecording = useCallback(async (file: File): Promise<void> => {
    const text = await file.text();

    try {
      const rec = parseRecording(text);
      const importedHistory = LiveHistory.fromRecording(rec);
      const foldStore = new InspectorStore({ coalesce: false });

      for (const frame of rec.frames) {
        foldStore.apply(frame);
      }

      setImported({
        history: importedHistory,
        state: foldStore.getSnapshot(),
        appId: rec.appId,
      });
      setImportError(null);
    } catch (error) {
      setImportError(String(error));
    }
  }, []);

  const backToLive = useCallback((): void => {
    setImported(null);
  }, []);

  return {
    isRecording,
    frameCount,
    recording,
    imported,
    importError,
    startRecording,
    stopRecording,
    exportRecording,
    exportBuffer,
    importRecording,
    backToLive,
  };
}
