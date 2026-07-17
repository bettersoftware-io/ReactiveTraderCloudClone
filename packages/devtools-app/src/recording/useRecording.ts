import { useCallback, useEffect, useRef, useState } from "react";

import {
  type InspectorStore,
  parseRecording,
  Recorder,
  type Recording,
  ReplayController,
} from "@rtc/devtools-core";

import { downloadRecording } from "#/recording/downloadRecording";

const PLAY_STEP_MS = 200;

export type RecordingMode = "live" | "replay";

export interface RecordingModel {
  mode: RecordingMode;
  isRecording: boolean;
  frameCount: number;
  recording: Recording | null;
  replay: ReplayController | null;
  frameIndex: number;
  isPlaying: boolean;
  canReplay: boolean;
  setMode: (mode: RecordingMode) => void;
  startRecording: () => void;
  stopRecording: () => void;
  setFrameIndex: (index: number) => void;
  stepBack: () => void;
  stepForward: () => void;
  togglePlay: () => void;
  exportRecording: () => void;
  importRecording: (file: File) => Promise<void>;
}

/** Owns record/replay state for the toolbar. Recording tees the store's applied
 * messages into a Recorder via store.tap(); replay reconstructs state through a
 * ReplayController. Nothing is ever sent to the app. */
export function useRecording(store: InspectorStore): RecordingModel {
  const recorderRef = useRef<Recorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [replay, setReplay] = useState<ReplayController | null>(null);
  const [mode, setModeState] = useState<RecordingMode>("live");
  const [frameIndex, setFrameIndexState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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

  // Playback: advance the frame index on a fixed cadence until the end.
  useEffect((): undefined | (() => void) => {
    if (!isPlaying || mode !== "replay" || !replay) {
      return undefined;
    }

    const id = setInterval((): void => {
      setFrameIndexState((current) => {
        const next = current + 1;

        if (next >= replay.length) {
          setIsPlaying(false);

          return replay.length - 1;
        }

        return next;
      });
    }, PLAY_STEP_MS);

    return (): void => {
      clearInterval(id);
    };
  }, [isPlaying, mode, replay]);

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
    const rec = recorder.toRecording();
    setRecording(rec);
    setReplay(new ReplayController(rec));
    setFrameIndexState(rec.frames.length - 1);
    setIsRecording(false);
  }, []);

  const setMode = useCallback(
    (next: RecordingMode): void => {
      if (next === "replay" && !replay) {
        return;
      }

      if (next === "live") {
        setIsPlaying(false);
      }

      setModeState(next);
    },
    [replay],
  );

  const setFrameIndex = useCallback(
    (index: number): void => {
      const max = replay ? replay.length - 1 : 0;
      setFrameIndexState(Math.max(0, Math.min(index, max)));
    },
    [replay],
  );

  const stepForward = useCallback((): void => {
    setFrameIndexState((current) => {
      const max = replay ? replay.length - 1 : 0;

      return Math.min(current + 1, max);
    });
  }, [replay]);

  const stepBack = useCallback((): void => {
    setFrameIndexState((current) => {
      return Math.max(current - 1, 0);
    });
  }, []);

  const togglePlay = useCallback((): void => {
    setIsPlaying((playing) => {
      return !playing;
    });
  }, []);

  const exportRecording = useCallback((): void => {
    if (recording) {
      downloadRecording(recording);
    }
  }, [recording]);

  const importRecording = useCallback(async (file: File): Promise<void> => {
    const text = await file.text();

    try {
      const rec = parseRecording(text);
      setRecording(rec);
      const controller = new ReplayController(rec);
      setReplay(controller);
      setFrameIndexState(Math.max(0, rec.frames.length - 1));
      setIsPlaying(false);
      setModeState("replay");
    } catch (error) {
      console.error(`Import failed: ${String(error)}`);
    }
  }, []);

  return {
    mode,
    isRecording,
    frameCount,
    recording,
    replay,
    frameIndex,
    isPlaying,
    canReplay: replay !== null,
    setMode,
    startRecording,
    stopRecording,
    setFrameIndex,
    stepBack,
    stepForward,
    togglePlay,
    exportRecording,
    importRecording,
  };
}
