/** Which published build is running: the commit it was bundled from and when.
 *
 * `pnpm demo:publish:ios` sets the two `EXPO_PUBLIC_BUILD_*` variables, and
 * Metro inlines `EXPO_PUBLIC_*` at bundle time — so a published build carries
 * its own stamp and a development run (nothing set) has none. Without it the
 * only way to tell two published builds apart was the label in Expo Go's list,
 * which is gone once the app is open. */
export interface BuildStamp {
  /** Short commit hash, as `git rev-parse --short HEAD` prints it. */
  readonly commit: string;
  /** Publish time, UTC, to the minute: `2026-10-04T15:20Z`. */
  readonly builtAt: string;
}

/** Both halves, well-formed, or nothing. A stamp that is half there or
 * malformed would be printed as fact on the sign-in screen; `null` prints
 * nothing, which is the honest reading of "we do not know". */
export function parseBuildStamp(
  commit: string | undefined,
  builtAt: string | undefined,
): BuildStamp | null {
  if (commit === undefined || builtAt === undefined) {
    return null;
  }

  if (!COMMIT.test(commit) || !BUILT_AT.test(builtAt)) {
    return null;
  }

  return { commit, builtAt };
}

// The two reads MUST stay literal `process.env.EXPO_PUBLIC_*` member
// expressions: that exact shape is what Metro replaces. Reading them through a
// variable or a destructure compiles, and is always `undefined` on the phone.
export const BUILD_STAMP: BuildStamp | null = parseBuildStamp(
  process.env.EXPO_PUBLIC_BUILD_COMMIT,
  process.env.EXPO_PUBLIC_BUILD_TIME,
);

const COMMIT = /^[0-9a-f]{7,40}$/;
const BUILT_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
