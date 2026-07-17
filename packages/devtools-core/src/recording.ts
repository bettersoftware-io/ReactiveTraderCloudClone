import type { AppToInspector } from "./protocol";

/** Recording format version — independent of PROTOCOL_VERSION. Bump when the
 * on-disk shape changes; parseRecording rejects any other version. */
export const RECORDING_VERSION = 1;

/** A flight recording: the appId, an injected start timestamp, and the ordered
 * AppToInspector frames (a seed snapshot followed by the captured batches). The
 * frames are already plain, capped SerializedValue data, so the whole thing is
 * JSON-safe. */
export interface Recording {
  version: number;
  appId: string;
  /** ts of the first captured message — passed in by the caller, never
   * Date.now() here (keeps the core pure and the tests deterministic). */
  startedAt: number;
  frames: readonly AppToInspector[];
}

export function serializeRecording(recording: Recording): string {
  return JSON.stringify(recording);
}

/** Parse + validate a recording from JSON. Throws an Error with a specific
 * message on malformed input so the panel can surface a clear failure rather
 * than crashing. */
export function parseRecording(json: string): Recording {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid recording JSON: ${String(error)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid recording: expected an object");
  }

  const candidate = parsed as Record<string, unknown>;

  if (candidate.version !== RECORDING_VERSION) {
    throw new Error(
      `Unsupported recording version: ${String(candidate.version)} (expected ${RECORDING_VERSION})`,
    );
  }

  if (typeof candidate.appId !== "string") {
    throw new Error("Invalid recording: appId must be a string");
  }

  if (typeof candidate.startedAt !== "number") {
    throw new Error("Invalid recording: startedAt must be a number");
  }

  if (!Array.isArray(candidate.frames)) {
    throw new Error("Invalid recording: frames must be an array");
  }

  return {
    version: candidate.version,
    appId: candidate.appId,
    startedAt: candidate.startedAt,
    frames: candidate.frames as readonly AppToInspector[],
  };
}
