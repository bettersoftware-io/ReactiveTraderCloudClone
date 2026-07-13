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
type XZ = readonly [number, number];

/** A closed coastline polyline in normalized plane space. */
type Poly = readonly XZ[];

/** One point of the rising terrain dot-mesh. */
interface TerrainDot {
  X: number;
  Z: number;
  h: number;
  ph: number;
}

/** A capital-city node: position, importance weight, label, phase. */
interface CityNode {
  X: number;
  Z: number;
  imp: number;
  label: string;
  ph: number;
}

/** An in-flight buy/sell trade arcing between two cities. */
interface Trade {
  a: number;
  b: number;
  t0: number;
  dur: number;
  buy: boolean;
}

/** 3D→2D projected point with perspective-divide depth and foreshortening factor. */
interface GeoProjected {
  x: number;
  y: number;
  z: number;
  f: number;
}

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

/** Deterministic pseudo-random in [0,1) from an integer seed. Verbatim from prototype. */
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
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

function cvt(ll: LonLat): XZ {
  return [(ll[0] - 4) * 0.068, (48 - ll[1]) / 10];
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
export function createBootGeo(d: BootDrawCtx): BootFrameFn {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;

  function resize(): void {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  resize();

  const polys: readonly Poly[] = [MAIN, GB, IRE, SIC, SAR, COR, DKZ].map(
    (pl) => {
      return pl.map(cvt);
    },
  );

  function inside(X: number, Z: number): boolean {
    for (const pl of polys) {
      let inb = false;

      for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
        const xi = pl[i][0];
        const zi = pl[i][1];
        const xj = pl[j][0];
        const zj = pl[j][1];

        if (zi > Z !== zj > Z && X < ((xj - xi) * (Z - zi)) / (zj - zi) + xi) {
          inb = !inb;
        }
      }

      if (inb) {
        return true;
      }
    }

    return false;
  }

  // terrain dot mesh with ridge heights (Alps / Pyrenees / Highlands)
  const dots: TerrainDot[] = [];

  for (let X = -1; X <= 1.001; X += 0.042) {
    for (let Z = -1.15; Z <= 1.301; Z += 0.042) {
      if (!inside(X, Z)) {
        continue;
      }

      const hAl =
        0.22 *
        Math.exp(-((X - 0.41) * (X - 0.41) + (Z - 0.15) * (Z - 0.15)) / 0.016);
      const hPy =
        0.11 *
        Math.exp(-((X + 0.24) * (X + 0.24) + (Z - 0.52) * (Z - 0.52)) / 0.006);
      const hHi =
        0.09 *
        Math.exp(-((X + 0.58) * (X + 0.58) + (Z + 0.9) * (Z + 0.9)) / 0.006);
      const n =
        0.03 * Math.sin(X * 9.1 + Z * 5.3) +
        0.025 * Math.sin(X * 4.2 - Z * 7.7);
      dots.push({
        X,
        Z,
        h: Math.max(0.015, hAl + hPy + hHi + n + 0.03),
        ph: rnd(dots.length * 7 + 3) * 6.283,
      });
    }
  }

  const cities: CityNode[] = CITY.map((ct, i) => {
    const p = cvt([ct[0], ct[1]]);
    return {
      X: p[0],
      Z: p[1],
      imp: ct[2],
      label: ct[3],
      ph: rnd(i * 13 + 5) * 6.283,
    };
  });

  const trades: Trade[] = [];
  let lastSpawn = 0;
  let spawnSeed = 11;
  let tradeCount = 0;

  return () => {
    if (c.width !== c.offsetWidth) {
      resize();
    }

    const t = (performance.now() - d.start) / 1000;
    const prog = Math.min(1, (performance.now() - d.start) / BOOT_DURATION_MS);
    const W = c.width;
    const H = c.height;
    const cx = W / 2;
    const cy = H / 2 - 6;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,3,6,0.5)";
    ctx.fillRect(0, 0, W, H);
    const yaw = t * 0.28 + 0.35;
    const cp = Math.cos(0.52);
    const sp = Math.sin(0.52);
    const S = Math.min(W, H) * S0;

    function P(x: number, y: number, z: number): GeoProjected {
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const x1 = x * cyw - z * syw;
      const z1 = x * syw + z * cyw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const f = 1 / (1 + z2 * 0.22);
      return { x: cx + x1 * S * f, y: cy + y1 * S * f, z: z2, f };
    }

    let ga = 0.87 + 0.13 * Math.sin(t * 33 + Math.sin(t * 8) * 4);

    if (rnd(Math.floor(t * 6) + 5) > 0.94) {
      ga *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = ga;

    // tactical table ring under the map
    function ring(
      r: number,
      alpha: number,
      lw?: number,
      dash?: number[],
      rot?: number,
    ): void {
      ctx.strokeStyle = hexToRgba(acc, alpha);
      ctx.lineWidth = lw || 1;

      if (dash) {
        ctx.setLineDash(dash);
      }

      ctx.beginPath();

      for (let k2 = 0; k2 <= 64; k2++) {
        const an = (k2 / 64) * 6.283 + (rot || 0);
        const p = P(Math.cos(an) * r, GY + 0.06, Math.sin(an) * r);

        if (k2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    ring(1.6, 0.4, 1.5);
    ring(1.72, 0.15, 1, [3, 7], -t * 0.5);
    ring(0.42, 0.25, 1, [2, 5], t * 0.8);

    // graticule chords clipped to the landmass
    const gk = ease((prog - 0.06) / 0.3);

    if (gk > 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexToRgba(acc, 0.13 * gk);

      for (let gx2 = -0.9; gx2 <= 0.91; gx2 += 0.3) {
        let pen = false;
        ctx.beginPath();

        for (let Z = -1.15; Z <= 1.301; Z += 0.05) {
          if (inside(gx2, Z)) {
            const p = P(gx2, GY, Z);

            if (pen) {
              ctx.lineTo(p.x, p.y);
            } else {
              ctx.moveTo(p.x, p.y);
            }

            pen = true;
          } else {
            pen = false;
          }
        }

        ctx.stroke();
      }

      for (let gz2 = -0.9; gz2 <= 0.91; gz2 += 0.3) {
        let pen = false;
        ctx.beginPath();

        for (let X = -1; X <= 1.001; X += 0.05) {
          if (inside(X, gz2)) {
            const p = P(X, GY, gz2);

            if (pen) {
              ctx.lineTo(p.x, p.y);
            } else {
              ctx.moveTo(p.x, p.y);
            }

            pen = true;
          } else {
            pen = false;
          }
        }

        ctx.stroke();
      }
    }

    // coastlines trace themselves in, glow pass + core pass
    const ok = ease(prog / 0.3);
    const totalN = polys.reduce((a, pl) => {
      return a + pl.length + 1;
    }, 0);
    let left = Math.max(2, Math.floor(ok * totalN));

    polys.forEach((pl) => {
      const n2 = Math.min(pl.length + 1, left);

      if (n2 >= 2) {
        function path(): void {
          ctx.beginPath();

          for (let i = 0; i < n2; i++) {
            const q = pl[i % pl.length];
            const p = P(q[0], GY, q[1]);

            if (i === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }

        ctx.strokeStyle = hexToRgba(acc, 0.16);
        ctx.lineWidth = 4;
        path();
        ctx.stroke();
        ctx.strokeStyle = hexToRgba(acc, 0.85);
        ctx.lineWidth = 1.5;
        path();
        ctx.stroke();

        if (n2 < pl.length + 1) {
          const hq = pl[(n2 - 1) % pl.length];
          const hp = P(hq[0], GY, hq[1]);
          ctx.fillStyle = "#fff";
          ctx.shadowColor = acc;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, 2.6, 0, 6.283);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      left -= pl.length + 1;
    });

    // terrain dot mesh rises out of the plane
    const tk2 = ease((prog - 0.16) / 0.32);

    if (tk2 > 0) {
      dots.forEach((dot) => {
        const hh = dot.h * tk2 * (1 + 0.1 * Math.sin(t * 1.2 + dot.ph));
        const p = P(dot.X, GY - hh, dot.Z);
        const nearness = clamp((0.9 - p.z) / 1.8);
        const al = (0.12 + 0.5 * nearness) * tk2;

        if (dot.h > 0.14) {
          const b = P(dot.X, GY, dot.Z);
          ctx.strokeStyle = hexToRgba(acc, al * 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }

        ctx.fillStyle = hexToRgba(acc, al);
        ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
      });
    }

    // radar sweep line across the plane
    const sx2 = -1 + ((t * 0.32) % 1) * 2;

    {
      let pen = false;
      ctx.strokeStyle = hexToRgba(ac2, 0.5);
      ctx.lineWidth = 1.4;
      ctx.beginPath();

      for (let Z = -1.15; Z <= 1.301; Z += 0.04) {
        if (inside(sx2, Z)) {
          const p = P(sx2, GY, Z);

          if (pen) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }

          pen = true;
        } else {
          pen = false;
        }
      }

      ctx.stroke();
    }

    // trades: spawn + arc flight between cities
    if (prog > 0.5 && t - lastSpawn > 0.34 && trades.length < 9) {
      lastSpawn = t;
      const a = Math.floor(rnd(spawnSeed++) * cities.length);
      let b = Math.floor(rnd(spawnSeed++) * cities.length);

      if (b === a) {
        b = (b + 3) % cities.length;
      }

      trades.push({
        a,
        b,
        t0: t,
        dur: 1.3 + rnd(spawnSeed++) * 1.1,
        buy: rnd(spawnSeed++) > 0.45,
      });
      tradeCount++;
    }

    for (let i = trades.length - 1; i >= 0; i--) {
      const tr = trades[i];
      const u = (t - tr.t0) / tr.dur;

      if (u >= 1) {
        trades.splice(i, 1);
        continue;
      }

      const A = cities[tr.a];
      const B = cities[tr.b];
      const dist = Math.hypot(B.X - A.X, B.Z - A.Z);
      const lift = 0.16 + dist * 0.22;
      const col = tr.buy ? d.buy : d.sell;

      function at(v: number): GeoProjected {
        const X = A.X + (B.X - A.X) * v;
        const Z = A.Z + (B.Z - A.Z) * v;
        const y = GY - 4 * lift * v * (1 - v);
        return P(X, y, Z);
      }

      ctx.strokeStyle = hexToRgba(col, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let k2 = 0; k2 <= 22; k2++) {
        const p = at(k2 / 22);

        if (k2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
      ctx.strokeStyle = hexToRgba(col, 0.75);
      ctx.lineWidth = 1.8;
      ctx.beginPath();

      for (let k2 = 0; k2 <= 8; k2++) {
        const v =
          Math.max(0, u - 0.14) + (u - Math.max(0, u - 0.14)) * (k2 / 8);
        const p = at(v);

        if (k2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
      const hd = at(u);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, 2.2, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (u > 0.9) {
        const p = at(1);
        const rr = (u - 0.9) / 0.1;
        ctx.strokeStyle = hexToRgba(col, 0.7 * (1 - rr));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + rr * 12, 0, 6.283);
        ctx.stroke();
      }
    }

    // city bars pulse up and down (far → near)
    const co = cities
      .map((ci) => {
        return { ci, b: P(ci.X, GY, ci.Z) };
      })
      .sort((q, r) => {
        return r.b.z - q.b.z;
      });

    co.forEach((o, oi) => {
      const ci = o.ci;
      const bk2 = ease((prog - 0.38 - 0.02 * oi) / 0.2);

      if (bk2 <= 0) {
        return;
      }

      const hh =
        (0.14 + 0.34 * ci.imp) *
        bk2 *
        (0.72 + 0.28 * Math.sin(t * 1.5 + ci.ph));
      const b = o.b;
      const tp = P(ci.X, GY - hh, ci.Z);
      const nearness = clamp((0.9 - b.z) / 1.8);
      const al = 0.3 + 0.6 * nearness;
      const hot = ci.imp >= 0.7;

      ctx.fillStyle = hexToRgba(acc, al * 0.8);
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.4 * b.f, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(acc, al * 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, (5 + 2 * Math.sin(t * 2 + ci.ph)) * b.f, 0, 6.283);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(hot ? ac2 : acc, al);
      ctx.lineWidth = Math.max(1.2, 2.6 * b.f);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(hot ? ac2 : acc, Math.min(1, al + 0.2));
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 2 * tp.f, 0, 6.283);
      ctx.fill();

      if (hot && prog > 0.55) {
        const lk = ease((prog - 0.55) / 0.12);
        ctx.globalAlpha = ga * lk;
        ctx.strokeStyle = hexToRgba(acc, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y);
        ctx.lineTo(tp.x + 12, tp.y - 14);
        ctx.lineTo(tp.x + 70, tp.y - 14);
        ctx.stroke();
        ctx.font = `8px ${MONO}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = hexToRgba(ac2, 0.9);
        ctx.fillText(ci.label, tp.x + 14, tp.y - 18);
        ctx.fillStyle = hexToRgba(acc, 0.7);
        ctx.fillText(
          `VOL ${120 + Math.round(80 * Math.sin(t * 0.9 + ci.ph) + 80)}M`,
          tp.x + 14,
          tp.y - 4 - 4,
        );
        ctx.globalAlpha = ga;
      }
    });

    // corner telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(acc, 0.7);
    ctx.fillText("◉ GEO-FEED · EMEA WEST TACTICAL", 20, 28);
    ctx.fillText(`NODES 12 · MESH ${dots.length} pts`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, W - 20, 28);
    ctx.fillStyle = hexToRgba(ac2, 0.7);
    ctx.fillText(`ROUTES ${tradeCount} · LIVE ${trades.length}`, W - 20, 44);

    let stt = "TRACING COASTLINE";
    let sc = acc;

    if (prog >= 0.3 && prog < 0.55) {
      stt = "RENDERING TERRAIN MESH";
    } else if (prog >= 0.55 && prog < 0.85) {
      stt = "NODES ONLINE ▸ ROUTING ORDER FLOW";
      sc = ac2;
    } else if (prog >= 0.85) {
      stt = "GEO GRID STABLE";
      sc = d.buy;
    }

    const bk3 = prog < 0.85 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(sc, 0.9 * bk3);
    ctx.fillText(`▸ ${stt} ◂`, cx, cy - S * 1.18);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
