// drawBootHologram — verbatim port of the v3 prototype's _drawBootHologram
// (Reactive Trader.dc.html). Renders "HOLO-PROJ 01" — a volumetric hologram
// of the market core: an orbiting 3D bar-column grid that assembles from
// scattered particles inside a rising light cone, ringed by an emitter pad,
// gyroscopic segmented rings and dust motes, with floating FX/Risk/Order-flow
// callout panels on leader lines (see docs/design/web/v3/CHANGELOG.md entry 4,
// "hologram — Volumetric market core").

import {
  BOOT_DURATION_MS,
  type BootDrawCtx,
  type BootFrameFn,
  hexToRgba,
} from "../bootCanvas";

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";
const GRID_SIZE = 9;

/**
 * Cubic ease-out. Defined locally in the prototype (identical formula to the
 * shared `ease` helper in bootCanvas.ts) — kept local to match the source.
 */
function easeOutCubic(x: number): number {
  return 1 - (1 - Math.max(0, Math.min(1, x))) ** 3;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Deterministic pseudo-random in [0,1) from an integer seed. Verbatim from
 * the prototype's `rnd` helper — a sine-based hash, not Math.random, so the
 * particle field is stable across renders.
 */
function hashRandom(seed: number): number {
  const raw = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return raw - Math.floor(raw);
}

/** One market-data column in the 9x9 assembling grid. */
interface HoloColumn {
  normX: number;
  normZ: number;
  height: number;
  phase: number;
  delay: number;
  scatterX: number;
  scatterY: number;
  scatterZ: number;
}

/** Backdrop hex-field cell. */
interface HoloHex {
  x: number;
  y: number;
  radius: number;
  phase: number;
}

/** Rising dust mote inside the light cone. */
interface HoloMote {
  angle: number;
  radius: number;
  speed: number;
  offset: number;
}

/** Floating callout panel (FX CORE / RISK GRID / ORDER FLOW). */
interface HoloTag {
  gridIndex: number;
  label: string;
  value: string;
  appearAt: number;
}

/** 3D-projected screen point with depth (z) and perspective foreshortening. */
interface ProjPoint {
  x: number;
  y: number;
  z: number;
  perspective: number;
}

/**
 * createBootHologram — verbatim port of the prototype's `_drawBootHologram(start, DUR)`.
 * The factory runs once per boot (grid/hex/mote/tag seeding); the returned
 * closure is the prototype's inner `draw()`, called every rAF frame by the caller.
 */
export function createBootHologram(scene: BootDrawCtx): BootFrameFn {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;

  if (canvas.width !== canvas.offsetWidth) {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  const columns: HoloColumn[] = [];

  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      const cellIndex = gx * GRID_SIZE + gz;
      columns.push({
        normX: (gx - (GRID_SIZE - 1) / 2) / ((GRID_SIZE - 1) / 2),
        normZ: (gz - (GRID_SIZE - 1) / 2) / ((GRID_SIZE - 1) / 2),
        height: 0.16 + 0.78 * hashRandom(cellIndex * 3 + 1),
        phase: hashRandom(cellIndex * 7 + 2) * 6.283,
        delay: hashRandom(cellIndex * 5 + 3),
        scatterX: (hashRandom(cellIndex * 11 + 4) - 0.5) * 3.4,
        scatterY: -0.5 - hashRandom(cellIndex * 13 + 5) * 1.8,
        scatterZ: (hashRandom(cellIndex * 17 + 6) - 0.5) * 3.4,
      });
    }
  }

  const hexCells: HoloHex[] = [];

  for (let index = 0; index < 16; index++) {
    hexCells.push({
      x: hashRandom(index * 29 + 9),
      y: hashRandom(index * 31 + 8),
      radius: 8 + hashRandom(index * 37 + 7) * 20,
      phase: hashRandom(index * 41 + 6) * 6.283,
    });
  }

  const motes: HoloMote[] = [];

  for (let index = 0; index < 36; index++) {
    motes.push({
      angle: hashRandom(index * 19 + 2) * 6.283,
      radius: 0.15 + hashRandom(index * 23 + 3) * 1.1,
      speed: 0.05 + hashRandom(index * 43 + 4) * 0.16,
      offset: hashRandom(index * 47 + 5),
    });
  }

  const tags: HoloTag[] = [
    {
      gridIndex: GRID_SIZE * 1 + 1,
      label: "FX CORE",
      value: "▲ 1.0842",
      appearAt: 0.55,
    },
    {
      gridIndex: GRID_SIZE * 7 + 2,
      label: "RISK GRID",
      value: "σ 12.4",
      appearAt: 0.65,
    },
    {
      gridIndex: GRID_SIZE * 4 + 7,
      label: "ORDER FLOW",
      value: "≡ 48/s",
      appearAt: 0.75,
    },
  ];

  return () => {
    if (canvas.width !== canvas.offsetWidth) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    const elapsedSec = (performance.now() - scene.start) / 1000;
    const progress = Math.min(
      1,
      (performance.now() - scene.start) / BOOT_DURATION_MS,
    );
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2 - 10;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0,3,6,0.5)";
    ctx.fillRect(0, 0, width, height);

    // sparse hex field backdrop
    hexCells.forEach((hex) => {
      const alpha = 0.045 + 0.045 * Math.sin(elapsedSec * 0.8 + hex.phase);
      ctx.strokeStyle = hexToRgba(accent, alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let vertex = 0; vertex <= 6; vertex++) {
        const angle = (vertex / 6) * 6.283 + 0.52;
        const vertexX = hex.x * width + Math.cos(angle) * hex.radius;
        const vertexY = hex.y * height + Math.sin(angle) * hex.radius;

        if (vertex === 0) {
          ctx.moveTo(vertexX, vertexY);
        } else {
          ctx.lineTo(vertexX, vertexY);
        }
      }

      ctx.stroke();
    });

    // 3D projection (slow orbital yaw + fixed pitch, mild perspective)
    const yaw = elapsedSec * 0.45 + 0.7;
    const cosPitch = Math.cos(0.46);
    const sinPitch = Math.sin(0.46);
    const projScale = Math.min(width, height) * 0.27;

    function project(x: number, y: number, z: number): ProjPoint {
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const rotX = x * cosYaw - z * sinYaw;
      const rotZ = x * sinYaw + z * cosYaw;
      const tiltY = y * cosPitch - rotZ * sinPitch;
      const depth = y * sinPitch + rotZ * cosPitch;
      const perspective = 1 / (1 + depth * 0.26);
      return {
        x: centerX + rotX * projScale * perspective,
        y: centerY + tiltY * projScale * perspective,
        z: depth,
        perspective,
      };
    }

    // hologram flicker
    let flickerAlpha =
      0.86 + 0.14 * Math.sin(elapsedSec * 37 + Math.sin(elapsedSec * 9) * 4);

    if (hashRandom(Math.floor(elapsedSec * 6) + 3) > 0.94) {
      flickerAlpha *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = flickerAlpha;

    // light cone rising from emitter pad
    const padPoint = project(0, 0.62, 0);
    const coneGradient = ctx.createLinearGradient(
      0,
      padPoint.y,
      0,
      centerY - projScale * 0.9,
    );
    coneGradient.addColorStop(0, hexToRgba(accent, 0.1));
    coneGradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = coneGradient;
    ctx.beginPath();
    ctx.moveTo(padPoint.x - projScale * 1.5, padPoint.y);
    ctx.lineTo(centerX - projScale * 0.6, centerY - projScale * 0.9);
    ctx.lineTo(centerX + projScale * 0.6, centerY - projScale * 0.9);
    ctx.lineTo(padPoint.x + projScale * 1.5, padPoint.y);
    ctx.closePath();
    ctx.fill();

    // emitter pad rings
    function ring(
      radius: number,
      y: number,
      alpha: number,
      lineWidth?: number,
      dash?: number[],
      rotation?: number,
      color?: string,
    ): void {
      ctx.strokeStyle = hexToRgba(color ?? accent, alpha);
      ctx.lineWidth = lineWidth ?? 1;

      if (dash) {
        ctx.setLineDash(dash);
      }

      ctx.beginPath();

      for (let vertex = 0; vertex <= 60; vertex++) {
        const angle = (vertex / 60) * 6.283 + (rotation ?? 0);
        const point = project(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius,
        );

        if (vertex === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    ring(1.62, 0.62, 0.5, 1.6);
    ring(1.5, 0.62, 0.22, 1);
    ring(1.74, 0.62, 0.16, 1, [3, 6], -elapsedSec * 0.6);

    for (let tick = 0; tick < 48; tick++) {
      const angle = (tick / 48) * 6.283 + elapsedSec * 0.25;
      const innerPoint = project(
        Math.cos(angle) * 1.52,
        0.62,
        Math.sin(angle) * 1.52,
      );

      const outerPoint = project(
        Math.cos(angle) * 1.6,
        0.62,
        Math.sin(angle) * 1.6,
      );
      ctx.strokeStyle = hexToRgba(accent, tick % 4 === 0 ? 0.5 : 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(innerPoint.x, innerPoint.y);
      ctx.lineTo(outerPoint.x, outerPoint.y);
      ctx.stroke();
    }

    // ground grid expands from centre
    const gridPhase = easeOutCubic((progress - 0.04) / 0.3);

    if (gridPhase > 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexToRgba(accent, 0.14 * gridPhase);

      for (let gx = 0; gx < GRID_SIZE; gx++) {
        ctx.beginPath();

        for (let gz = 0; gz < GRID_SIZE; gz++) {
          const column = columns[gx * GRID_SIZE + gz];
          const point = project(
            column.normX * gridPhase,
            0.62,
            column.normZ * gridPhase,
          );

          if (gz === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }

        ctx.stroke();
      }

      for (let gz = 0; gz < GRID_SIZE; gz++) {
        ctx.beginPath();

        for (let gx = 0; gx < GRID_SIZE; gx++) {
          const column = columns[gx * GRID_SIZE + gz];
          const point = project(
            column.normX * gridPhase,
            0.62,
            column.normZ * gridPhase,
          );

          if (gx === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }

        ctx.stroke();
      }
    }

    // market columns assemble from particle scatter (far → near)
    const columnDrawOrder = columns
      .map((column) => {
        return { column, point: project(column.normX, 0.62, column.normZ) };
      })
      .sort((a, b) => {
        return b.point.z - a.point.z;
      });

    columnDrawOrder.forEach((entry) => {
      const column = entry.column;
      const assemblePhase = easeOutCubic(
        clamp((progress * 1.5 - 0.18 - column.delay * 0.6) / 0.3),
      );

      if (assemblePhase <= 0) {
        return;
      }

      const columnHeight =
        column.height *
        (0.88 + 0.12 * Math.sin(elapsedSec * 1.7 + column.phase));
      const hot = column.height > 0.75;

      if (assemblePhase < 1) {
        const frac = assemblePhase;
        const point = project(
          column.scatterX + (column.normX - column.scatterX) * frac,
          column.scatterY + (0.62 - columnHeight - column.scatterY) * frac,
          column.scatterZ + (column.normZ - column.scatterZ) * frac,
        );
        ctx.fillStyle = hexToRgba(hot ? accentAlt : accent, 0.35 + 0.5 * frac);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.6 * point.perspective + 1, 0, 6.283);
        ctx.fill();
      }

      const risePhase = clamp((assemblePhase - 0.55) / 0.45);

      if (risePhase <= 0) {
        return;
      }

      const basePoint = entry.point;
      const topPoint = project(
        column.normX,
        0.62 - columnHeight * risePhase,
        column.normZ,
      );
      const nearness = clamp((0.9 - basePoint.z) / 1.8);
      const alpha = 0.15 + 0.55 * nearness;
      ctx.strokeStyle = hexToRgba(hot ? accentAlt : accent, alpha);
      ctx.lineWidth = Math.max(1, 2.2 * basePoint.perspective);
      ctx.beginPath();
      ctx.moveTo(basePoint.x, basePoint.y);
      ctx.lineTo(topPoint.x, topPoint.y);
      ctx.stroke();
      const markerSize = Math.max(1.4, 2.6 * topPoint.perspective);
      ctx.fillStyle = hexToRgba(
        hot ? accentAlt : accent,
        Math.min(0.9, alpha + 0.25),
      );
      ctx.beginPath();
      ctx.moveTo(topPoint.x, topPoint.y - markerSize);
      ctx.lineTo(topPoint.x + markerSize, topPoint.y);
      ctx.lineTo(topPoint.x, topPoint.y + markerSize);
      ctx.lineTo(topPoint.x - markerSize, topPoint.y);
      ctx.closePath();
      ctx.fill();
    });

    // vertical scan ring sweeping up through the structure
    const scanY = 0.62 - ((elapsedSec * 0.45) % 1) * 1.35;
    ctx.strokeStyle = hexToRgba(accentAlt, 0.38);
    ctx.lineWidth = 1.4;
    ctx.beginPath();

    for (let vertex = 0; vertex <= 60; vertex++) {
      const angle = (vertex / 60) * 6.283;
      const point = project(
        Math.cos(angle) * 1.28,
        scanY,
        Math.sin(angle) * 1.28,
      );

      if (vertex === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }

    ctx.stroke();

    // gyroscopic segmented rings
    function gyro(
      radius: number,
      tilt: number,
      spin: number,
      color: string,
      alpha: number,
      lineWidth: number,
    ): void {
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      const cosSpin = Math.cos(spin);
      const sinSpin = Math.sin(spin);
      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.lineWidth = lineWidth;

      for (let seg = 0; seg < 8; seg++) {
        if (seg % 4 === 3) {
          continue;
        }

        ctx.beginPath();

        for (let vertex = 0; vertex <= 10; vertex++) {
          const angle = ((seg * 10 + vertex) / 80) * 6.283;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const tiltedY = -z * sinTilt;
          const tiltedZ = z * cosTilt;
          const spunX = x * cosSpin - tiltedY * sinSpin;
          const spunY = x * sinSpin + tiltedY * cosSpin;
          const point = project(spunX, spunY + 0.02, tiltedZ);

          if (vertex === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }

        ctx.stroke();
      }
    }

    const ringsPhase = easeOutCubic((progress - 0.35) / 0.3);

    if (ringsPhase > 0) {
      ctx.save();
      ctx.globalAlpha = flickerAlpha * ringsPhase;
      gyro(1.9, 1.05, elapsedSec * 0.7, accent, 0.5, 1.3);
      gyro(2.05, -0.9, -elapsedSec * 0.5, accentAlt, 0.32, 1);
      ctx.restore();
    }

    // dust motes rising in the cone
    motes.forEach((mote) => {
      const frac = (elapsedSec * mote.speed + mote.offset) % 1;
      const point = project(
        Math.cos(mote.angle + elapsedSec * 0.2) * mote.radius,
        0.62 - frac * 1.3,
        Math.sin(mote.angle + elapsedSec * 0.2) * mote.radius,
      );
      ctx.fillStyle = hexToRgba(accent, 0.35 * (1 - frac));
      ctx.fillRect(point.x, point.y, 1.5, 1.5);
    });

    // floating callout panels with leader lines
    tags.forEach((tag, tagIndex) => {
      const tagPhase = easeOutCubic(clamp((progress - tag.appearAt) / 0.12));

      if (tagPhase <= 0) {
        return;
      }

      const column = columns[tag.gridIndex];
      const columnHeight =
        column.height *
        (0.88 + 0.12 * Math.sin(elapsedSec * 1.7 + column.phase));
      const point = project(column.normX, 0.62 - columnHeight, column.normZ);
      const panelX = [
        centerX - projScale * 2.55,
        centerX + projScale * 1.55,
        centerX + projScale * 1.75,
      ][tagIndex];

      const panelY = [
        centerY - projScale * 1.0,
        centerY - projScale * 1.2,
        centerY + projScale * 0.35,
      ][tagIndex];
      ctx.globalAlpha = flickerAlpha * tagPhase;
      ctx.fillStyle = hexToRgba(accentAlt, 0.9);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.2, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(accent, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(panelX + 58, panelY + (panelY < centerY ? 50 : -6));
      ctx.stroke();
      ctx.fillStyle = "rgba(0,10,16,0.65)";
      ctx.fillRect(panelX, panelY, 116, 44);
      ctx.strokeStyle = hexToRgba(accent, 0.5);
      ctx.strokeRect(panelX, panelY, 116, 44);
      ctx.strokeStyle = hexToRgba(accentAlt, 0.8);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(panelX, panelY);
      ctx.lineTo(panelX, panelY + 10);
      ctx.moveTo(panelX, panelY);
      ctx.lineTo(panelX + 10, panelY);
      ctx.stroke();
      ctx.font = `8px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = hexToRgba(accentAlt, 0.85);
      ctx.fillText(tag.label, panelX + 9, panelY + 15);
      ctx.font = `bold 13px ${MONO}`;
      ctx.fillStyle = hexToRgba(accent, 0.95);
      ctx.fillText(tag.value, panelX + 9, panelY + 33);
      ctx.globalAlpha = flickerAlpha;
    });

    // corner telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(accent, 0.7);
    ctx.fillText("◉ HOLO-PROJ 01 · VOLUMETRIC", 20, 28);
    ctx.fillText(`PARTICLES ${Math.round(6480 * progress)} / 6480`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, width - 20, 28);
    ctx.fillStyle = hexToRgba(accentAlt, 0.7);
    ctx.fillText(`ASSEMBLY ${Math.round(progress * 100)}%`, width - 20, 44);

    let statusText = "COMPILING MARKET HOLOGRAM";
    let statusColor = accent;

    if (progress >= 0.5 && progress < 0.82) {
      statusText = "RESOLVING DEPTH FIELD";
    } else if (progress >= 0.82) {
      statusText = "STRUCTURE STABLE ▸ HANDOFF";
      statusColor = accentAlt;
    }

    const blinkAlpha =
      progress < 0.82 ? 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(statusColor, 0.9 * blinkAlpha);
    ctx.fillText(`▸ ${statusText} ◂`, centerX, centerY - projScale * 1.42);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
