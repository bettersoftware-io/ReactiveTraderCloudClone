/** What a dev run does with the generated native project (`ios/` or
 * `android/`) before building it. The pure half of `nativeProject.ts`. */
export type NativeProjectAction = "reuse" | "generate" | "regenerate";

export interface NativeProjectState {
  /** Whether `ios/` (or `android/`) exists. */
  readonly exists: boolean;
  /** The fingerprint stamped into it at its last prebuild, `null` when it
   * carries none — every native folder generated before this check existed. */
  readonly stamp: string | null;
  /** The fingerprint of the native inputs now. */
  readonly current: string;
}

/**
 * `expo run:ios` / `run:android` prebuild only when the native folder is
 * MISSING. A folder generated from older inputs (a config plugin added since,
 * an SDK upgrade, a native dependency bump) is built as it is, and the result
 * can fail in ways that never name the cause: on 2026-10-19 an `ios/` from
 * before the scene life cycle plugin built green and was killed at launch.
 *
 * So the folder is regenerated whenever its stamp is not the current
 * fingerprint, including when it has no stamp at all: a folder this check did
 * not generate cannot be shown to be current.
 */
export function chooseNativeProjectAction(
  state: NativeProjectState,
): NativeProjectAction {
  if (!state.exists) {
    return "generate";
  }

  return state.stamp === state.current ? "reuse" : "regenerate";
}

/** Why a run is about to prebuild, for the console. `null` when it is not. */
export function describeNativeProjectAction(
  action: NativeProjectAction,
  directory: string,
): string | null {
  switch (action) {
    case "reuse":
      return null;
    case "generate":
      return `Generating ${directory}/ (none yet)…`;
    case "regenerate":
      return (
        `Regenerating ${directory}/: its native inputs (app config, config ` +
        "plugins, native dependencies) changed since it was generated…"
      );
  }
}
