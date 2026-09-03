import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { useEffect, useMemo } from "react";

import type { InspectorStore } from "@rtc/devtools-core";
import { LiveHistory } from "@rtc/devtools-core";

import { RecordingToolbar } from "#/recording/RecordingToolbar";
import type { RecordingModel } from "#/recording/useRecording";
import { useRecording } from "#/recording/useRecording";

export interface MountRecordingToolbarOptions {
  store: InspectorStore;
  appId?: string | null;
  captureModel?: (model: RecordingModel) => void;
}

export interface RecordingToolbarPage {
  mountRecordingToolbar(options: MountRecordingToolbarOptions): void;
  unmountAll(): void;
  isDisabled(testId: string): boolean;
  click(testId: string): void;
  changeFiles(testId: string, files: File[]): void;
  exists(testId: string): boolean;
  text(testId: string): string;
  waitFor(assertion: () => void): Promise<void>;
}

/** The framework surface for `RecordingToolbar.test.tsx`. */
export function recordingToolbarPage(): RecordingToolbarPage {
  return {
    // Wires `useRecording` + `RecordingToolbar` together the way
    // `InspectorApp` does: an always-on `LiveHistory` fed by a `store.tap()`
    // tee, passed into the hook alongside the store and appId.
    mountRecordingToolbar({
      store,
      appId = "rtc-web",
      captureModel,
    }: MountRecordingToolbarOptions): void {
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
    },
    unmountAll(): void {
      cleanup();
    },
    isDisabled(testId: string): boolean {
      return (screen.getByTestId(testId) as HTMLButtonElement).disabled;
    },
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
    changeFiles(testId: string, files: File[]): void {
      fireEvent.change(screen.getByTestId(testId), { target: { files } });
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
    waitFor(assertion: () => void): Promise<void> {
      return waitFor(assertion);
    },
  };
}
