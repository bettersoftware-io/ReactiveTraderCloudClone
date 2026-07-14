// drawBootTopo — verbatim port of the v3 prototype's _drawBootTopo.
// Volatility-terrain scene: six gaussian FX-pair peaks rendered as
// marching-squares contour topography over a 52×36 heightfield, with
// summit beacons ticking live prices, a route line linking summits, drifting
// survey motes, and a cursor-steered orbital camera.

import {
  BOOT_DURATION_MS,
  type BootDrawCtx,
  type BootFrameFn,
  ease,
  hexToRgba,
} from "../bootCanvas";

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

/** FX-pair volatility peak: gaussian bump position/shape + live-tick state. */
interface Peak {
  x: number;
  z: number;
  height: number;
  sigma: number;
  pair: string;
  base: number;
  decimals: number;
  step: number;
  lastTickIdx: number;
  val: number;
  dir: number;
  flashStart: number;
  revealAt: number;
}

/** Drifting survey mote (position anchored to a peak + phase/speed). */
interface Mote {
  x: number;
  z: number;
  phase: number;
  speed: number;
}

/** Sparse wireframe-mesh vertex: world x, height, world z. */
type MeshPoint = [number, number, number];

/** Camera-projected point (screen x/y, view-space depth, perspective factor). */
interface Projected3 {
  x: number;
  y: number;
  z: number;
  perspective: number;
}

/** Marching-squares edge-pair table, keyed by the 4-bit corner mask. */
const MARCHING_SQUARES: Record<number, Array<[number, number]>> = {
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  5: [
    [3, 0],
    [1, 2],
  ],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [
    [0, 1],
    [2, 3],
  ],
  11: [[1, 2]],
  12: [[3, 1]],
  13: [[0, 1]],
  14: [[3, 0]],
};

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Deterministic pseudo-random in [0,1) from an index seed. */
function hashRandom(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Zero-pad an already-integer number to two digits. Verbatim from prototype. */
function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * createBootTopo — factory that runs once per boot. Precomputes the 52×36
 * heightfield and the marching-squares contour segments (11 iso levels) a
 * single time; the returned closure only projects + draws each frame.
 */
export function createBootTopo(scene: BootDrawCtx): BootFrameFn {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;
  const buyColor = scene.buy;
  const sellColor = scene.sell;

  function resize(): void {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  resize();

  // volatility peaks = fx pairs
  const peaks: Peak[] = [
    {
      x: 0.1,
      z: -0.15,
      height: 0.55,
      sigma: 0.2,
      pair: "EUR/USD",
      base: 1.0917,
      decimals: 4,
      step: 0.0004,
      lastTickIdx: -1,
      val: 1.0917,
      dir: 1,
      flashStart: -9,
      revealAt: 0.44,
    },
    {
      x: -0.55,
      z: 0.1,
      height: 0.42,
      sigma: 0.16,
      pair: "GBP/USD",
      base: 1.2744,
      decimals: 4,
      step: 0.0005,
      lastTickIdx: -1,
      val: 1.2744,
      dir: 1,
      flashStart: -9,
      revealAt: 0.495,
    },
    {
      x: 0.55,
      z: 0.25,
      height: 0.38,
      sigma: 0.15,
      pair: "USD/JPY",
      base: 157.32,
      decimals: 2,
      step: 0.05,
      lastTickIdx: -1,
      val: 157.32,
      dir: 1,
      flashStart: -9,
      revealAt: 0.55,
    },
    {
      x: -0.15,
      z: 0.45,
      height: 0.3,
      sigma: 0.13,
      pair: "AUD/USD",
      base: 0.6621,
      decimals: 4,
      step: 0.0003,
      lastTickIdx: -1,
      val: 0.6621,
      dir: 1,
      flashStart: -9,
      revealAt: 0.605,
    },
    {
      x: 0.75,
      z: -0.35,
      height: 0.26,
      sigma: 0.12,
      pair: "EUR/GBP",
      base: 0.8567,
      decimals: 4,
      step: 0.0002,
      lastTickIdx: -1,
      val: 0.8567,
      dir: 1,
      flashStart: -9,
      revealAt: 0.66,
    },
    {
      x: -0.75,
      z: -0.4,
      height: 0.24,
      sigma: 0.12,
      pair: "USD/CHF",
      base: 0.8842,
      decimals: 4,
      step: 0.0003,
      lastTickIdx: -1,
      val: 0.8842,
      dir: 1,
      flashStart: -9,
      revealAt: 0.715,
    },
  ];

  function heightAt(x: number, z: number): number {
    let height = 0;

    peaks.forEach((peak) => {
      const dx = x - peak.x;
      const dz = z - peak.z;
      height +=
        peak.height *
        Math.exp(-(dx * dx + dz * dz) / (peak.sigma * peak.sigma * 2));
    });

    height +=
      0.045 * Math.sin(3.1 * x + 1.7 * z) +
      0.035 * Math.sin(5.3 * z - 2.2 * x) +
      0.05;
    const fall =
      (1 - (Math.abs(x) / 1.32) ** 4) * (1 - (Math.abs(z) / 1.02) ** 4);
    return Math.max(0, height * Math.max(0, fall));
  }

  // heightfield + marching-squares contours (precomputed in world space)
  const gridCols = 52;
  const gridRows = 36;
  const worldMinX = -1.3;
  const worldMaxX = 1.3;
  const worldMinZ = -1.0;
  const worldMaxZ = 1.0;
  const stepX = (worldMaxX - worldMinX) / (gridCols - 1);
  const stepZ = (worldMaxZ - worldMinZ) / (gridRows - 1);
  const heights: number[][] = [];

  for (let i = 0; i < gridCols; i++) {
    heights[i] = [];

    for (let j = 0; j < gridRows; j++) {
      heights[i][j] = heightAt(worldMinX + i * stepX, worldMinZ + j * stepZ);
    }
  }

  const levels: number[] = [];

  for (let li = 0; li < 11; li++) {
    levels.push(0.055 + li * 0.052);
  }

  const contours: number[][] = levels.map((level) => {
    const contourSegs: number[] = [];

    for (let i = 0; i < gridCols - 1; i++) {
      for (let j = 0; j < gridRows - 1; j++) {
        const v00 = heights[i][j];
        const v10 = heights[i + 1][j];
        const v01 = heights[i][j + 1];
        const v11 = heights[i + 1][j + 1];
        const bits =
          (v00 > level ? 1 : 0) |
          (v10 > level ? 2 : 0) |
          (v11 > level ? 4 : 0) |
          (v01 > level ? 8 : 0);
        const edges = MARCHING_SQUARES[bits];

        if (!edges) {
          continue;
        }

        const x0 = worldMinX + i * stepX;
        const z0 = worldMinZ + j * stepZ;

        function edgePoint(edgeId: number): [number, number] {
          let frac: number;

          if (edgeId === 0) {
            frac = clamp((level - v00) / (v10 - v00 || 1e-9));
            return [x0 + frac * stepX, z0];
          }

          if (edgeId === 1) {
            frac = clamp((level - v10) / (v11 - v10 || 1e-9));
            return [x0 + stepX, z0 + frac * stepZ];
          }

          if (edgeId === 2) {
            frac = clamp((level - v01) / (v11 - v01 || 1e-9));
            return [x0 + frac * stepX, z0 + stepZ];
          }

          frac = clamp((level - v00) / (v01 - v00 || 1e-9));
          return [x0, z0 + frac * stepZ];
        }

        edges.forEach((edgePair) => {
          const ptA = edgePoint(edgePair[0]);
          const ptB = edgePoint(edgePair[1]);
          contourSegs.push(ptA[0], ptA[1], ptB[0], ptB[1]);
        });
      }
    }

    return contourSegs;
  });

  // sparse mesh polylines
  const meshLines: MeshPoint[][] = [];

  for (let j = 0; j < gridRows; j += 7) {
    const row: MeshPoint[] = [];

    for (let i = 0; i < gridCols; i += 2) {
      row.push([worldMinX + i * stepX, heights[i][j], worldMinZ + j * stepZ]);
    }

    meshLines.push(row);
  }

  for (let i = 0; i < gridCols; i += 8) {
    const col: MeshPoint[] = [];

    for (let j = 0; j < gridRows; j += 2) {
      col.push([worldMinX + i * stepX, heights[i][j], worldMinZ + j * stepZ]);
    }

    meshLines.push(col);
  }

  const motes: Mote[] = [];

  for (let i = 0; i < 26; i++) {
    const peak = peaks[i % 6];
    motes.push({
      x: peak.x + (hashRandom(i * 7 + 2) - 0.5) * 0.5,
      z: peak.z + (hashRandom(i * 11 + 3) - 0.5) * 0.5,
      phase: hashRandom(i * 13 + 4),
      speed: 0.06 + hashRandom(i * 17 + 5) * 0.1,
    });
  }

  const groundY = 0.35;

  return function drawBootTopoFrame(): void {
    if (canvas.width !== canvas.offsetWidth) {
      resize();
    }

    // Cursor steering: BootSequence owns the window mousemove listener and
    // writes normalized -1..1 values into scene.pointer each frame (prototype
    // read its own module-local mx/my, updated by its own listener — no
    // smoothing was applied there, so none is applied here either).
    const pointerX = scene.pointer.mx;
    const pointerY = scene.pointer.my;

    const elapsedSec = (performance.now() - scene.start) / 1000;
    const progress = Math.min(
      1,
      (performance.now() - scene.start) / BOOT_DURATION_MS,
    );
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2 + 10;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0,3,6,0.55)";
    ctx.fillRect(0, 0, width, height);
    const yaw = 0.5 + elapsedSec * 0.16 + pointerX * 0.35;
    const pitch = 0.55 + 0.05 * Math.sin(elapsedSec * 0.3) + pointerY * 0.15;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const projScale = Math.min(width, height) * 0.44;

    function project(x: number, y: number, z: number): Projected3 {
      const x1 = x * cyw - z * syw;
      const z1 = x * syw + z * cyw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const perspective = 1 / Math.max(0.4, 1 + z2 * 0.26);
      return {
        x: centerX + x1 * projScale * perspective,
        y: centerY + y1 * projScale * perspective,
        z: z2,
        perspective,
      };
    }

    const rise = ease(progress / 0.4);
    let flickerAlpha =
      0.88 + 0.12 * Math.sin(elapsedSec * 35 + Math.sin(elapsedSec * 8) * 4);

    if (hashRandom(Math.floor(elapsedSec * 6) + 11) > 0.94) {
      flickerAlpha *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = flickerAlpha;

    // survey table frame
    const frameCorners: Array<[number, number]> = [
      [worldMinX, worldMinZ],
      [worldMaxX, worldMinZ],
      [worldMaxX, worldMaxZ],
      [worldMinX, worldMaxZ],
    ];
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = hexToRgba(accent, 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    frameCorners.forEach((corner, i) => {
      const point = project(corner[0], groundY, corner[1]);

      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    frameCorners.forEach((corner) => {
      const point = project(corner[0], groundY, corner[1]);
      ctx.strokeStyle = hexToRgba(accentAlt, 0.7);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(point.x - 7, point.y);
      ctx.lineTo(point.x, point.y);
      ctx.lineTo(point.x, point.y - 7);
      ctx.stroke();
    });

    // sparse wireframe mesh
    ctx.lineWidth = 1;
    meshLines.forEach((row) => {
      ctx.strokeStyle = hexToRgba(accent, 0.1 * rise);
      ctx.beginPath();
      row.forEach((vertex, i) => {
        const point = project(vertex[0], groundY - vertex[1] * rise, vertex[2]);

        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
    });

    // contour levels, revealed bottom-up
    contours.forEach((contourSegs, li) => {
      const level = levels[li];
      const contourPhase = ease((progress - 0.06 - li * 0.032) / 0.1);

      if (contourPhase <= 0) {
        return;
      }

      const newest = contourPhase < 1;
      const hot = li >= 8;
      ctx.strokeStyle = hexToRgba(
        hot ? accentAlt : accent,
        (newest ? 0.95 : 0.22 + li * 0.045) * Math.max(contourPhase, 0.4),
      );
      ctx.lineWidth = newest ? 1.8 : hot ? 1.3 : 1;

      if (newest) {
        ctx.shadowColor = hot ? accentAlt : accent;
        ctx.shadowBlur = 10;
      }

      ctx.beginPath();
      const contourY = groundY - level * rise;

      for (let segIdx = 0; segIdx < contourSegs.length; segIdx += 4) {
        const projA = project(
          contourSegs[segIdx],
          contourY,
          contourSegs[segIdx + 1],
        );
        const projB = project(
          contourSegs[segIdx + 2],
          contourY,
          contourSegs[segIdx + 3],
        );
        ctx.moveTo(projA.x, projA.y);
        ctx.lineTo(projB.x, projB.y);
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // route linking the summits
    const routePhase = ease((progress - 0.62) / 0.15);

    if (routePhase > 0) {
      ctx.strokeStyle = hexToRgba(accentAlt, 0.4 * routePhase);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      peaks.forEach((peak, i) => {
        const point = project(
          peak.x,
          groundY - heightAt(peak.x, peak.z) * rise,
          peak.z,
        );

        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
    }

    // summit beacons + pair labels + ticking prices
    const ordered = peaks
      .map((peak) => {
        return {
          peak,
          summit: project(
            peak.x,
            groundY - heightAt(peak.x, peak.z) * rise,
            peak.z,
          ),
        };
      })
      .sort((a, b) => {
        return b.summit.z - a.summit.z;
      });

    ordered.forEach((entry) => {
      const peak = entry.peak;
      const phase = ease((progress - peak.revealAt) / 0.12);

      if (phase <= 0) {
        return;
      }

      const summitPoint = entry.summit;
      const beaconHeight = 0.3 * phase;
      // dashed halo ring on the terrain
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = hexToRgba(accent, 0.45 * phase);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let ringStep = 0; ringStep <= 36; ringStep++) {
        const angle = (ringStep / 36) * 6.283 + elapsedSec * 0.5;
        const point = project(
          peak.x + Math.cos(angle) * 0.1,
          groundY - heightAt(peak.x, peak.z) * rise,
          peak.z + Math.sin(angle) * 0.1,
        );

        if (ringStep === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);

      // beacon
      const topPoint = project(
        peak.x,
        groundY - heightAt(peak.x, peak.z) * rise - beaconHeight,
        peak.z,
      );
      ctx.strokeStyle = hexToRgba(accentAlt, 0.75 * phase);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(summitPoint.x, summitPoint.y);
      ctx.lineTo(topPoint.x, topPoint.y);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(accentAlt, 0.9 * phase);
      ctx.beginPath();
      ctx.moveTo(topPoint.x, topPoint.y - 4);
      ctx.lineTo(topPoint.x + 4, topPoint.y);
      ctx.lineTo(topPoint.x, topPoint.y + 4);
      ctx.lineTo(topPoint.x - 4, topPoint.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hexToRgba("#ffffff", 0.8 * phase);
      ctx.beginPath();
      ctx.arc(summitPoint.x, summitPoint.y, 1.8, 0, 6.283);
      ctx.fill();

      // live tick
      const tickIdx = Math.floor(
        elapsedSec / 0.3 + hashRandom(peak.base * 97) * 7,
      );

      if (tickIdx !== peak.lastTickIdx) {
        peak.lastTickIdx = tickIdx;
        const newVal =
          peak.base +
          (hashRandom(tickIdx * 7.3 + peak.base * 31) - 0.5) * peak.step * 14;
        peak.dir = newVal >= peak.val ? 1 : -1;
        peak.val = newVal;
        peak.flashStart = elapsedSec;
      }

      const flash = clamp(1 - (elapsedSec - peak.flashStart) / 0.22);
      const tickColor = peak.dir > 0 ? buyColor : sellColor;
      const priceText = peak.val.toFixed(peak.decimals);
      ctx.font = `bold 12px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";

      if (flash > 0) {
        const textWidth = ctx.measureText(priceText).width;
        ctx.fillStyle = hexToRgba(tickColor, 0.22 * flash * phase);
        ctx.fillRect(
          topPoint.x - textWidth / 2 - 5,
          topPoint.y - 36,
          textWidth + 10,
          14,
        );
      }

      ctx.fillStyle = hexToRgba(accent, 0.95 * phase);
      ctx.fillText(peak.pair, topPoint.x, topPoint.y - 40);
      ctx.font = `12px ${MONO}`;
      ctx.fillStyle = hexToRgba(tickColor, (0.75 + 0.25 * flash) * phase);
      ctx.fillText(
        `${peak.dir > 0 ? "▴ " : "▾ "}${priceText}`,
        topPoint.x,
        topPoint.y - 25,
      );
      ctx.strokeStyle = hexToRgba(accent, 0.35 * phase);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(topPoint.x, topPoint.y - 8);
      ctx.lineTo(topPoint.x, topPoint.y - 21);
      ctx.stroke();
    });

    // drifting survey motes
    motes.forEach((mote) => {
      const drift = (elapsedSec * mote.speed + mote.phase) % 1;
      const point = project(
        mote.x,
        groundY - heightAt(mote.x, mote.z) * rise - drift * 0.22,
        mote.z,
      );
      ctx.fillStyle = hexToRgba(accent, 0.3 * (1 - drift) * rise);
      ctx.fillRect(point.x, point.y, 1.4, 1.4);
    });

    // legend + telemetry
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(accent, 0.7);
    ctx.fillText("◉ VOL SURFACE · 3DSCAN", 20, 28);
    ctx.fillText("GRID RZ_5.19.24 · σ ALTITUDE", 20, 44);

    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = hexToRgba(i > 2 ? accentAlt : accent, 0.3 + i * 0.18);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(20, 58 + i * 7);
      ctx.lineTo(46, 58 + i * 7);
      ctx.stroke();
    }

    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, width - 20, 28);
    ctx.fillStyle = hexToRgba(accentAlt, 0.7);
    ctx.fillText(
      `PEAKS 6 · FEED ${progress > 0.5 ? "LIVE" : "SYNC"}`,
      width - 20,
      44,
    );
    const now = new Date();
    ctx.textAlign = "left";
    ctx.fillStyle = hexToRgba(accent, 0.5);
    ctx.fillText(
      `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())} ${padTwo(now.getHours())}:${padTwo(now.getMinutes())}:${padTwo(now.getSeconds())}`,
      20,
      height - 20,
    );
    ctx.textAlign = "right";
    ctx.fillText(".// MAP/VOLSCAN", width - 20, height - 20);
    let statusText = "SCANNING VOLATILITY TERRAIN";
    let statusColor = accent;

    if (progress >= 0.44 && progress < 0.75) {
      statusText = "RESOLVING SUMMITS";
    } else if (progress >= 0.75) {
      statusText = "PRICE FEED LIVE ▸ HANDOFF";
      statusColor = accentAlt;
    }

    const blinkPhase =
      progress < 0.44 ? 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(statusColor, 0.9 * blinkPhase);
    ctx.fillText(`▸ ${statusText} ◂`, centerX, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
