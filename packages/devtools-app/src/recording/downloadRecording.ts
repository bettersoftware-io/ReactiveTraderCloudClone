import { type Recording, serializeRecording } from "@rtc/devtools-core";

/** Trigger a browser download of a recording as JSON, via an anchor + Blob +
 * object URL. No dependency — the DOM download path is native. */
export function downloadRecording(recording: Recording): void {
  const json = serializeRecording(recording);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `recording-${recording.appId}-${recording.startedAt}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
