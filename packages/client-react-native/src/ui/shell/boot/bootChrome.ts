// packages/client-react-native/src/ui/shell/boot/bootChrome.ts

import { BOOT_VARIANTS, type BootVariant } from "@rtc/domain";

/**
 * The strings and the one geometry helper behind the boot splash's bottom
 * chrome block — the overlay `BootSequence` prints over whichever Skia scene
 * is drawing.
 *
 * Ported from the mobile-v1 prototype's `_paintBootChrome`
 * (`docs/design/mobile/v1/dev-handoff/prototype/source/Reactive Trader
 * Mobile.dc.html`, lines 1618-1635), where the same block is painted ONTO the
 * boot canvas rather than laid out as views. The prototype's `NAMES` and
 * `_bootLogs` arrays (lines 1036-1037) are copied verbatim below.
 *
 * A pure `.ts` module (no React, no react-native) for two reasons: it is the
 * vitest half of this package's two-runner split, so the name map and the log
 * schedule are unit-testable without booting the RN runtime; and
 * `BootSequence.test.tsx` mocks `bootScene.ts` wholesale, so anything living
 * there would vanish from that suite.
 */

/** The prototype's `'MOBILE OS  //  SEQ ' + (seq + 1) + '/8 · ' + name` line,
 * with the count read from `BOOT_VARIANTS` rather than hard-coded: the
 * prototype ships eight scenes and so does the app, but the app's count is the
 * one that must stay true if a ninth variant is ever added. Double space
 * around the `//` is the prototype's, not a typo. */
export function bootSequenceLine(variant: BootVariant): string {
  const position = BOOT_VARIANTS.indexOf(variant) + 1;

  return `MOBILE OS  //  SEQ ${position}/${BOOT_VARIANTS.length} · ${BOOT_SCENE_NAMES[variant]}`;
}

/**
 * The log line under the rail, at `progressPct` (0-100) of the ramp.
 *
 * The prototype advances its own `shown` counter off the same normalized ramp
 * (`ceil(min(1, t * 1.15) * logs.length)`, which front-loads the last line);
 * this is the deterministic equivalent stated as a pure function of the
 * machine's percentage, so a pinned golden and a device boot print the same
 * line for the same progress. The final line therefore lands at 100% rather
 * than ~87%.
 */
export function bootLogLine(progressPct: number): string {
  const step = Math.floor((progressPct / 100) * BOOT_LOG_LINES.length);
  const index = Math.min(Math.max(step, 0), BOOT_LOG_LINES.length - 1);

  return `${BOOT_LOG_BULLET} ${BOOT_LOG_LINES[index]}`;
}

/**
 * Top offset for a `<Text>` whose BASELINE must land on `baseline`.
 *
 * The prototype positions this block by canvas baselines (`fillText`'s y);
 * RN positions boxes by their top edge. React Native centres the font's em box
 * inside `lineHeight`, so the baseline sits `(lineHeight - fontSize) / 2 +
 * ascent` below the box top, with ascent modelled at `ASCENT_RATIO` of the
 * font size — an approximation (the real ascent is per-face metadata RN does
 * not expose to JS), accurate to about a pixel for the two faces this block
 * uses.
 */
export function textTopForBaseline(
  baseline: number,
  fontSize: number,
  lineHeight: number,
): number {
  return baseline - (lineHeight - fontSize) / 2 - fontSize * ASCENT_RATIO;
}

/**
 * Boot variant → the scene name printed in the SEQ line.
 *
 * The prototype's `NAMES` (dc.html:1037) in ITS order, which is the app's
 * `BOOT_VARIANTS` order position-for-position — the cycle list was ported from
 * the same prototype (`preferences.ts`: "PROTO _startBoot `variants` list").
 * Each name is corroborated by what the app's scene actually draws:
 * `laser` draws the panel draw-in ("UI DRAW-IN"), `jarvis` prints
 * "PROJECTING SCHEMATIC" ("SCHEMATIC CORE"), `topo` the volatility terrain
 * ("VOL TERRAIN"), and so on. Total over `BootVariant` by type, and
 * `bootChrome.test.ts` pins that against `BOOT_VARIANTS` at runtime too.
 */
export const BOOT_SCENE_NAMES: Record<BootVariant, string> = {
  core: "CORE SYNC",
  laser: "UI DRAW-IN",
  docking: "DOCKING CAM",
  hologram: "HOLO PROJECTOR",
  geo: "GEO TACTICAL",
  layers: "LAYER COMPOSITOR",
  jarvis: "SCHEMATIC CORE",
  topo: "VOL TERRAIN",
};

/** The prototype's `_bootLogs` (dc.html:1036), verbatim. */
export const BOOT_LOG_LINES: readonly string[] = [
  "INIT KERNEL 2.0-RN",
  "MOUNT @rtc/client-core",
  "WS HANDSHAKE wss://rtc-clone",
  "STREAM FX·CREDIT·EQ",
  "HYDRATE PRESENTERS",
  "CALIBRATE HUD",
  "SESSION TRADER.EI OK",
];

/** The prototype's `'▸ '` log prefix (U+25B8). A literal glyph, not a
 * `\uXXXX` escape: this string reaches a `<Text>` child, and a bare escape
 * written as JSX text renders as the literal escape. */
const BOOT_LOG_BULLET = "▸";

const ASCENT_RATIO = 0.8;
