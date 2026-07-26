// packages/client-react-native/src/ui/shell/boot/scenes/bootGlyphs.ts
/**
 * Glyphs the boot scenes draw, where the bundled typefaces do not cover what
 * the web variants use.
 *
 * Pure and dependency-free on purpose: the geometry modules that build these
 * strings are worklet-marked, so they must not reach a module that imports
 * React or the Skia hooks (`bootSceneFonts.ts` does both).
 */

/**
 * The telemetry bullet every boot scene prefixes its top-left status line
 * with. `\u25CF` BLACK CIRCLE, NOT the `\u25C9` FISHEYE the web variants use.
 *
 * Verified against the cmap of every bundled face: `\u25C9` is absent from all
 * of them — JetBrains Mono, IBM Plex Mono, IBM Plex Sans and Chakra Petch
 * alike — while every other symbol these scenes draw
 * (`\u00B7 \u00B0 \u25B8 \u25C2 \u25CF \u2192 \u2026 \u00D7`) is covered. The web gets away with it
 * because a CSS font stack falls back PER GLYPH:
 * `'JetBrains Mono','IBM Plex Mono',monospace` reaches the system monospace
 * for that one character. A Skia font has exactly one typeface and no
 * fallback chain, so the same string renders a tofu box instead — invisible
 * until the text rendered at all (see `bootSceneFonts.ts`).
 *
 * Shared rather than inlined so the five remaining scenes (6b-2) inherit the
 * substitution instead of each rediscovering it on a device.
 */
export const BOOT_TELEMETRY_BULLET = "\u25CF";
