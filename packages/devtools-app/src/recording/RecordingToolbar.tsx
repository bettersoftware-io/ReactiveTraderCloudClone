import type { ChangeEvent, ReactElement } from "react";

import styles from "#/recording/RecordingToolbar.module.css";
import type { RecordingModel } from "#/recording/useRecording";

/** The recording toolbar: Record/Stop + frame counter, Export (the bounded
 * capture)/Export last buffer (the retroactive `LiveHistory` window)/Import,
 * and — while an imported recording is the active datasource — a banner
 * back to the live seam. Purely presentational — all state lives in
 * `model`. */
export function RecordingToolbar({
  model,
}: RecordingToolbarProps): ReactElement {
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
        data-testid="export"
        className={styles.btn}
        disabled={!model.recording}
        onClick={model.exportRecording}
      >
        Export capture
      </button>
      <button
        type="button"
        data-testid="export-buffer"
        className={styles.btn}
        onClick={model.exportBuffer}
      >
        Export last buffer
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

      {model.importError !== null ? (
        <span className={styles.error} data-testid="import-error">
          {model.importError}
        </span>
      ) : null}

      {model.imported !== null ? (
        <div className={styles.banner} data-testid="recording-banner">
          <span>{`viewing recording ${model.imported.appId}`}</span>
          <button
            type="button"
            data-testid="back-to-live"
            className={styles.bannerButton}
            onClick={model.backToLive}
          >
            Back to live
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface RecordingToolbarProps {
  model: RecordingModel;
}
