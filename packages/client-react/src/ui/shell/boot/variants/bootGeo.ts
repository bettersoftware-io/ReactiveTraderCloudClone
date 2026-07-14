// drawBootGeo — verbatim port of the v3 prototype's _drawBootGeo
// (Reactive Trader.dc.html _drawBootGeo(start, DUR)). A Western-Europe tactical
// map: hand-placed lon/lat coastlines (continent, GB, Ireland, Sicily, Sardinia,
// Corsica, Zealand) trace in as glowing polylines, a terrain dot-mesh rises for
// the Alps/Pyrenees/Highlands, 12 capital nodes pulse volume bars while buy/sell
// trades arc city-to-city, plus a graticule and a radar sweep.

import {
  BOOT_DURATION_MS,
  type BootDrawCtx,
  type BootFrameFn,
  ease,
  hexToRgba,
} from "../bootCanvas";

/** A [lon, lat] coordinate pair from the source coastline tables. */
type LonLat = readonly [number, number];

/** A projected [X, Z] point in the geo-scene's normalized plane space. */
type PlanePoint = readonly [number, number];

/** A closed coastline polyline in normalized plane space. */
type Poly = readonly PlanePoint[];

/** One point of the rising terrain dot-mesh. */
interface TerrainDot {
  worldX: number;
  worldZ: number;
  height: number;
  phase: number;
}

/** A capital-city node: position, importance weight, label, phase. */
interface CityNode {
  worldX: number;
  worldZ: number;
  importance: number;
  label: string;
  phase: number;
}

/** An in-flight buy/sell trade arcing between two cities. */
interface Trade {
  fromIndex: number;
  toIndex: number;
  startSec: number;
  durationSec: number;
  buy: boolean;
}

/** 3D→2D projected point with perspective-divide depth and foreshortening factor. */
interface GeoProjected {
  x: number;
  y: number;
  z: number;
  perspective: number;
}

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

/** Deterministic pseudo-random in [0,1) from an integer seed. Verbatim from prototype. */
function hashRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Simplified western-europe coastlines (lon,lat) → normalized X,Z. Copied
// verbatim from the prototype's hand-placed coordinate tables.
const MAIN: readonly LonLat[] = [
  [10.6, 57.7],
  [9.6, 57.2],
  [8.6, 57.1],
  [8.1, 56.5],
  [8.1, 55.9],
  [8.3, 55.3],
  [8.6, 54.9],
  [8.6, 54.3],
  [8.9, 53.9],
  [8.1, 53.6],
  [7.0, 53.3],
  [6.1, 53.4],
  [5.4, 53.2],
  [4.7, 52.9],
  [4.6, 52.4],
  [4.0, 52.0],
  [3.7, 51.6],
  [3.4, 51.4],
  [2.5, 51.1],
  [1.6, 50.9],
  [1.5, 50.2],
  [0.1, 49.5],
  [-0.4, 49.3],
  [-1.1, 49.4],
  [-1.3, 49.7],
  [-1.9, 49.7],
  [-1.6, 49.2],
  [-1.5, 48.8],
  [-2.0, 48.6],
  [-2.7, 48.6],
  [-3.6, 48.7],
  [-4.8, 48.4],
  [-4.6, 48.0],
  [-4.4, 47.8],
  [-3.1, 47.6],
  [-2.5, 47.3],
  [-1.9, 46.9],
  [-1.1, 46.3],
  [-1.2, 45.8],
  [-1.0, 45.5],
  [-1.2, 44.6],
  [-1.5, 43.5],
  [-1.8, 43.4],
  [-2.9, 43.4],
  [-4.5, 43.4],
  [-5.8, 43.6],
  [-7.0, 43.6],
  [-8.0, 43.7],
  [-9.2, 43.2],
  [-8.9, 42.6],
  [-8.8, 42.1],
  [-8.8, 41.0],
  [-9.4, 39.4],
  [-9.5, 38.8],
  [-9.2, 38.4],
  [-8.8, 37.9],
  [-8.9, 37.0],
  [-7.9, 37.0],
  [-7.4, 37.2],
  [-6.9, 37.2],
  [-6.3, 36.8],
  [-6.0, 36.2],
  [-5.6, 36.0],
  [-5.4, 36.1],
  [-4.4, 36.7],
  [-3.5, 36.7],
  [-2.4, 36.8],
  [-1.9, 37.2],
  [-0.7, 37.6],
  [-0.6, 38.2],
  [0.2, 38.7],
  [-0.3, 39.5],
  [0.0, 40.0],
  [0.7, 40.8],
  [1.2, 41.1],
  [2.1, 41.3],
  [3.2, 41.9],
  [3.2, 42.4],
  [3.0, 43.0],
  [3.5, 43.3],
  [4.1, 43.5],
  [4.6, 43.4],
  [5.1, 43.3],
  [5.8, 43.1],
  [6.6, 43.2],
  [7.5, 43.7],
  [8.7, 44.4],
  [9.3, 44.3],
  [9.9, 44.0],
  [10.3, 43.5],
  [10.5, 42.9],
  [11.1, 42.4],
  [11.7, 42.1],
  [12.2, 41.9],
  [12.6, 41.4],
  [13.0, 41.3],
  [13.6, 41.2],
  [14.0, 40.8],
  [14.5, 40.6],
  [15.0, 40.2],
  [15.6, 40.0],
  [15.7, 39.5],
  [16.0, 38.9],
  [15.9, 38.5],
  [15.6, 38.2],
  [15.7, 37.9],
  [16.1, 38.1],
  [16.6, 38.4],
  [17.1, 38.9],
  [17.2, 39.4],
  [16.5, 39.8],
  [17.0, 40.3],
  [18.0, 39.8],
  [18.5, 40.1],
  [18.0, 40.7],
  [16.9, 41.1],
  [16.2, 41.4],
  [15.9, 41.6],
  [16.2, 41.9],
  [15.4, 41.9],
  [14.8, 42.1],
  [14.0, 42.5],
  [13.6, 43.2],
  [13.5, 43.6],
  [12.9, 43.9],
  [12.5, 44.2],
  [12.3, 45.1],
  [12.6, 45.5],
  [13.1, 45.6],
  [13.8, 45.6],
  [13.7, 46.5],
  [14.6, 47.7],
  [14.9, 48.7],
  [14.8, 50.0],
  [14.9, 51.0],
  [14.6, 52.0],
  [14.3, 53.0],
  [14.3, 53.9],
  [13.0, 54.4],
  [12.1, 54.2],
  [11.1, 54.4],
  [10.8, 54.3],
  [10.0, 54.5],
  [9.9, 54.8],
  [10.2, 55.5],
  [10.5, 56.2],
  [10.3, 56.7],
];
const GB: readonly LonLat[] = [
  [-5.7, 50.1],
  [-5.0, 50.1],
  [-4.2, 50.3],
  [-3.5, 50.5],
  [-2.5, 50.6],
  [-1.9, 50.7],
  [-1.0, 50.8],
  [0.3, 50.8],
  [1.0, 51.0],
  [1.4, 51.2],
  [1.0, 51.5],
  [1.6, 52.1],
  [1.75, 52.6],
  [1.3, 53.0],
  [0.3, 53.0],
  [0.1, 53.5],
  [-0.2, 54.1],
  [-1.2, 54.6],
  [-1.5, 55.2],
  [-2.0, 55.8],
  [-2.9, 56.1],
  [-2.5, 56.4],
  [-2.1, 57.1],
  [-1.8, 57.5],
  [-2.9, 57.7],
  [-3.9, 57.65],
  [-3.4, 58.0],
  [-3.1, 58.4],
  [-3.0, 58.6],
  [-4.4, 58.55],
  [-5.0, 58.6],
  [-5.3, 58.1],
  [-5.8, 57.3],
  [-5.4, 56.9],
  [-5.5, 56.4],
  [-5.7, 55.4],
  [-5.1, 55.6],
  [-5.0, 55.0],
  [-4.4, 54.7],
  [-3.6, 54.9],
  [-3.1, 54.9],
  [-3.3, 54.4],
  [-3.2, 54.1],
  [-2.9, 53.7],
  [-3.1, 53.4],
  [-3.9, 53.3],
  [-4.5, 53.3],
  [-4.7, 52.8],
  [-4.1, 52.4],
  [-4.4, 52.0],
  [-5.2, 51.9],
  [-4.6, 51.6],
  [-3.7, 51.5],
  [-3.0, 51.4],
  [-2.6, 51.6],
  [-3.2, 51.2],
  [-4.2, 51.1],
  [-4.5, 50.9],
  [-5.7, 50.1],
];
const IRE: readonly LonLat[] = [
  [-6.1, 52.1],
  [-6.0, 52.9],
  [-6.1, 53.3],
  [-6.1, 53.9],
  [-5.6, 54.25],
  [-5.7, 54.7],
  [-6.0, 55.1],
  [-6.9, 55.2],
  [-7.7, 55.3],
  [-8.3, 55.15],
  [-8.1, 54.8],
  [-8.5, 54.6],
  [-9.8, 54.3],
  [-9.9, 53.9],
  [-10.0, 53.4],
  [-9.5, 53.25],
  [-9.1, 53.15],
  [-9.4, 52.9],
  [-9.9, 52.55],
  [-10.4, 52.1],
  [-10.3, 51.85],
  [-9.6, 51.6],
  [-8.5, 51.5],
  [-8.0, 51.75],
  [-7.0, 52.1],
];
const DKZ: readonly LonLat[] = [
  [10.9, 55.7],
  [11.3, 55.95],
  [12.0, 56.0],
  [12.6, 55.7],
  [12.5, 55.3],
  [12.0, 55.0],
  [11.3, 55.2],
  [10.9, 55.4],
];
const SIC: readonly LonLat[] = [
  [12.4, 37.8],
  [13.1, 38.1],
  [13.7, 38.1],
  [14.5, 38.05],
  [15.2, 38.2],
  [15.6, 38.26],
  [15.3, 37.6],
  [15.2, 37.1],
  [15.0, 36.7],
  [14.4, 36.7],
  [13.5, 37.1],
  [12.6, 37.6],
];
const SAR: readonly LonLat[] = [
  [8.2, 40.9],
  [8.5, 41.2],
  [9.2, 41.25],
  [9.6, 40.9],
  [9.8, 40.5],
  [9.6, 39.2],
  [8.9, 38.9],
  [8.4, 38.9],
  [8.4, 39.7],
  [8.15, 40.3],
];
const COR: readonly LonLat[] = [
  [8.6, 42.4],
  [9.0, 42.7],
  [9.35, 43.0],
  [9.45, 42.7],
  [9.55, 42.1],
  [9.4, 41.7],
  [9.2, 41.4],
  [8.8, 41.5],
  [8.6, 41.9],
];

/** Project a [lon, lat] pair into the geo-scene's normalized plane space. */
function lonLatToPlane(lonLat: LonLat): PlanePoint {
  return [(lonLat[0] - 4) * 0.068, (48 - lonLat[1]) / 10];
}

// cities: [lon,lat,importance,label]
const CITY: readonly (readonly [number, number, number, string])[] = [
  [-0.13, 51.5, 1.0, "LONDON"],
  [2.35, 48.86, 0.9, "PARIS"],
  [8.68, 50.11, 0.85, "FRANKFURT"],
  [9.19, 45.46, 0.72, "MILAN"],
  [4.9, 52.37, 0.65, "AMSTERDAM"],
  [8.54, 47.37, 0.65, "ZURICH"],
  [-3.7, 40.42, 0.6, "MADRID"],
  [12.5, 41.9, 0.55, "ROME"],
  [-6.26, 53.35, 0.5, "DUBLIN"],
  [-9.14, 38.72, 0.45, "LISBON"],
  [4.35, 50.85, 0.5, "BRUSSELS"],
  [12.57, 55.68, 0.5, "COPENHAGEN"],
];

const GY = 0.55;
const S0 = 0.3;

/**
 * createBootGeo — factory that precomputes the geo scene's static geometry
 * once per boot (coastline polylines, terrain mesh, city nodes) and returns
 * the per-frame draw closure. Verbatim port of prototype _drawBootGeo.
 */
export function createBootGeo(scene: BootDrawCtx): BootFrameFn {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;

  function resize(): void {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  resize();

  const polys: readonly Poly[] = [MAIN, GB, IRE, SIC, SAR, COR, DKZ].map(
    (poly) => {
      return poly.map(lonLatToPlane);
    },
  );

  function inside(pointX: number, pointZ: number): boolean {
    for (const poly of polys) {
      let isInside = false;

      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const curX = poly[i][0];
        const curZ = poly[i][1];
        const prevX = poly[j][0];
        const prevZ = poly[j][1];

        if (
          curZ > pointZ !== prevZ > pointZ &&
          pointX < ((prevX - curX) * (pointZ - curZ)) / (prevZ - curZ) + curX
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

  // terrain dot mesh with ridge heights (Alps / Pyrenees / Highlands)
  const dots: TerrainDot[] = [];

  for (let gridX = -1; gridX <= 1.001; gridX += 0.042) {
    for (let gridZ = -1.15; gridZ <= 1.301; gridZ += 0.042) {
      if (!inside(gridX, gridZ)) {
        continue;
      }

      const alpsHeight =
        0.22 *
        Math.exp(
          -((gridX - 0.41) * (gridX - 0.41) + (gridZ - 0.15) * (gridZ - 0.15)) /
            0.016,
        );
      const pyreneesHeight =
        0.11 *
        Math.exp(
          -((gridX + 0.24) * (gridX + 0.24) + (gridZ - 0.52) * (gridZ - 0.52)) /
            0.006,
        );
      const highlandsHeight =
        0.09 *
        Math.exp(
          -((gridX + 0.58) * (gridX + 0.58) + (gridZ + 0.9) * (gridZ + 0.9)) /
            0.006,
        );
      const noise =
        0.03 * Math.sin(gridX * 9.1 + gridZ * 5.3) +
        0.025 * Math.sin(gridX * 4.2 - gridZ * 7.7);
      dots.push({
        worldX: gridX,
        worldZ: gridZ,
        height: Math.max(
          0.015,
          alpsHeight + pyreneesHeight + highlandsHeight + noise + 0.03,
        ),
        phase: hashRandom(dots.length * 7 + 3) * 6.283,
      });
    }
  }

  const cities: CityNode[] = CITY.map((cityData, index) => {
    const plane = lonLatToPlane([cityData[0], cityData[1]]);
    return {
      worldX: plane[0],
      worldZ: plane[1],
      importance: cityData[2],
      label: cityData[3],
      phase: hashRandom(index * 13 + 5) * 6.283,
    };
  });

  const trades: Trade[] = [];
  let lastSpawn = 0;
  let spawnSeed = 11;
  let tradeCount = 0;

  return () => {
    if (canvas.width !== canvas.offsetWidth) {
      resize();
    }

    const elapsedSec = (performance.now() - scene.start) / 1000;
    const progress = Math.min(
      1,
      (performance.now() - scene.start) / BOOT_DURATION_MS,
    );
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2 - 6;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0,3,6,0.5)";
    ctx.fillRect(0, 0, width, height);
    const yaw = elapsedSec * 0.28 + 0.35;
    const cosPitch = Math.cos(0.52);
    const sinPitch = Math.sin(0.52);
    const projScale = Math.min(width, height) * S0;

    function project(x: number, y: number, z: number): GeoProjected {
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const rotX = x * cosYaw - z * sinYaw;
      const rotZ = x * sinYaw + z * cosYaw;
      const tiltY = y * cosPitch - rotZ * sinPitch;
      const depth = y * sinPitch + rotZ * cosPitch;
      const perspective = 1 / (1 + depth * 0.22);
      return {
        x: centerX + rotX * projScale * perspective,
        y: centerY + tiltY * projScale * perspective,
        z: depth,
        perspective,
      };
    }

    let flickerAlpha =
      0.87 + 0.13 * Math.sin(elapsedSec * 33 + Math.sin(elapsedSec * 8) * 4);

    if (hashRandom(Math.floor(elapsedSec * 6) + 5) > 0.94) {
      flickerAlpha *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = flickerAlpha;

    // tactical table ring under the map
    function ring(
      radius: number,
      alpha: number,
      lineWidth?: number,
      dash?: number[],
      rotation?: number,
    ): void {
      ctx.strokeStyle = hexToRgba(accent, alpha);
      ctx.lineWidth = lineWidth || 1;

      if (dash) {
        ctx.setLineDash(dash);
      }

      ctx.beginPath();

      for (let step = 0; step <= 64; step++) {
        const angle = (step / 64) * 6.283 + (rotation || 0);
        const point = project(
          Math.cos(angle) * radius,
          GY + 0.06,
          Math.sin(angle) * radius,
        );

        if (step === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    ring(1.6, 0.4, 1.5);
    ring(1.72, 0.15, 1, [3, 7], -elapsedSec * 0.5);
    ring(0.42, 0.25, 1, [2, 5], elapsedSec * 0.8);

    // graticule chords clipped to the landmass
    const graticulePhase = ease((progress - 0.06) / 0.3);

    if (graticulePhase > 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexToRgba(accent, 0.13 * graticulePhase);

      for (let gridX = -0.9; gridX <= 0.91; gridX += 0.3) {
        let drawing = false;
        ctx.beginPath();

        for (let gridZ = -1.15; gridZ <= 1.301; gridZ += 0.05) {
          if (inside(gridX, gridZ)) {
            const point = project(gridX, GY, gridZ);

            if (drawing) {
              ctx.lineTo(point.x, point.y);
            } else {
              ctx.moveTo(point.x, point.y);
            }

            drawing = true;
          } else {
            drawing = false;
          }
        }

        ctx.stroke();
      }

      for (let gridZ = -0.9; gridZ <= 0.91; gridZ += 0.3) {
        let drawing = false;
        ctx.beginPath();

        for (let gridX = -1; gridX <= 1.001; gridX += 0.05) {
          if (inside(gridX, gridZ)) {
            const point = project(gridX, GY, gridZ);

            if (drawing) {
              ctx.lineTo(point.x, point.y);
            } else {
              ctx.moveTo(point.x, point.y);
            }

            drawing = true;
          } else {
            drawing = false;
          }
        }

        ctx.stroke();
      }
    }

    // coastlines trace themselves in, glow pass + core pass
    const coastlinePhase = ease(progress / 0.3);
    const totalPoints = polys.reduce((sum, poly) => {
      return sum + poly.length + 1;
    }, 0);
    let remaining = Math.max(2, Math.floor(coastlinePhase * totalPoints));

    polys.forEach((poly) => {
      const pointCount = Math.min(poly.length + 1, remaining);

      if (pointCount >= 2) {
        function path(): void {
          ctx.beginPath();

          for (let i = 0; i < pointCount; i++) {
            const vertex = poly[i % poly.length];
            const point = project(vertex[0], GY, vertex[1]);

            if (i === 0) {
              ctx.moveTo(point.x, point.y);
            } else {
              ctx.lineTo(point.x, point.y);
            }
          }
        }

        ctx.strokeStyle = hexToRgba(accent, 0.16);
        ctx.lineWidth = 4;
        path();
        ctx.stroke();
        ctx.strokeStyle = hexToRgba(accent, 0.85);
        ctx.lineWidth = 1.5;
        path();
        ctx.stroke();

        if (pointCount < poly.length + 1) {
          const headVertex = poly[(pointCount - 1) % poly.length];
          const headPoint = project(headVertex[0], GY, headVertex[1]);
          ctx.fillStyle = "#fff";
          ctx.shadowColor = accent;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(headPoint.x, headPoint.y, 2.6, 0, 6.283);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      remaining -= poly.length + 1;
    });

    // terrain dot mesh rises out of the plane
    const terrainPhase = ease((progress - 0.16) / 0.32);

    if (terrainPhase > 0) {
      dots.forEach((dot) => {
        const raisedHeight =
          dot.height *
          terrainPhase *
          (1 + 0.1 * Math.sin(elapsedSec * 1.2 + dot.phase));
        const point = project(dot.worldX, GY - raisedHeight, dot.worldZ);
        const nearness = clamp((0.9 - point.z) / 1.8);
        const alpha = (0.12 + 0.5 * nearness) * terrainPhase;

        if (dot.height > 0.14) {
          const base = project(dot.worldX, GY, dot.worldZ);
          ctx.strokeStyle = hexToRgba(accent, alpha * 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }

        ctx.fillStyle = hexToRgba(accent, alpha);
        ctx.fillRect(point.x - 0.8, point.y - 0.8, 1.6, 1.6);
      });
    }

    // radar sweep line across the plane
    const sweepX = -1 + ((elapsedSec * 0.32) % 1) * 2;

    {
      let drawing = false;
      ctx.strokeStyle = hexToRgba(accentAlt, 0.5);
      ctx.lineWidth = 1.4;
      ctx.beginPath();

      for (let gridZ = -1.15; gridZ <= 1.301; gridZ += 0.04) {
        if (inside(sweepX, gridZ)) {
          const point = project(sweepX, GY, gridZ);

          if (drawing) {
            ctx.lineTo(point.x, point.y);
          } else {
            ctx.moveTo(point.x, point.y);
          }

          drawing = true;
        } else {
          drawing = false;
        }
      }

      ctx.stroke();
    }

    // trades: spawn + arc flight between cities
    if (progress > 0.5 && elapsedSec - lastSpawn > 0.34 && trades.length < 9) {
      lastSpawn = elapsedSec;
      const fromIndex = Math.floor(hashRandom(spawnSeed++) * cities.length);
      let toIndex = Math.floor(hashRandom(spawnSeed++) * cities.length);

      if (toIndex === fromIndex) {
        toIndex = (toIndex + 3) % cities.length;
      }

      trades.push({
        fromIndex,
        toIndex,
        startSec: elapsedSec,
        durationSec: 1.3 + hashRandom(spawnSeed++) * 1.1,
        buy: hashRandom(spawnSeed++) > 0.45,
      });
      tradeCount++;
    }

    for (let i = trades.length - 1; i >= 0; i--) {
      const trade = trades[i];
      const flightFrac = (elapsedSec - trade.startSec) / trade.durationSec;

      if (flightFrac >= 1) {
        trades.splice(i, 1);
        continue;
      }

      const fromCity = cities[trade.fromIndex];
      const toCity = cities[trade.toIndex];
      const dist = Math.hypot(
        toCity.worldX - fromCity.worldX,
        toCity.worldZ - fromCity.worldZ,
      );
      const lift = 0.16 + dist * 0.22;
      const color = trade.buy ? scene.buy : scene.sell;

      function arcPoint(frac: number): GeoProjected {
        const worldX =
          fromCity.worldX + (toCity.worldX - fromCity.worldX) * frac;
        const worldZ =
          fromCity.worldZ + (toCity.worldZ - fromCity.worldZ) * frac;
        const y = GY - 4 * lift * frac * (1 - frac);
        return project(worldX, y, worldZ);
      }

      ctx.strokeStyle = hexToRgba(color, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let step = 0; step <= 22; step++) {
        const point = arcPoint(step / 22);

        if (step === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      ctx.strokeStyle = hexToRgba(color, 0.75);
      ctx.lineWidth = 1.8;
      ctx.beginPath();

      for (let step = 0; step <= 8; step++) {
        const frac =
          Math.max(0, flightFrac - 0.14) +
          (flightFrac - Math.max(0, flightFrac - 0.14)) * (step / 8);
        const point = arcPoint(frac);

        if (step === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      const headPoint = arcPoint(flightFrac);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(headPoint.x, headPoint.y, 2.2, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (flightFrac > 0.9) {
        const point = arcPoint(1);
        const ringFrac = (flightFrac - 0.9) / 0.1;
        ctx.strokeStyle = hexToRgba(color, 0.7 * (1 - ringFrac));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 + ringFrac * 12, 0, 6.283);
        ctx.stroke();
      }
    }

    // city bars pulse up and down (far → near)
    const sortedCities = cities
      .map((city) => {
        return { city, base: project(city.worldX, GY, city.worldZ) };
      })
      .sort((left, right) => {
        return right.base.z - left.base.z;
      });

    sortedCities.forEach((entry, orderIndex) => {
      const city = entry.city;
      const barPhase = ease((progress - 0.38 - 0.02 * orderIndex) / 0.2);

      if (barPhase <= 0) {
        return;
      }

      const barHeight =
        (0.14 + 0.34 * city.importance) *
        barPhase *
        (0.72 + 0.28 * Math.sin(elapsedSec * 1.5 + city.phase));
      const base = entry.base;
      const topPoint = project(city.worldX, GY - barHeight, city.worldZ);
      const nearness = clamp((0.9 - base.z) / 1.8);
      const alpha = 0.3 + 0.6 * nearness;
      const hot = city.importance >= 0.7;

      ctx.fillStyle = hexToRgba(accent, alpha * 0.8);
      ctx.beginPath();
      ctx.arc(base.x, base.y, 2.4 * base.perspective, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(accent, alpha * 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(
        base.x,
        base.y,
        (5 + 2 * Math.sin(elapsedSec * 2 + city.phase)) * base.perspective,
        0,
        6.283,
      );
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(hot ? accentAlt : accent, alpha);
      ctx.lineWidth = Math.max(1.2, 2.6 * base.perspective);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(topPoint.x, topPoint.y);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(
        hot ? accentAlt : accent,
        Math.min(1, alpha + 0.2),
      );
      ctx.beginPath();
      ctx.arc(topPoint.x, topPoint.y, 2 * topPoint.perspective, 0, 6.283);
      ctx.fill();

      if (hot && progress > 0.55) {
        const labelPhase = ease((progress - 0.55) / 0.12);
        ctx.globalAlpha = flickerAlpha * labelPhase;
        ctx.strokeStyle = hexToRgba(accent, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(topPoint.x, topPoint.y);
        ctx.lineTo(topPoint.x + 12, topPoint.y - 14);
        ctx.lineTo(topPoint.x + 70, topPoint.y - 14);
        ctx.stroke();
        ctx.font = `8px ${MONO}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = hexToRgba(accentAlt, 0.9);
        ctx.fillText(city.label, topPoint.x + 14, topPoint.y - 18);
        ctx.fillStyle = hexToRgba(accent, 0.7);
        ctx.fillText(
          `VOL ${120 + Math.round(80 * Math.sin(elapsedSec * 0.9 + city.phase) + 80)}M`,
          topPoint.x + 14,
          topPoint.y - 4 - 4,
        );
        ctx.globalAlpha = flickerAlpha;
      }
    });

    // corner telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(accent, 0.7);
    ctx.fillText("◉ GEO-FEED · EMEA WEST TACTICAL", 20, 28);
    ctx.fillText(`NODES 12 · MESH ${dots.length} pts`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, width - 20, 28);
    ctx.fillStyle = hexToRgba(accentAlt, 0.7);
    ctx.fillText(
      `ROUTES ${tradeCount} · LIVE ${trades.length}`,
      width - 20,
      44,
    );

    let statusText = "TRACING COASTLINE";
    let statusColor = accent;

    if (progress >= 0.3 && progress < 0.55) {
      statusText = "RENDERING TERRAIN MESH";
    } else if (progress >= 0.55 && progress < 0.85) {
      statusText = "NODES ONLINE ▸ ROUTING ORDER FLOW";
      statusColor = accentAlt;
    } else if (progress >= 0.85) {
      statusText = "GEO GRID STABLE";
      statusColor = scene.buy;
    }

    const blinkAlpha =
      progress < 0.85 ? 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(statusColor, 0.9 * blinkAlpha);
    ctx.fillText(`▸ ${statusText} ◂`, centerX, centerY - projScale * 1.18);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
