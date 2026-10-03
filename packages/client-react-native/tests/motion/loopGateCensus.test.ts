import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

// The reduced-motion audit, made repeatable. Reduced motion and power-saver
// Freeze promise "no loops": every animation that repeats without an event to
// trigger it must stop under either. This census reads the source tree, finds
// every file holding a repeating primitive, and requires it to consult one of
// the three motion gates — so a new loop cannot ship ungated by oversight.
//
// It is a census, not a proof: naming a gate is necessary, not sufficient.
// What each gated loop DOES under the gate (cancel the worklet, rest on a
// static frame) is asserted by that component's own test.

test("every repeating animation consults a motion gate", () => {
  const ungated = repeatingFiles().filter((file) => {
    return !(file in EXEMPT) && !GATE.test(stripComments(read(file)));
  });

  expect(ungated).toEqual([]);
});

test("every exemption still names a real, still-repeating file", () => {
  const repeating = new Set(repeatingFiles());

  expect(
    Object.keys(EXEMPT).filter((file) => {
      return !repeating.has(file);
    }),
  ).toEqual([]);
});

// Guards the census itself: a regex that stopped matching would turn the first
// test green on an empty list. The app has had more than ten loops since
// Phase 2; none at all means the scan broke, not that the motion went away.
test("the census finds the loops it exists to check", () => {
  const files = repeatingFiles();

  expect(files).toContain("ui/ambient/AmbientBackground.tsx");
  expect(files).toContain("ui/shell/boot/BootCanvas.tsx");
  expect(files.length).toBeGreaterThan(10);
});

function repeatingFiles(): string[] {
  return sourceFiles(SRC)
    .map((file) => {
      return path.relative(SRC, file);
    })
    .filter((file) => {
      return REPEATING.test(stripComments(read(file)));
    })
    .sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(full);
    }

    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

function read(file: string): string {
  return readFileSync(path.join(SRC, file), "utf8");
}

/** A gate or a loop named only in a comment is neither. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src",
);

/** Runs every frame, or forever, with no event behind it. */
const REPEATING =
  /\bwithRepeat\(|\bAnimated\.loop\(|\buseFrameCallback\(|\bsetInterval\(/;

/** A CALL, not a mention: an import left behind after the call was removed
 * must not count (a mutant that did exactly that survived the first draft). */
const GATE =
  /\buseShellMotionEnabled\(|\buseBootMotionEnabled\(|\buseAmbientEnabled\(/;

/** Files that repeat on purpose with the gate off. Each entry needs a reason,
 * and `every exemption still names a real, still-repeating file` below stops
 * the list outliving the code it excuses. */
const EXEMPT: Readonly<Record<string, string>> = {
  // The FPS meter is diagnostic instrumentation, most valuable
  // exactly when the device is struggling (mirrors the web `useLiveMetrics`
  // Freeze exemption).
  "ui/shell/hud/useShellTelemetry.ts": "diagnostic FPS meter",
  // Phase 0's native-stack diagnostic: mounted only when
  // `EXPO_PUBLIC_MOTION_PROBE === "1"`, never in a normal run, and its whole
  // job is to show a loop running.
  "ui/_probe/MotionProbe.tsx": "flag-gated diagnostic",
};
