// packages/client-react-native/src/ui/shell/boot/scenes/geoGeometry.ts
import { BOOT_DURATION_MS } from "@rtc/client-core";

import { BOOT_TELEMETRY_BULLET } from "./bootGlyphs";
import { clamp01, ease, hashRandom } from "./coreGeometry";
import { GEO_CITIES, GEO_LANDMASSES, type GeoLonLat } from "./geoCoastlines";

/**
 * Pure geometry/timing/copy for `GeoScene` — "GEO-FEED · EMEA WEST TACTICAL",
 * a western-Europe tactical map. Ported verbatim (formulas and strings
 * unchanged) from `packages/boot-splash/src/variants/bootGeo.ts`.
 *
 * WORKLET SPLIT — read before adding an export.
 *
 *   BUILD-ONCE, deliberately UNMARKED (call in React-land, `useMemo`, capture
 *   the result in the draw closure):
 *     - `geoPlanePolys`      — the seven coastlines in plane space
 *     - `geoTerrainDots`     — ~2.8k grid candidates filtered by point-in-polygon
 *     - `geoGraticuleChords` — the clipped chord segments
 *     - `geoCityNodes`       — the twelve capitals in plane space
 *
 *   PER-FRAME, worklet-marked:
 *     - everything else
 *
 * PROJECTION. `GEO_PERSPECTIVE_K` is 0.22 with **no near-plane clamp** —
 * `bootGeo.ts:528` is `1 / (1 + depth * 0.22)`. Omit `minPerspectiveDenom`
 * entirely; never pass `undefined` explicitly and never default it on.
 *
 * WHY SO MUCH IS BUILD-ONCE. `inside()` is an even-odd point-in-polygon test
 * across 270 coastline points. The web calls it per frame for both the terrain
 * mesh seeding and the graticule, which is ~2,800 and ~640 calls respectively —
 * roughly 930,000 point comparisons every frame at 60 fps. Every one of those
 * inputs is FIXED in world space; only the projection moves. So both are
 * computed once here and merely projected per frame. This is the
 * `craftGridLines` lesson (6b-1) at a far larger scale, and jest would stay
 * green either way because its mock happily executes the slow version.
 *
 * The radar sweep is the exception and stays per-frame: its X position depends
 * on `elapsedSec`, and it is only ~62 `inside()` calls, so it is cheap enough
 * to match the web exactly rather than approximate it on a quantised grid.
 *
 * TRADES ARE DERIVED FROM TIME, NOT ACCUMULATED. The web keeps a mutable
 * `trades[]` array plus `lastSpawn`, `spawnSeed` and `tradeCount`, mutating
 * them every frame. A worklet cannot carry that: it runs on the UI thread and
 * captures values, so a mutated capture does not reliably persist between
 * frames. `activeGeoTrades(elapsedSec)` instead reconstructs the in-flight set
 * as a pure function of time, exactly as `coreArcs.ts`'s `activeFlowArcs` does
 * for `CoreScene`.
 *
 * That reconstruction is EXACT, not an approximation, because the web's spawn
 * rule is itself deterministic: the first spawn lands on the first frame past
 * `progress > 0.5`, they repeat every `TRADE_SPAWN_INTERVAL_SEC`, and each
 * consumes exactly four `hashRandom` draws from a fixed seed base. The web's
 * `trades.length < 9` cap never binds — the longest flight is 2.4 s against a
 * 0.34 s interval, so at most 8 are ever in flight — and a test pins that.
 */

/** Ground-plane Y. Everything on the map sits on it. */
export const GEO_GROUND_Y = 0.55;

/** Projection scale as a fraction of `min(width, height)` (the web's `S0`). */
export const GEO_PROJ_SCALE_FACTOR = 0.3;

/** Perspective divisor coefficient. NO clamp — see the header. */
export const GEO_PERSPECTIVE_K = 0.22;

/** Fixed camera pitch, radians. */
export const GEO_PITCH = 0.52;

/** The web lifts the scene centre by 6px (`height / 2 - 6`). */
export const GEO_CENTER_Y_NUDGE = -6;

/** A point on the ground plane, in the scene's normalised world space. */
export interface GeoPlanePoint {
  readonly x: number;
  readonly z: number;
}

/** One coastline, projected into plane space. */
export interface GeoPlanePoly {
  readonly name: string;
  readonly points: readonly GeoPlanePoint[];
}

/** One point of the rising terrain dot-mesh. */
export interface GeoTerrainDot {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly phase: number;
}

/** A capital-city node in plane space. */
export interface GeoCityNode {
  readonly x: number;
  readonly z: number;
  readonly importance: number;
  readonly label: string;
  readonly phase: number;
}

/** One run of consecutive in-landmass grid points along a graticule chord. */
export interface GeoChordSegment {
  readonly points: readonly GeoPlanePoint[];
}

/** `[lon, lat]` → plane space. Verbatim from the web's `lonLatToPlane`. */
export function geoLonLatToPlane(lonLat: GeoLonLat): GeoPlanePoint {
  return { x: (lonLat[0] - 4) * 0.068, z: (48 - lonLat[1]) / 10 };
}

/** The seven coastlines in plane space. BUILD-ONCE. */
export function geoPlanePolys(): readonly GeoPlanePoly[] {
  return GEO_LANDMASSES.map((landmass) => {
    return {
      name: landmass.name,
      points: landmass.points.map(geoLonLatToPlane),
    };
  });
}

/**
 * Even-odd point-in-polygon across every landmass. BUILD-ONCE ONLY.
 *
 * Exported so the terrain/graticule builders and the per-frame radar sweep can
 * share one implementation, but it is **not** worklet-marked: the only
 * per-frame caller is the sweep, which builds its own marked wrapper.
 */
export function geoPointInside(
  polys: readonly GeoPlanePoly[],
  x: number,
  z: number,
): boolean {
  for (const poly of polys) {
    let isInside = false;
    const points = poly.points;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const curX = points[i].x;
      const curZ = points[i].z;
      const prevX = points[j].x;
      const prevZ = points[j].z;

      if (
        curZ > z !== prevZ > z &&
        x < ((prevX - curX) * (z - curZ)) / (prevZ - curZ) + curX
      ) {
        isInside = !isInside;
      }
    }

    if (isInside) {
      return true;
    }
  }

  return false;
}

/** Ridge height at a plane coordinate — Alps, Pyrenees, Highlands, plus noise. */
function geoRidgeHeight(x: number, z: number): number {
  const alps =
    0.22 *
    Math.exp(-((x - 0.41) * (x - 0.41) + (z - 0.15) * (z - 0.15)) / 0.016);

  const pyrenees =
    0.11 *
    Math.exp(-((x + 0.24) * (x + 0.24) + (z - 0.52) * (z - 0.52)) / 0.006);

  const highlands =
    0.09 * Math.exp(-((x + 0.58) * (x + 0.58) + (z + 0.9) * (z + 0.9)) / 0.006);

  const noise =
    0.03 * Math.sin(x * 9.1 + z * 5.3) + 0.025 * Math.sin(x * 4.2 - z * 7.7);

  return Math.max(0.015, alps + pyrenees + highlands + noise + 0.03);
}

/** The terrain dot-mesh. BUILD-ONCE — see the header. */
export function geoTerrainDots(
  polys: readonly GeoPlanePoly[],
): readonly GeoTerrainDot[] {
  const dots: GeoTerrainDot[] = [];

  for (let x = -1; x <= 1.001; x += 0.042) {
    for (let z = -1.15; z <= 1.301; z += 0.042) {
      if (!geoPointInside(polys, x, z)) {
        continue;
      }

      dots.push({
        x,
        z,
        height: geoRidgeHeight(x, z),
        phase: hashRandom(dots.length * 7 + 3) * 6.283,
      });
    }
  }

  return dots;
}

/** The graticule chords, clipped to the landmass. BUILD-ONCE. */
export function geoGraticuleChords(
  polys: readonly GeoPlanePoly[],
): readonly GeoChordSegment[] {
  const segments: GeoChordSegment[] = [];

  for (let x = -0.9; x <= 0.91; x += 0.3) {
    collectChord(
      segments,
      polys,
      (z) => {
        return { x, z };
      },
      -1.15,
      1.301,
      0.05,
    );
  }

  for (let z = -0.9; z <= 0.91; z += 0.3) {
    collectChord(
      segments,
      polys,
      (x) => {
        return { x, z };
      },
      -1,
      1.001,
      0.05,
    );
  }

  return segments;
}

/** Walk one chord, emitting a segment per run of consecutive inside points. */
function collectChord(
  into: GeoChordSegment[],
  polys: readonly GeoPlanePoly[],
  at: (value: number) => GeoPlanePoint,
  from: number,
  to: number,
  step: number,
): void {
  let run: GeoPlanePoint[] = [];

  for (let value = from; value <= to; value += step) {
    const point = at(value);

    if (geoPointInside(polys, point.x, point.z)) {
      run.push(point);
      continue;
    }

    if (run.length > 1) {
      into.push({ points: run });
    }

    run = [];
  }

  if (run.length > 1) {
    into.push({ points: run });
  }
}

/** The twelve capitals in plane space. BUILD-ONCE. */
export function geoCityNodes(): readonly GeoCityNode[] {
  return GEO_CITIES.map((city, index) => {
    const plane = geoLonLatToPlane([city.lon, city.lat]);

    return {
      x: plane.x,
      z: plane.z,
      importance: city.importance,
      label: city.name,
      phase: hashRandom(index * 13 + 5) * 6.283,
    };
  });
}

/** Camera yaw at `elapsedSec` — a slow orbit from a 0.35 rad offset. */
export function geoYaw(elapsedSec: number): number {
  "worklet";

  return elapsedSec * 0.28 + 0.35;
}

/** The whole-frame flicker — a fast shimmer plus a rare dropout to 55%. */
export function geoFlicker(elapsedSec: number): number {
  "worklet";

  const shimmer =
    0.87 + 0.13 * Math.sin(elapsedSec * 33 + Math.sin(elapsedSec * 8) * 4);

  if (hashRandom(Math.floor(elapsedSec * 6) + 5) > 0.94) {
    return shimmer * 0.55;
  }

  return shimmer;
}

/** One of the three tactical table rings under the map. */
export interface GeoTableRing {
  readonly radius: number;
  readonly alpha: number;
  readonly lineWidth: number;
  readonly dash?: readonly number[];
  readonly rotationRate?: number;
}

/** The table rings, in the web's draw order. */
export const GEO_TABLE_RINGS: readonly GeoTableRing[] = [
  { radius: 1.6, alpha: 0.4, lineWidth: 1.5 },
  { radius: 1.72, alpha: 0.15, lineWidth: 1, dash: [3, 7], rotationRate: -0.5 },
  { radius: 0.42, alpha: 0.25, lineWidth: 1, dash: [2, 5], rotationRate: 0.8 },
];

/** The rings sit slightly above the ground plane. */
export const GEO_RING_Y: number = GEO_GROUND_Y + 0.06;

/** Vertices per table ring — the web's `step <= 64`. */
export const GEO_RING_SEGMENTS = 64;

/** How far the graticule has faded in, 0→1. */
export function geoGraticulePhase(progress: number): number {
  "worklet";

  return ease((progress - 0.06) / 0.3);
}

/** How far the coastlines have traced themselves in, 0→1. */
export function geoCoastlinePhase(progress: number): number {
  "worklet";

  return ease(progress / 0.3);
}

/** How far the terrain mesh has risen, 0→1. */
export function geoTerrainPhase(progress: number): number {
  "worklet";

  return ease((progress - 0.16) / 0.32);
}

/**
 * How many points of a poly to draw, given the trace-in budget remaining.
 *
 * The web walks the polys in order, spending a shared budget; a poly draws
 * `min(len + 1, remaining)` points and the budget drops by `len + 1` whether or
 * not it was fully spent. The `+ 1` closes the loop back to the first point.
 */
export function geoTracedPointCount(
  polyLength: number,
  remaining: number,
): number {
  "worklet";

  return Math.min(polyLength + 1, remaining);
}

/** The total trace-in budget across every coastline. */
export function geoTotalTracePoints(polys: readonly GeoPlanePoly[]): number {
  "worklet";

  let total = 0;

  for (const poly of polys) {
    total += poly.points.length + 1;
  }

  return total;
}

/** The radar sweep's X position — a sawtooth across the plane. */
export function geoSweepX(elapsedSec: number): number {
  "worklet";

  return -1 + ((elapsedSec * 0.32) % 1) * 2;
}

/** A terrain dot's raised height at `elapsedSec`. */
export function geoDotRise(
  dot: GeoTerrainDot,
  terrainPhase: number,
  elapsedSec: number,
): number {
  "worklet";

  return (
    dot.height *
    terrainPhase *
    (1 + 0.1 * Math.sin(elapsedSec * 1.2 + dot.phase))
  );
}

/** How near a projected depth reads, 0→1. Shared by dots, bars and coastlines. */
export function geoNearness(depth: number): number {
  "worklet";

  return clamp01((0.9 - depth) / 1.8);
}

/** Dots above this height get a stem down to the plane. */
export const GEO_DOT_STEM_MIN_HEIGHT = 0.14;

/** Trades start spawning at this point of the boot. */
const TRADE_START_PROGRESS = 0.5;

/** Seconds between trade spawns. */
export const TRADE_SPAWN_INTERVAL_SEC = 0.34;

/** The web's concurrent-trade cap. Never actually binds — see the header. */
export const TRADE_MAX_CONCURRENT = 9;

/** First and stride of the `hashRandom` seeds each trade consumes. */
const TRADE_SEED_BASE = 11;
const TRADE_SEED_STRIDE = 4;

/** One trade in flight between two cities. */
export interface GeoTrade {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly flightFrac: number;
  readonly buy: boolean;
}

/** When trade `index` spawns, in seconds since mount. */
function tradeSpawnSec(index: number): number {
  "worklet";

  return (
    (BOOT_DURATION_MS / 1000) * TRADE_START_PROGRESS +
    index * TRADE_SPAWN_INTERVAL_SEC
  );
}

/** Trade `index`'s flight duration. */
function tradeDurationSec(index: number): number {
  "worklet";

  return (
    1.3 + hashRandom(TRADE_SEED_BASE + 2 + TRADE_SEED_STRIDE * index) * 1.1
  );
}

/** How many trades have spawned by `elapsedSec`. */
export function spawnedTradeCount(elapsedSec: number): number {
  "worklet";

  const first = tradeSpawnSec(0);

  if (elapsedSec < first) {
    return 0;
  }

  return Math.floor((elapsedSec - first) / TRADE_SPAWN_INTERVAL_SEC) + 1;
}

/**
 * The trades in flight at `elapsedSec`, oldest first.
 *
 * Pure in time — see the header for why the web's mutable `trades[]` cannot be
 * ported directly into a worklet.
 */
export function activeGeoTrades(elapsedSec: number): readonly GeoTrade[] {
  "worklet";

  const spawned = spawnedTradeCount(elapsedSec);
  const cityCount = GEO_CITIES.length;
  const trades: GeoTrade[] = [];

  for (let index = 0; index < spawned; index++) {
    const flightFrac =
      (elapsedSec - tradeSpawnSec(index)) / tradeDurationSec(index);

    if (flightFrac < 0 || flightFrac >= 1) {
      continue;
    }

    const seed = TRADE_SEED_BASE + TRADE_SEED_STRIDE * index;
    const fromIndex = Math.floor(hashRandom(seed) * cityCount);
    let toIndex = Math.floor(hashRandom(seed + 1) * cityCount);

    if (toIndex === fromIndex) {
      toIndex = (toIndex + 3) % cityCount;
    }

    trades.push({
      fromIndex,
      toIndex,
      flightFrac,
      buy: hashRandom(seed + 3) > 0.45,
    });
  }

  return trades;
}

/** A point in the scene's world space, before projection. */
export interface GeoWorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A trade arc's peak lift, from the distance it spans. */
export function tradeArcLift(from: GeoCityNode, to: GeoCityNode): number {
  "worklet";

  return 0.16 + Math.hypot(to.x - from.x, to.z - from.z) * 0.22;
}

/** A point along a trade's arc at `frac`, in world space. */
export function tradeArcPoint(
  from: GeoCityNode,
  to: GeoCityNode,
  lift: number,
  frac: number,
): GeoWorldPoint {
  "worklet";

  return {
    x: from.x + (to.x - from.x) * frac,
    y: GEO_GROUND_Y - 4 * lift * frac * (1 - frac),
    z: from.z + (to.z - from.z) * frac,
  };
}

/** How far a city's bar has grown, staggered by its far→near draw order. */
export function cityBarPhase(orderIndex: number, progress: number): number {
  "worklet";

  return ease((progress - 0.38 - 0.02 * orderIndex) / 0.2);
}

/** A city bar's height at `elapsedSec`. */
export function cityBarHeight(
  city: GeoCityNode,
  barPhase: number,
  elapsedSec: number,
): number {
  "worklet";

  return (
    (0.14 + 0.34 * city.importance) *
    barPhase *
    (0.72 + 0.28 * Math.sin(elapsedSec * 1.5 + city.phase))
  );
}

/** The most important capitals take the alt accent and earn a label. */
export function cityIsHot(city: GeoCityNode): boolean {
  "worklet";

  return city.importance >= 0.7;
}

/** A hot city's volume readout. */
export function cityVolumeLabel(city: GeoCityNode, elapsedSec: number): string {
  "worklet";

  return `VOL ${120 + Math.round(80 * Math.sin(elapsedSec * 0.9 + city.phase) + 80)}M`;
}

/** How far the hot-city labels have faded in, 0→1. */
export function cityLabelPhase(progress: number): number {
  "worklet";

  return ease((progress - 0.55) / 0.12);
}

/** The four corner telemetry readouts. */
export interface GeoTelemetry {
  readonly title: string;
  readonly mesh: string;
  readonly yaw: string;
  readonly routes: string;
}

/**
 * Corner telemetry.
 *
 * The title opens with `BOOT_TELEMETRY_BULLET`, not the web's `◉`
 * FISHEYE, which no bundled face covers.
 */
export function geoTelemetry(
  dotCount: number,
  yaw: number,
  spawned: number,
  live: number,
): GeoTelemetry {
  "worklet";

  return {
    title: `${BOOT_TELEMETRY_BULLET} GEO-FEED · EMEA WEST TACTICAL`,
    mesh: `NODES 12 · MESH ${dotCount} pts`,
    yaw: `YAW ${((yaw * 57.29) % 360).toFixed(1)}°`,
    routes: `ROUTES ${spawned} · LIVE ${live}`,
  };
}

/** Which accent the status banner takes. */
type GeoStatusTone = "accent" | "accentAlt" | "positive";

/** The status banner's text and tone. */
export interface GeoStatus {
  readonly text: string;
  readonly tone: GeoStatusTone;
}

/** The four-state status ladder. */
export function geoStatus(progress: number): GeoStatus {
  "worklet";

  if (progress >= 0.85) {
    return { text: "GEO GRID STABLE", tone: "positive" };
  }

  if (progress >= 0.55) {
    return {
      text: "NODES ONLINE ▸ ROUTING ORDER FLOW",
      tone: "accentAlt",
    };
  }

  if (progress >= 0.3) {
    return { text: "RENDERING TERRAIN MESH", tone: "accent" };
  }

  return { text: "TRACING COASTLINE", tone: "accent" };
}

/** The banner blinks until the grid is stable, then holds solid. */
export function geoBlinkAlpha(progress: number, elapsedSec: number): number {
  "worklet";

  if (progress >= 0.85) {
    return 1;
  }

  return 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5));
}
