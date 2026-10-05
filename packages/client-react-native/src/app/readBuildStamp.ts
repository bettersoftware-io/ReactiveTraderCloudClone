import { type BuildStamp, parseBuildStamp } from "#/ui/shell/buildStamp";

/** The stamp `pnpm demo:ios:publish` bakes into a published bundle, or `null`.
 *
 * The two reads MUST stay literal `process.env.EXPO_PUBLIC_*` member
 * expressions: that exact shape is what Metro replaces at bundle time. Reading
 * them through a variable or a destructure compiles, and is always `undefined`
 * on the phone. */
export const BUILD_STAMP: BuildStamp | null = parseBuildStamp(
  process.env.EXPO_PUBLIC_BUILD_COMMIT,
  process.env.EXPO_PUBLIC_BUILD_TIME,
);
