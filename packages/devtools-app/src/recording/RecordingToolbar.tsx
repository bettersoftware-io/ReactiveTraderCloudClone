import type { ChangeEvent, ReactElement } from "react";

import styles from "#/recording/RecordingToolbar.module.css";
import type { RecordingModel } from "#/recording/useRecording";

/** The recording toolbar: Record/Stop + frame counter, a Live|Replay mode
 * toggle, a scrubber with step/play and a ts readout (Replay only), and
 * Export/Import. Purely presentational — all state lives in `model`. */
export function RecordingToolbar({
  model,
}: RecordingToolbarProps): ReactElement {
  const startedAt = model.recording?.startedAt ?? 0;
  const maxIndex = model.replay ? Math.max(0, model.replay.length - 1) : 0;

  function onScrub(event: ChangeEvent<HTMLInputElement>): void {
    model.setFrameIndex(Number(event.target.value));
  }

  function onImport(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];

    if (file) {
      void model.importRecording(file);
    }
  }

  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        data-testid="record-toggle"
        className={model.isRecording ? styles.btnActive : styles.btn}
        onClick={model.isRecording ? model.stopRecording : model.startRecording}
      >
        {model.isRecording ? "■ Stop" : "● Record"}
      </button>
      {model.isRecording ? (
        <span className={styles.counter} data-testid="frame-count">
          {`${model.frameCount} frames`}
        </span>
      ) : null}

      <span className={styles.spacer} />

      <button
        type="button"
        data-testid="mode-live"
        className={model.mode === "live" ? styles.btnActive : styles.btn}
        onClick={() => {
          model.setMode("live");
        }}
      >
        Live
      </button>
      <button
        type="button"
        data-testid="mode-replay"
        disabled={!model.canReplay}
        className={model.mode === "replay" ? styles.btnActive : styles.btn}
        onClick={() => {
          model.setMode("replay");
        }}
      >
        Replay
      </button>

      {model.mode === "replay" && model.replay ? (
        <>
          <button
            type="button"
            data-testid="step-back"
            className={styles.btn}
            onClick={model.stepBack}
          >
            ◀
          </button>
          <button
            type="button"
            data-testid="play-toggle"
            className={styles.btn}
            onClick={model.togglePlay}
          >
            {model.isPlaying ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            data-testid="step-forward"
            className={styles.btn}
            onClick={model.stepForward}
          >
            ▶▮
          </button>
          <input
            type="range"
            data-testid="scrubber"
            className={styles.scrubber}
            min={0}
            max={maxIndex}
            value={model.frameIndex}
            onChange={onScrub}
          />
          <span className={styles.readout} data-testid="frame-readout">
            {`${model.frameIndex + 1}/${model.replay.length} ${formatOffset(
              model.replay.tsAt(model.frameIndex) - startedAt,
            )}`}
          </span>
        </>
      ) : null}

      <span className={styles.spacer} />

      <button
        type="button"
        data-testid="export"
        className={styles.btn}
        disabled={!model.recording}
        onClick={model.exportRecording}
      >
        Export
      </button>
      <label className={styles.importLabel} data-testid="import-label">
        Import
        <input
          type="file"
          accept="application/json"
          data-testid="import"
          className={styles.hiddenInput}
          onChange={onImport}
        />
      </label>
    </div>
  );
}

export interface RecordingToolbarProps {
  model: RecordingModel;
}

function formatOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(2)}s`;
}
