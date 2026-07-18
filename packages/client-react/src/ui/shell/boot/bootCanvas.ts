// Pure per-frame canvas draw functions — ported verbatim from prototype
// (Reactive Trader.dc.html:819, 852-1045). No React, no DOM-owning state,
// no requestAnimationFrame (the rAF loop lives in BootSequence.tsx).

export const BOOT_DURATION_MS = 4200;

/** Canvas rectangle used in laser and docking draws */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalised panel dimensions (0–1 fractions of W/H) */
interface PanelNorm {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

/** Panel with animation timing and content kind */
interface LaserPanel extends PanelNorm {
  t0: number;
  t1: number;
  kind: string;
}

/** 2-D position for the laser-draw head */
interface HeadPos {
  x: number;
  y: number;
}

export interface BootDrawCtx {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** performance.now() recorded at loop start */
  readonly start: number;
  /** Resolved --accent-primary CSS token */
  readonly accent: string;
  /** Resolved --accent-2 CSS token */
  readonly accent2: string;
  /** Resolved --accent-positive CSS token */
  readonly buy: string;
  /** Resolved --accent-negative CSS token */
  readonly sell: string;
  /** Live cursor position, normalized to -1..1 per axis (0,0 = viewport
   *  centre). BootSequence owns the window mousemove listener and mutates
   *  this shared object; the v3 cursor-tracked variants (layers/jarvis/topo)
   *  read it each frame. */
  readonly pointer: { mx: number; my: number };
}

/** Per-frame draw closure returned by the v3 variant factories — the factory
 *  runs once per boot (precomputing geometry: coastlines, heightfield
 *  contours), the closure runs every rAF frame. */
export type BootFrameFn = () => void;

/** hexToRgba — verbatim from prototype line 819 */
export function hexToRgba(hex: string, alpha: number): string {
  let normalizedHex = hex.replace("#", "");

  if (normalizedHex.length === 3) {
    normalizedHex = normalizedHex
      .split("")
      .map((digit) => {
        return digit + digit;
      })
      .join("");
  }

  const intValue = parseInt(normalizedHex, 16);
  return (
    "rgba(" +
    ((intValue >> 16) & 255) +
    "," +
    ((intValue >> 8) & 255) +
    "," +
    (intValue & 255) +
    "," +
    alpha +
    ")"
  );
}

/**
 * Cubic ease-out used by laser and docking variants.
 * Verbatim from prototype (both _drawBootLaser and _drawBootDocking).
 */
export function ease(t: number): number {
  return 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
}

/** Zero-pad a number to two digits. Verbatim from prototype _drawBootDocking. */
function padTwo(value: number): string {
  return String(Math.abs(Math.floor(value))).padStart(2, "0");
}

/**
 * drawBootLaser — verbatim inner draw() from prototype _drawBootLaser (lines 888-921)
 * plus _bootContent (lines 1038-1045), inlined as a local helper.
 * Draws one frame of the UI-draw-in laser animation.
 */
export function drawBootLaser(scene: BootDrawCtx): void {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;

  const panels = [
    {
      nx: 0.055,
      ny: 0.045,
      nw: 0.89,
      nh: 0.075,
      t0: 0.0,
      t1: 0.1,
      kind: "header",
    },
    {
      nx: 0.055,
      ny: 0.155,
      nw: 0.56,
      nh: 0.5,
      t0: 0.09,
      t1: 0.32,
      kind: "main",
    },
    {
      nx: 0.635,
      ny: 0.155,
      nw: 0.31,
      nh: 0.235,
      t0: 0.3,
      t1: 0.45,
      kind: "list",
    },
    {
      nx: 0.635,
      ny: 0.415,
      nw: 0.31,
      nh: 0.24,
      t0: 0.43,
      t1: 0.57,
      kind: "list",
    },
    {
      nx: 0.055,
      ny: 0.685,
      nw: 0.89,
      nh: 0.17,
      t0: 0.55,
      t1: 0.68,
      kind: "blotter",
    },
    {
      nx: 0.055,
      ny: 0.875,
      nw: 0.89,
      nh: 0.05,
      t0: 0.66,
      t1: 0.74,
      kind: "status",
    },
  ];

  function drawPanelContent(
    panelCtx: CanvasRenderingContext2D,
    panel: LaserPanel,
    rect: Rect,
    panelAccent: string,
    panelAccentAlt: string,
  ): void {
    const pad = Math.min(rect.w, rect.h) * 0.11;
    const innerX = rect.x + pad;
    const innerY = rect.y + pad;
    const innerW = rect.w - pad * 2;
    const innerH = rect.h - pad * 2;

    if (panel.kind === "header") {
      for (let i = 0; i < 4; i++) {
        panelCtx.fillStyle = hexToRgba(
          i === 0 ? panelAccentAlt : panelAccent,
          0.55,
        );
        panelCtx.fillRect(
          innerX + i * 72,
          innerY + innerH * 0.3,
          54,
          innerH * 0.4,
        );
      }
    } else if (panel.kind === "main") {
      const tileW = (innerW - 14) / 2;
      const tileH = (innerH - 14) / 2;

      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const tileX = innerX + i * (tileW + 14);
          const tileY = innerY + j * (tileH + 14);
          panelCtx.strokeStyle = hexToRgba(panelAccent, 0.5);
          panelCtx.lineWidth = 1;
          panelCtx.strokeRect(tileX, tileY, tileW, tileH);
          panelCtx.fillStyle = hexToRgba(panelAccent, 0.16);
          panelCtx.fillRect(tileX, tileY, tileW, tileH * 0.34);
          panelCtx.strokeStyle = hexToRgba(panelAccentAlt, 0.7);
          panelCtx.lineWidth = 1.4;
          panelCtx.beginPath();

          for (let sampleIdx = 0; sampleIdx <= 12; sampleIdx++) {
            const sampleX = tileX + 6 + ((tileW - 12) * sampleIdx) / 12;
            const sampleY =
              tileY +
              tileH * 0.78 -
              Math.sin(sampleIdx * 0.8 + i * 2 + j) * tileH * 0.13;

            if (sampleIdx === 0) {
              panelCtx.moveTo(sampleX, sampleY);
            } else {
              panelCtx.lineTo(sampleX, sampleY);
            }
          }

          panelCtx.stroke();
        }
      }
    } else if (panel.kind === "list") {
      const rows = 4;
      const rowH = innerH / rows;

      for (let i = 0; i < rows; i++) {
        panelCtx.fillStyle = hexToRgba(panelAccent, 0.42 - i * 0.06);
        panelCtx.fillRect(
          innerX,
          innerY + i * rowH + rowH * 0.25,
          innerW * (0.92 - i * 0.14),
          rowH * 0.4,
        );
      }
    } else if (panel.kind === "blotter") {
      const rows = 4;
      const rowH = innerH / rows;
      panelCtx.fillStyle = hexToRgba(panelAccentAlt, 0.5);
      panelCtx.fillRect(innerX, innerY, innerW, rowH * 0.45);

      for (let i = 1; i < rows; i++) {
        panelCtx.strokeStyle = hexToRgba(panelAccent, 0.3);
        panelCtx.beginPath();
        panelCtx.moveTo(innerX, innerY + i * rowH);
        panelCtx.lineTo(innerX + innerW, innerY + i * rowH);
        panelCtx.stroke();

        for (let col = 0; col < 5; col++) {
          panelCtx.fillStyle = hexToRgba(panelAccent, 0.3);
          panelCtx.fillRect(
            innerX + col * (innerW / 5) + 5,
            innerY + i * rowH + rowH * 0.3,
            (innerW / 5) * 0.6,
            rowH * 0.34,
          );
        }
      }
    } else if (panel.kind === "status") {
      for (let i = 0; i < 9; i++) {
        panelCtx.fillStyle = hexToRgba(
          i % 3 === 0 ? panelAccentAlt : panelAccent,
          0.5,
        );
        panelCtx.fillRect(
          innerX + i * (innerW / 9),
          innerY + innerH * 0.3,
          (innerW / 9) * 0.55,
          innerH * 0.4,
        );
      }
    }
  }

  if (canvas.width !== canvas.offsetWidth) {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  const progress = Math.min(
    1,
    (performance.now() - scene.start) / BOOT_DURATION_MS,
  );
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = hexToRgba(accent, 0.045);
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  function toPixelRect(panel: PanelNorm): Rect {
    return {
      x: panel.nx * width,
      y: panel.ny * height,
      w: panel.nw * width,
      h: panel.nh * height,
    };
  }

  let head: HeadPos | null = null;
  panels.forEach((panel) => {
    const rect = toPixelRect(panel);
    const drawFrac = Math.max(
      0,
      Math.min(1, (progress - panel.t0) / (panel.t1 - panel.t0)),
    );

    if (drawFrac <= 0) {
      return;
    }

    const segments: [number, number, number, number][] = [
      [rect.x, rect.y, rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h],
      [rect.x, rect.y + rect.h, rect.x, rect.y],
    ];

    const segLengths = segments.map((segment) => {
      return Math.hypot(segment[2] - segment[0], segment[3] - segment[1]);
    });

    const perimeter = segLengths.reduce((a, b) => {
      return a + b;
    }, 0);
    let remaining = drawFrac * perimeter;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.shadowColor = accent;
    ctx.shadowBlur = drawFrac < 1 ? 16 : 7;
    ctx.strokeStyle = hexToRgba(accent, drawFrac < 1 ? 0.98 : 0.62);
    ctx.beginPath();
    ctx.moveTo(segments[0][0], segments[0][1]);
    let headX = segments[0][0];
    let headY = segments[0][1];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (remaining >= segLengths[i]) {
        ctx.lineTo(segment[2], segment[3]);
        headX = segment[2];
        headY = segment[3];
        remaining -= segLengths[i];
      } else {
        const segFrac = segLengths[i] ? remaining / segLengths[i] : 0;
        headX = segment[0] + (segment[2] - segment[0]) * segFrac;
        headY = segment[1] + (segment[3] - segment[1]) * segFrac;
        ctx.lineTo(headX, headY);
        remaining = 0;
        break;
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    if (drawFrac < 1) {
      head = { x: headX, y: headY };
    }

    if (progress >= panel.t1 && progress < panel.t1 + 0.07) {
      const flashAlpha = 1 - (progress - panel.t1) / 0.07;
      ctx.fillStyle = hexToRgba(accent, 0.2 * flashAlpha);
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    if (drawFrac > 0.985) {
      ctx.strokeStyle = hexToRgba(accentAlt, 0.85);
      ctx.lineWidth = 1.4;
      const tickLen = 8;
      (
        [
          [rect.x, rect.y, 1, 1],
          [rect.x + rect.w, rect.y, -1, 1],
          [rect.x, rect.y + rect.h, 1, -1],
          [rect.x + rect.w, rect.y + rect.h, -1, -1],
        ] as [number, number, number, number][]
      ).forEach((corner) => {
        ctx.beginPath();
        ctx.moveTo(corner[0], corner[1] + corner[3] * tickLen);
        ctx.lineTo(corner[0], corner[1]);
        ctx.lineTo(corner[0] + corner[2] * tickLen, corner[1]);
        ctx.stroke();
      });
    }

    const contentStart = panel.t1;
    const contentEnd = Math.min(1, panel.t1 + 0.24);
    const contentEase = ease(
      (progress - contentStart) / (contentEnd - contentStart),
    );

    if (contentEase > 0) {
      const panelCenterX = rect.x + rect.w / 2;
      const panelCenterY = rect.y + rect.h / 2;
      const contentScale = 0.32 + 0.68 * contentEase;
      ctx.save();
      ctx.globalAlpha = contentEase;
      ctx.translate(panelCenterX, panelCenterY);
      ctx.scale(contentScale, contentScale);
      ctx.translate(-panelCenterX, -panelCenterY);
      drawPanelContent(ctx, panel, rect, accent, accentAlt);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  });

  if (head !== null) {
    const headPos = head as HeadPos;
    const emitterX = width * 0.5;
    const emitterY = -24;
    ctx.strokeStyle = hexToRgba(accentAlt, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(emitterX, emitterY);
    ctx.lineTo(headPos.x, headPos.y);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(accent, 0.45);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/**
 * drawBootDocking — verbatim inner draw() from prototype _drawBootDocking (lines 931-1036).
 * Draws one frame of the docking-HUD boot animation.
 */
export function drawBootDocking(scene: BootDrawCtx): void {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;

  const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

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
  const centerY = height / 2;
  const easedProgress = ease(progress);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0,2,4,0.64)";
  ctx.fillRect(0, 0, width, height);
  const vignetteGradient = ctx.createRadialGradient(
    centerX,
    centerY,
    Math.min(width, height) * 0.18,
    centerX,
    centerY,
    Math.max(width, height) * 0.62,
  );
  vignetteGradient.addColorStop(0, "rgba(0,0,0,0)");
  vignetteGradient.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignetteGradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = hexToRgba(accent, 0.035);

  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }

  const shake = (1 - easedProgress) * 1.0 + 0.22;
  const shakeX =
    (Math.sin(elapsedSec * 9) * 1.4 + Math.sin(elapsedSec * 17) * 0.7) * shake;

  const shakeY =
    (Math.cos(elapsedSec * 7) * 1.1 + Math.sin(elapsedSec * 23) * 0.5) * shake;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(accent, 0.1);

  for (let i = -6; i <= 6; i++) {
    const ex = centerX + i * (width / 12);
    ctx.beginPath();
    ctx.moveTo(ex, 0);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, height);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();
  }

  for (let i = -4; i <= 4; i++) {
    const ey = centerY + i * (height / 8);
    ctx.beginPath();
    ctx.moveTo(0, ey);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width, ey);
    ctx.lineTo(centerX, centerY);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(accentAlt, 0.16);

  for (let ring = 1; ring <= 5; ring++) {
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      ring * Math.min(width, height) * 0.08,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  ctx.restore();
  ctx.strokeStyle = hexToRgba(accent, 0.06);
  ctx.lineWidth = 1;
  // Floor at 1px: on a zero-width canvas (hidden panel, jsdom) a 0 step
  // would never advance the loops below — an infinite loop, not just a
  // wasted frame.
  const gridStep = Math.max(1, Math.round(width / 16));

  for (let x = 0; x <= width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const wobble = 1 - easedProgress;
  const targetX = centerX + shakeX + Math.sin(elapsedSec * 1.3) * 6 * wobble;
  const targetY = centerY + shakeY + Math.cos(elapsedSec * 1.1) * 5 * wobble;
  const craftRadius = 12 + easedProgress * 92;
  const radius = craftRadius;
  ctx.save();
  ctx.translate(targetX, targetY);
  ctx.fillStyle = "rgba(8,16,22,0.5)";
  ctx.fillRect(-radius * 3.6, -radius * 1.6, radius * 7.2, radius * 3.2);
  ctx.strokeStyle = hexToRgba(accent, 0.12);
  ctx.lineWidth = 1;

  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * radius * 1.15, -radius * 1.6);
    ctx.lineTo(i * radius * 1.15, radius * 1.6);
    ctx.stroke();
  }

  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-radius * 3.6, i * radius * 0.95);
    ctx.lineTo(radius * 3.6, i * radius * 0.95);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(accent, 0.18);
  ctx.strokeRect(-radius * 3.4, -radius * 0.55, radius * 0.95, radius * 1.1);
  ctx.strokeRect(radius * 2.45, -radius * 0.55, radius * 0.95, radius * 1.1);
  ctx.restore();
  ctx.save();
  ctx.translate(targetX, targetY);
  ctx.rotate(Math.sin(elapsedSec * 0.2) * 0.05);
  ctx.strokeStyle = hexToRgba(accent, 0.85);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.34, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    const spokeInner = radius * 1.15;
    const spokeOuter = radius * (i % 3 === 0 ? 1.32 : 1.24);
    ctx.strokeStyle = hexToRgba(accent, i % 3 === 0 ? 0.6 : 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * spokeInner, Math.sin(angle) * spokeInner);
    ctx.lineTo(Math.cos(angle) * spokeOuter, Math.sin(angle) * spokeOuter);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(accent, 0.6);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.84, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.fillStyle = hexToRgba(accent, 0.5);
    ctx.beginPath();
    ctx.arc(
      Math.cos(angle) * radius * 0.84,
      Math.sin(angle) * radius * 0.84,
      radius * 0.045,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.fillStyle = hexToRgba(accentAlt, 0.1);
  ctx.strokeStyle = hexToRgba(accentAlt, 0.55);
  ctx.lineWidth = 1.4;

  for (let vane = 0; vane < 4; vane++) {
    const angle = (vane / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.22, -radius * 0.64);
    ctx.lineTo(radius * 0.22, -radius * 0.64);
    ctx.lineTo(radius * 0.12, -radius * 0.34);
    ctx.lineTo(-radius * 0.12, -radius * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = hexToRgba(accent, 0.7);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    ctx.strokeStyle = hexToRgba(accent, 0.4);
    ctx.beginPath();
    ctx.moveTo(
      Math.cos(angle) * radius * 0.28,
      Math.sin(angle) * radius * 0.28,
    );
    ctx.lineTo(Math.cos(angle) * radius * 0.5, Math.sin(angle) * radius * 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = hexToRgba(accentAlt, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const markerX =
    -width * 0.05 * wobble + Math.sin(elapsedSec * 1.1) * radius * 0.5 * wobble;

  const markerY =
    -height * 0.05 * wobble +
    Math.cos(elapsedSec * 0.9) * radius * 0.45 * wobble;
  ctx.save();
  ctx.translate(targetX + markerX, targetY + markerY);
  ctx.strokeStyle = hexToRgba(scene.buy, 0.9);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.26);
  ctx.lineTo(0, radius * 0.26);
  ctx.moveTo(-radius * 0.26, 0);
  ctx.lineTo(radius * 0.26, 0);
  ctx.stroke();
  ctx.restore();
  const rangeRadius = Math.min(width, height) * 0.36;
  const rangeMeters = Math.max(0, Math.round(4820 * (1 - easedProgress)));
  ctx.strokeStyle = hexToRgba(accent, 0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(centerX, centerY, rangeRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.2);
  ctx.beginPath();
  ctx.arc(centerX, centerY, rangeRadius + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hexToRgba(scene.buy, 0.85);
  ctx.fillText(
    `${(Math.sin(elapsedSec * 0.6) * 3.1 * wobble).toFixed(1)}°`,
    centerX - rangeRadius + 20,
    centerY - 14,
  );
  ctx.fillText(
    `${(Math.cos(elapsedSec * 0.5) * 2.3 * wobble).toFixed(1)}°`,
    centerX - rangeRadius + 20,
    centerY,
  );
  ctx.fillText(
    `${(Math.sin(elapsedSec * 0.4) * 0.6 * wobble).toFixed(1)}°`,
    centerX - rangeRadius + 20,
    centerY + 14,
  );
  ctx.save();
  ctx.translate(centerX - rangeRadius + 8, centerY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = hexToRgba(accent, 0.5);
  ctx.textAlign = "center";
  ctx.fillText("P Y R", 0, 0);
  ctx.restore();
  ctx.textAlign = "right";
  ctx.fillStyle = hexToRgba(scene.buy, 0.85);
  ctx.fillText(
    `${(Math.sin(elapsedSec * 0.5) * 0.1).toFixed(1)}°`,
    centerX + rangeRadius - 18,
    centerY - 8,
  );
  ctx.fillStyle = hexToRgba(accentAlt, 0.7);
  ctx.fillText(
    `${(Math.sin(elapsedSec * 0.7) * 0.6 * wobble).toFixed(1)}°/m`,
    centerX + rangeRadius - 18,
    centerY + 8,
  );
  ctx.save();
  ctx.translate(centerX + rangeRadius - 6, centerY);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = hexToRgba(accent, 0.5);
  ctx.textAlign = "center";
  ctx.fillText("P I T C H", 0, 0);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = hexToRgba(accent, 0.5);
  ctx.font = `9px ${MONO}`;
  ctx.fillText(
    "RANGE",
    centerX - rangeRadius * 0.42,
    centerY + rangeRadius - 28,
  );
  ctx.fillText(
    "RANGE RATE",
    centerX + rangeRadius * 0.42,
    centerY + rangeRadius - 28,
  );
  ctx.fillStyle = hexToRgba(accent, 0.95);
  ctx.font = `bold 18px ${MONO}`;
  ctx.fillText(
    `${rangeMeters} m`,
    centerX - rangeRadius * 0.42,
    centerY + rangeRadius - 9,
  );
  ctx.fillStyle = hexToRgba(accentAlt, 0.95);
  ctx.fillText(
    `-0.${padTwo(34 - Math.round(progress * 6))} m/s`,
    centerX + rangeRadius * 0.42,
    centerY + rangeRadius - 9,
  );
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const lockPhase = ease(Math.min(1, (progress - 0.18) / 0.5));
  const acquiring = progress < 0.25;
  const lockBox =
    craftRadius * 1.45 + (1 - lockPhase) * Math.min(width, height) * 0.18;
  const blink = acquiring ? 0.4 + 0.6 * Math.abs(Math.sin(elapsedSec * 9)) : 1;
  const lockColor = progress > 0.55 ? accentAlt : accent;
  ctx.strokeStyle = hexToRgba(lockColor, 0.92 * blink);
  ctx.lineWidth = 1.8;
  const tickLen = Math.max(10, lockBox * 0.22);
  (
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as [number, number][]
  ).forEach((corner) => {
    const cornerX = targetX + corner[0] * lockBox;
    const cornerY = targetY + corner[1] * lockBox;
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY - corner[1] * tickLen);
    ctx.lineTo(cornerX, cornerY);
    ctx.lineTo(cornerX - corner[0] * tickLen, cornerY);
    ctx.stroke();
  });

  if (progress < 0.6) {
    ctx.save();
    ctx.translate(targetX, targetY);
    ctx.rotate(elapsedSec * 1.4);
    ctx.strokeStyle = hexToRgba(accent, 0.5 * blink);
    ctx.setLineDash([8, 7]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, lockBox * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.strokeStyle = hexToRgba(lockColor, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(targetX + lockBox, targetY - lockBox);
  ctx.lineTo(targetX + lockBox + 34, targetY - lockBox - 24);
  ctx.lineTo(targetX + lockBox + 200, targetY - lockBox - 24);
  ctx.stroke();
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = hexToRgba(lockColor, 0.9);
  ctx.fillText(
    "AC-417 ▸ EUR/USD ESCORT",
    targetX + lockBox + 40,
    targetY - lockBox - 28,
  );
  ctx.strokeStyle = hexToRgba(accentAlt, 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(targetX, targetY);
  ctx.lineTo(
    targetX + (centerX - targetX) * 0.5,
    targetY + (centerY - targetY) * 0.5,
  );
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.6);
  ctx.lineWidth = 1.4;
  const crossGap = 14;
  ctx.beginPath();
  ctx.moveTo(centerX - 46, centerY);
  ctx.lineTo(centerX - crossGap, centerY);
  ctx.moveTo(centerX + crossGap, centerY);
  ctx.lineTo(centerX + 46, centerY);
  ctx.moveTo(centerX, centerY - 46);
  ctx.lineTo(centerX, centerY - crossGap);
  ctx.moveTo(centerX, centerY + crossGap);
  ctx.lineTo(centerX, centerY + 46);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.3);
  ctx.beginPath();
  ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(centerX, centerY + Math.sin(elapsedSec * 0.8) * 10);
  ctx.strokeStyle = hexToRgba(accent, 0.22);
  ctx.fillStyle = hexToRgba(accent, 0.4);
  ctx.font = `9px ${MONO}`;
  ctx.lineWidth = 1;

  for (let pip = -2; pip <= 2; pip++) {
    if (pip === 0) {
      continue;
    }

    const tickY = pip * 46;
    ctx.beginPath();
    ctx.moveTo(-72, tickY);
    ctx.lineTo(-32, tickY);
    ctx.moveTo(32, tickY);
    ctx.lineTo(72, tickY);
    ctx.stroke();
    ctx.fillText(padTwo(pip * 5), -92, tickY + 3);
  }

  ctx.restore();
  const scanY = ((elapsedSec * 0.35) % 1) * height;
  const scanGradient = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
  scanGradient.addColorStop(0, "rgba(0,0,0,0)");
  scanGradient.addColorStop(0.5, hexToRgba(accentAlt, 0.1));
  scanGradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = scanGradient;
  ctx.fillRect(0, scanY - 30, width, 60);
  const range = Math.max(0, Math.round(4820 * (1 - easedProgress)));
  const closure = Math.max(
    0,
    Math.round((58 + 22 * Math.sin(elapsedSec * 2)) * (1 - progress) + 3),
  );
  const bearing = (271.4 + Math.sin(elapsedSec * 0.7) * 0.6).toFixed(1);
  const az = (Math.sin(elapsedSec * 0.9) * 2.4 * wobble).toFixed(2);
  const el = (Math.cos(elapsedSec * 0.8) * 1.8 * wobble).toFixed(2);
  const dX = (((targetX - centerX) / width) * 100).toFixed(2);
  const dY = (((targetY - centerY) / height) * 100).toFixed(2);
  const dZ = (range / 100).toFixed(2);
  const timecode = `${padTwo(elapsedSec / 60)}:${padTwo(elapsedSec % 60)}:${padTwo((elapsedSec * 100) % 100)}`;

  function drawLabel(
    x: number,
    y: number,
    lines: string[],
    color?: string,
  ): void {
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = hexToRgba(color ?? accent, 0.85);
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * 15);
    });
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawLabel(20, 28, [
    "◉ CAM-04  DOCK BAY 07",
    "GIMBAL TRACK · AUTO",
    `TC ${timecode}`,
  ]);
  ctx.fillStyle = hexToRgba(scene.sell, 0.9);
  ctx.font = `11px ${MONO}`;
  ctx.fillText("● REC", 20, 73);
  ctx.textAlign = "right";
  drawLabel(width - 20, 28, [
    `RANGE   ${range} m`,
    `CLOSURE ${closure} m/s`,
    `BEARING ${bearing}°`,
  ]);
  drawLabel(width - 20, 73, [`AZ ${az}   EL ${el}`], accentAlt);
  drawLabel(
    width - 20,
    height - 58,
    ["LINK  SECURE · AES-256", "AUTH  OK ▸ TRD-0042"],
    accentAlt,
  );
  ctx.textAlign = "left";
  drawLabel(20, height - 58, [
    `ALIGN  dX ${dX}  dY ${dY}`,
    `       dZ ${dZ}  ROLL ${(Math.sin(elapsedSec * 1.7) * 1.2).toFixed(1)}`,
    `THRUST ${Math.round(8 + 12 * (1 - progress))}%   MASS 42.6t`,
  ]);
  const bars = 5;

  for (let i = 0; i < bars; i++) {
    const lit = i < 3 + Math.round(1.4 * Math.sin(elapsedSec * 4 + i) + 1.2);
    ctx.fillStyle = hexToRgba(lit ? accentAlt : accent, lit ? 0.85 : 0.2);
    ctx.fillRect(width - 20 - (bars - i) * 9, height - 26, 6, 4 + i * 3);
  }

  let statusText = "ACQUIRING";
  let statusColor = accent;

  if (progress >= 0.25 && progress < 0.55) {
    statusText = "TRACKING";
    statusColor = accent;
  } else if (progress >= 0.55 && progress < 0.8) {
    statusText = "TARGET LOCKED";
    statusColor = accentAlt;
  } else if (progress >= 0.8 && progress < 0.96) {
    statusText = "DOCKING SEQUENCE";
    statusColor = accentAlt;
  } else if (progress >= 0.96) {
    statusText = "CLAMP ENGAGED";
    statusColor = scene.buy;
  }

  const statusBlink =
    statusText === "ACQUIRING"
      ? 0.45 + 0.55 * Math.abs(Math.sin(elapsedSec * 7))
      : 1;
  ctx.font = `bold 13px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillStyle = hexToRgba(statusColor, 0.95 * statusBlink);
  ctx.fillText(`▸ ${statusText} ◂`, centerX, centerY - 66);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (progress > 0.92) {
    const fadeAlpha = (progress - 0.92) / 0.08;
    const flashGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      Math.max(width, height) * 0.5,
    );
    flashGradient.addColorStop(0, hexToRgba("#ffffff", 0.4 * fadeAlpha));
    flashGradient.addColorStop(0.35, hexToRgba(accentAlt, 0.3 * fadeAlpha));
    flashGradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = flashGradient;
    ctx.fillRect(0, 0, width, height);
  }
}
