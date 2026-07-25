// packages/client-react-native/src/ui/shell/boot/scenes/coreBackdrop.ts
import { clamp01, hashRandom } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * The three backdrop/whole-frame layers of the `core` boot scene, deferred
 * from phase 6a and ported here: the star-drift backdrop, the nucleus glow,
 * and the holo flicker.
 *
 * Ported verbatim (formulas unchanged) from
 * `packages/boot-splash/src/variants/bootCore.ts` — star seeding lines
 * 112-121, flicker + star draw 156-171, nucleus glow 220-238.
 *
 * Every function here is called from inside `CoreScene`'s `createPicture`
 * recorder, which is a worklet — so every one carries the `"worklet"`
 * directive itself. Reanimated worklet-ifies a function where it is
 * *defined*, so an unmarked import called from a worklet red-boxes on a real
 * device with "Tried to synchronously call a Remote Function". jest cannot
 * catch that (its mock runs worklets as plain JS); the simulator is the only
 * witness.
 */

/** One star-drift mote: normalized position (0..1 of width/height), pixel
 * size and twinkle phase offset. */
export interface CoreStar {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
}

const STAR_COUNT = 52;

/** 52 stars, seeded once at module load exactly as the web factory seeds them
 * per boot. Module-level rather than per-mount because the seeding is
 * deterministic and theme-independent — there is nothing to recompute. */
export const CORE_STARS: readonly CoreStar[] = Array.from(
  { length: STAR_COUNT },
  (_unused, i) => {
    return {
      x: hashRandom(i * 7 + 1),
      y: hashRandom(i * 11 + 2) * 0.85,
      size: 0.5 + hashRandom(i * 13 + 3) * 1.5,
      phase: hashRandom(i * 17 + 4) * 6.283,
    };
  },
);

/** Star side length in pixels — the web's `fillRect(x, y, 1.3, 1.3)`. */
export const STAR_SIZE_PX = 1.3;

/** Per-star twinkle alpha: a 0.08..0.28 band driven by an absolute sine whose
 * frequency is the star's own size, so bigger stars pulse faster. */
export function starTwinkleAlpha(elapsedSec: number, star: CoreStar): number {
  "worklet";
  const twinkle =
    0.25 + 0.55 * Math.abs(Math.sin(elapsedSec * star.size + star.phase));
  return 0.08 + 0.2 * twinkle;
}

/**
 * Whole-frame holo flicker: a fast carrier sine whose own phase wobbles, plus
 * an occasional hard dip when a per-sixth-of-a-second hash crosses 0.94.
 *
 * The web applies this as `ctx.globalAlpha` around the entire draw. Skia's
 * equivalent is `canvas.saveLayer()`, which allocates an offscreen surface
 * every frame — so `CoreScene` instead multiplies this factor into every
 * layer's alpha. Same result for alpha-blended strokes and fills, no
 * per-frame allocation (see docs/performance.md).
 */
export function holoFlickerAlpha(elapsedSec: number): number {
  "worklet";
  const carrier =
    0.88 + 0.12 * Math.sin(elapsedSec * 36 + Math.sin(elapsedSec * 9) * 4);

  if (hashRandom(Math.floor(elapsedSec * 6) + 2) > 0.94) {
    return carrier * 0.55;
  }

  return carrier;
}

// --- nucleus glow ---------------------------------------------------------

/** The radial gradient's outer radius, as a multiple of the globe radius. */
export const NUCLEUS_RADIUS_FACTOR = 1.15;

/** Half-extent of the square the gradient is painted into, as a multiple of
 * the globe radius — the web fills a `2.6 * globeRadius` box centred on the
 * globe rather than the whole canvas. */
export const NUCLEUS_BOX_FACTOR = 1.3;

/** Gradient stop positions. The colours are resolved at draw time from the
 * theme accent, so only the offsets and their alphas live here. */
export const NUCLEUS_STOPS: readonly number[] = [0, 0.55, 1];
export const NUCLEUS_ALPHAS: readonly number[] = [0.16, 0.05, 0];

/** Alpha of the flat background wash the web paints before anything else
 * (`rgba(0,3,6,0.5)`). Kept as a named constant because it is one of the two
 * places a boot scene paints a non-theme colour — a near-black the design
 * uses to sink the splash below the app background. */
export const CORE_BACKDROP_WASH = "rgba(0,3,6,0.5)";

/** Clamped 0..1 helper re-exported for the draw site's convenience — the
 * gradient alphas are pre-multiplied by the flicker factor, which can push a
 * value fractionally past its band on a glitch frame. */
export function nucleusAlpha(baseAlpha: number, flicker: number): number {
  "worklet";
  return clamp01(baseAlpha * flicker);
}
