// drawBootLayers — verbatim port of the v3 prototype's _drawBootLayers.
// The app's own layout decomposes into 7 z-separated wireframe layers
// (DevTools-Layers style): dashed ghost frames + corner tethers mark
// original positions, panels pull out toward the camera one at a time
// (glow, scan sweep, label + z-depth callout), the stack tracks the
// cursor in yaw/pitch, and everything recomposites flat exactly as the
// real app reveals.

import {
  BOOT_DURATION_MS,
  type BootDrawCtx,
  type BootFrameFn,
  ease,
  hexToRgba,
} from "../bootCanvas";

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

type PanelKind = "bg" | "status" | "blotter" | "main" | "list" | "header";

/** One exploded UI layer — normalised rect + z-depth + content kind. */
interface LayerPanel {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  kind: PanelKind;
  label: string;
  pull: boolean;
}

/** Yaw/pitch-projected 3D point with perspective-divide factor. */
interface Projected3 {
  x: number;
  y: number;
  z: number;
  perspective: number;
}

/** World-space rect (post z-explode / pull offset) for one panel. */
interface WorldRect {
  x0: number;
  y0: number;
  ww: number;
  wh: number;
  zz: number;
}

/** Painter's-order entry: panel + its world rect + projected centre. */
interface OrderEntry {
  p: LayerPanel;
  w: WorldRect;
  cP: Projected3;
}

// Deterministic hash-noise in [0,1) — used only for the occasional flicker dip.
function hashRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * createBootLayers — factory runs once per boot (builds the panels table),
 * returns the per-frame draw closure. No self-scheduling: BootSequence.tsx
 * owns the rAF loop and calls the returned function every frame.
 */
export function createBootLayers(scene: BootDrawCtx): BootFrameFn {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;

  function resize(): void {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  resize();

  // the app's own layout, decomposed into z-separated layers (DevTools-style)
  const panels: LayerPanel[] = [
    {
      x: 0.02,
      y: 0.0,
      w: 0.96,
      h: 0.96,
      z: 0.55,
      kind: "bg",
      label: "L06 · BACKDROP GRID",
      pull: false,
    },
    {
      x: 0.05,
      y: 0.88,
      w: 0.9,
      h: 0.05,
      z: 0.38,
      kind: "status",
      label: "L05 · SYSTEM BUS",
      pull: true,
    },
    {
      x: 0.05,
      y: 0.69,
      w: 0.9,
      h: 0.16,
      z: 0.24,
      kind: "blotter",
      label: "L04 · TRADE BLOTTER",
      pull: true,
    },
    {
      x: 0.05,
      y: 0.18,
      w: 0.56,
      h: 0.47,
      z: 0.0,
      kind: "main",
      label: "L03 · FX PRICING GRID",
      pull: true,
    },
    {
      x: 0.64,
      y: 0.18,
      w: 0.31,
      h: 0.21,
      z: -0.22,
      kind: "list",
      label: "L02 · WATCHLIST",
      pull: true,
    },
    {
      x: 0.64,
      y: 0.44,
      w: 0.31,
      h: 0.21,
      z: -0.3,
      kind: "list",
      label: "L02 · RFQ INBOX",
      pull: true,
    },
    {
      x: 0.05,
      y: 0.06,
      w: 0.9,
      h: 0.08,
      z: -0.45,
      kind: "header",
      label: "L01 · COMMAND BAR",
      pull: true,
    },
  ];

  const pullables = panels.filter((panel) => {
    return panel.pull;
  });

  return function drawBootLayers(): void {
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
    const centerY = height / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0,3,6,0.55)";
    ctx.fillRect(0, 0, width, height);

    // phases: draw-in → explode → orbit/pull → recomposite
    const explodePhase = ease((progress - 0.14) / 0.2);
    const recompositePhase = ease((progress - 0.93) / 0.07);
    const spread = explodePhase * (1 - recompositePhase);
    const pointerX = scene.pointer.mx;
    const pointerY = scene.pointer.my;
    const yaw =
      (0.5 + Math.sin(elapsedSec * 0.5) * 0.2 + pointerX * 0.45) * spread;
    const pitch = (0.15 + pointerY * 0.22) * spread;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const projScale = Math.min(width, height) * 0.42;

    // yaw/pitch-rotate then perspective-divide one world point onto the canvas
    function project(x: number, y: number, z: number): Projected3 {
      const x1 = x * cosYaw - z * sinYaw;
      const z1 = x * sinYaw + z * cosYaw;
      const y1 = y * cosPitch - z1 * sinPitch;
      const z2 = y * sinPitch + z1 * cosPitch;
      const perspective = 1 / Math.max(0.4, 1 + z2 * 0.24);
      return {
        x: centerX + x1 * projScale * perspective,
        y: centerY + y1 * projScale * perspective,
        z: z2,
        perspective,
      };
    }

    let flickerAlpha =
      0.88 + 0.12 * Math.sin(elapsedSec * 34 + Math.sin(elapsedSec * 8) * 4);

    if (hashRandom(Math.floor(elapsedSec * 6) + 7) > 0.94) {
      flickerAlpha *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = flickerAlpha;

    // arc rings behind the stack
    ctx.strokeStyle = hexToRgba(accent, 0.1);
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      projScale * 1.18,
      elapsedSec * 0.2,
      elapsedSec * 0.2 + 5.4,
    );
    ctx.stroke();
    ctx.setLineDash([2, 9]);
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      projScale * 1.3,
      -elapsedSec * 0.13,
      -elapsedSec * 0.13 + 5.8,
    );
    ctx.stroke();
    ctx.setLineDash([]);

    // which panel is pulled out right now
    const pullOn = progress > 0.38 && progress < 0.92;
    const pullCycleSec = Math.max(
      0,
      elapsedSec - (BOOT_DURATION_MS / 1000) * 0.38,
    );
    const pulledIdx = Math.floor(pullCycleSec / 1.05) % pullables.length;
    const pullPhase = (pullCycleSec % 1.05) / 1.05;
    const pullAmount = pullOn ? Math.sin(Math.PI * pullPhase) : 0;

    // world mapping + painter sort
    function toWorldRect(panel: LayerPanel): WorldRect {
      const zz =
        panel.z * spread * 1.15 +
        (pullOn && pullables[pulledIdx] === panel ? -0.85 * pullAmount : 0);
      return {
        x0: (panel.x - 0.5) * 2.6,
        y0: (panel.y - 0.5) * 1.7,
        ww: panel.w * 2.6,
        wh: panel.h * 1.7,
        zz,
      };
    }

    const paintOrder: OrderEntry[] = panels
      .map((panel) => {
        const worldRect = toWorldRect(panel);
        const centerProj = project(
          worldRect.x0 + worldRect.ww / 2,
          worldRect.y0 + worldRect.wh / 2,
          worldRect.zz,
        );
        return { p: panel, w: worldRect, cP: centerProj };
      })
      .sort((entryA, entryB) => {
        return entryB.cP.z - entryA.cP.z;
      });

    paintOrder.forEach((entry) => {
      const panel = entry.p;
      const worldRect = entry.w;
      const panelDrawPhase = clamp(
        (progress - 0.02 - panels.indexOf(panel) * 0.014) / 0.09,
      );

      if (panelDrawPhase <= 0) {
        return;
      }

      // map a panel-local UV coord onto the canvas at this panel's z-depth
      function panelUV(u: number, v: number): Projected3 {
        return project(
          worldRect.x0 + u * worldRect.ww,
          worldRect.y0 + v * worldRect.wh,
          worldRect.zz,
        );
      }

      const pulled =
        pullOn && pullables[pulledIdx] === panel && pullAmount > 0.05;
      const alpha =
        (0.35 + 0.45 * clamp((0.6 - entry.cP.z) / 1.2)) *
        panelDrawPhase *
        (pulled ? 1.15 : 1);

      function fillQuad(
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        fill?: string,
        fa?: number,
      ): void {
        const cornerA = panelUV(u0, v0);
        const cornerB = panelUV(u1, v0);
        const cornerC = panelUV(u1, v1);
        const cornerD = panelUV(u0, v1);
        ctx.beginPath();
        ctx.moveTo(cornerA.x, cornerA.y);
        ctx.lineTo(cornerB.x, cornerB.y);
        ctx.lineTo(cornerC.x, cornerC.y);
        ctx.lineTo(cornerD.x, cornerD.y);
        ctx.closePath();

        if (fill !== undefined) {
          ctx.fillStyle = hexToRgba(fill, fa ?? 1);
          ctx.fill();
        }
      }

      function strokeQuad(
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        col: string,
        sa: number,
        lw?: number,
      ): void {
        fillQuad(u0, v0, u1, v1);
        ctx.strokeStyle = hexToRgba(col, sa);
        ctx.lineWidth = lw ?? 1;
        ctx.stroke();
      }

      // ghost frame + corner tethers back to the flat plane
      if (spread > 0.05 && panel.kind !== "bg") {
        // same UV mapper, but pinned to the flat plane (z = 0)
        function flatPanelUV(u: number, v: number): Projected3 {
          return project(
            worldRect.x0 + u * worldRect.ww,
            worldRect.y0 + v * worldRect.wh,
            0,
          );
        }

        ctx.setLineDash([4, 6]);
        const flatTL = flatPanelUV(0, 0);
        const flatTR = flatPanelUV(1, 0);
        const flatBR = flatPanelUV(1, 1);
        const flatBL = flatPanelUV(0, 1);
        ctx.strokeStyle = hexToRgba(accent, 0.13 * spread);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(flatTL.x, flatTL.y);
        ctx.lineTo(flatTR.x, flatTR.y);
        ctx.lineTo(flatBR.x, flatBR.y);
        ctx.lineTo(flatBL.x, flatBL.y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        (
          [
            [0, 0, flatTL],
            [1, 0, flatTR],
            [1, 1, flatBR],
            [0, 1, flatBL],
          ] as [number, number, Projected3][]
        ).forEach((corner) => {
          const cornerPoint = panelUV(corner[0], corner[1]);
          ctx.strokeStyle = hexToRgba(accent, 0.1 * spread);
          ctx.beginPath();
          ctx.moveTo(cornerPoint.x, cornerPoint.y);
          ctx.lineTo(corner[2].x, corner[2].y);
          ctx.stroke();
        });
      }

      // panel face + border
      if (panel.kind === "bg") {
        ctx.strokeStyle = hexToRgba(accent, 0.08 * panelDrawPhase * spread);
        ctx.lineWidth = 1;

        for (let u = 0; u <= 1.001; u += 0.125) {
          const pointA = panelUV(u, 0);
          const pointB = panelUV(u, 1);
          ctx.beginPath();
          ctx.moveTo(pointA.x, pointA.y);
          ctx.lineTo(pointB.x, pointB.y);
          ctx.stroke();
        }

        for (let v = 0; v <= 1.001; v += 0.125) {
          const pointA = panelUV(0, v);
          const pointB = panelUV(1, v);
          ctx.beginPath();
          ctx.moveTo(pointA.x, pointA.y);
          ctx.lineTo(pointB.x, pointB.y);
          ctx.stroke();
        }

        strokeQuad(0, 0, 1, 1, accent, 0.15 * panelDrawPhase * spread, 1);
        return;
      }

      fillQuad(0, 0, 1, 1, "#04141d", 0.42 * alpha);

      if (pulled) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 18 * pullAmount;
      }

      strokeQuad(
        0,
        0,
        1,
        1,
        pulled ? accentAlt : accent,
        Math.min(1, alpha + 0.25),
        pulled ? 1.8 : 1.2,
      );
      ctx.shadowBlur = 0;

      // corner grab-points
      (
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ] as [number, number][]
      ).forEach((corner) => {
        const cornerPoint = panelUV(corner[0], corner[1]);
        ctx.fillStyle = hexToRgba(pulled ? accentAlt : accent, alpha);
        ctx.fillRect(cornerPoint.x - 1.5, cornerPoint.y - 1.5, 3, 3);
      });

      // panel content, drawn in-plane
      const contentAlpha = alpha * 0.9;

      if (panel.kind === "header") {
        for (let i = 0; i < 5; i++) {
          fillQuad(
            0.02 + i * 0.09,
            0.28,
            0.09 + i * 0.09,
            0.72,
            i === 0 ? accentAlt : accent,
            contentAlpha * 0.5,
          );
        }

        fillQuad(0.78, 0.25, 0.98, 0.75, accent, contentAlpha * 0.25);
      } else if (panel.kind === "main") {
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const u0 = 0.03 + i * 0.5;
            const v0 = 0.04 + j * 0.5;
            const u1 = u0 + 0.44;
            const v1 = v0 + 0.42;
            strokeQuad(u0, v0, u1, v1, accent, contentAlpha * 0.6, 1);
            fillQuad(u0, v0, u1, v0 + 0.12, accent, contentAlpha * 0.18);
            ctx.strokeStyle = hexToRgba(accentAlt, contentAlpha * 0.85);
            ctx.lineWidth = 1.4;
            ctx.beginPath();

            for (let sample = 0; sample <= 10; sample++) {
              const u = u0 + 0.02 + (u1 - u0 - 0.04) * (sample / 10);
              const v =
                v1 -
                0.06 -
                Math.abs(
                  Math.sin(sample * 0.9 + i * 2 + j + elapsedSec * 0.7),
                ) *
                  (v1 - v0) *
                  0.24;
              const point = panelUV(u, v);

              if (sample === 0) {
                ctx.moveTo(point.x, point.y);
              } else {
                ctx.lineTo(point.x, point.y);
              }
            }

            ctx.stroke();
          }
        }
      } else if (panel.kind === "list") {
        for (let i = 0; i < 4; i++) {
          fillQuad(
            0.04,
            0.08 + i * 0.24,
            0.04 +
              (0.9 - i * 0.13) * (0.8 + 0.2 * Math.sin(elapsedSec * 1.3 + i)),
            0.22 + i * 0.24,
            accent,
            contentAlpha * (0.45 - i * 0.07),
          );
        }
      } else if (panel.kind === "blotter") {
        fillQuad(0.02, 0.06, 0.98, 0.24, accentAlt, contentAlpha * 0.4);

        for (let i = 1; i < 4; i++) {
          const v = 0.24 + i * 0.24;
          ctx.strokeStyle = hexToRgba(accent, contentAlpha * 0.3);
          ctx.lineWidth = 1;
          const pointA = panelUV(0.02, v);
          const pointB = panelUV(0.98, v);
          ctx.beginPath();
          ctx.moveTo(pointA.x, pointA.y);
          ctx.lineTo(pointB.x, pointB.y);
          ctx.stroke();

          for (let cell = 0; cell < 5; cell++) {
            fillQuad(
              0.03 + cell * 0.19,
              v - 0.16,
              0.15 + cell * 0.19,
              v - 0.04,
              accent,
              contentAlpha * 0.3,
            );
          }
        }
      } else if (panel.kind === "status") {
        for (let i = 0; i < 9; i++) {
          fillQuad(
            0.02 + i * 0.11,
            0.25,
            0.08 + i * 0.11,
            0.75,
            i % 3 === 0 ? accentAlt : accent,
            contentAlpha * 0.5,
          );
        }
      }

      // layer id tag on the left edge
      if (spread > 0.3) {
        const labelPoint = panelUV(-0.005, 0.5);
        ctx.font = `9px ${MONO}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = hexToRgba(accent, 0.65 * spread);
        ctx.fillText(panel.label.slice(0, 3), labelPoint.x - 6, labelPoint.y);
      }

      // pulled panel: scan sweep + callout
      if (pulled) {
        const scanV = (elapsedSec * 1.4) % 1;
        ctx.strokeStyle = hexToRgba(accentAlt, 0.5 * pullAmount);
        ctx.lineWidth = 1.2;
        const scanA = panelUV(0, scanV);
        const scanB = panelUV(1, scanV);
        ctx.beginPath();
        ctx.moveTo(scanA.x, scanA.y);
        ctx.lineTo(scanB.x, scanB.y);
        ctx.stroke();

        const topRight = panelUV(1, 0);
        ctx.strokeStyle = hexToRgba(accentAlt, 0.7 * pullAmount);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(topRight.x, topRight.y);
        ctx.lineTo(topRight.x + 26, topRight.y - 20);
        ctx.lineTo(topRight.x + 190, topRight.y - 20);
        ctx.stroke();
        ctx.font = `11px ${MONO}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = hexToRgba(accentAlt, 0.95 * pullAmount);
        ctx.fillText(panel.label, topRight.x + 32, topRight.y - 25);
        ctx.fillStyle = hexToRgba(accent, 0.7 * pullAmount);
        ctx.fillText(
          `Z ${(worldRect.zz * 100).toFixed(0)}  ·  COMPOSITE OK`,
          topRight.x + 32,
          topRight.y - 11,
        );
      }
    });

    // corner telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(accent, 0.7);
    ctx.fillText("◉ UI COMPOSITOR · LAYER VIEW", 20, 28);
    ctx.fillText(`LAYERS 07 · Z-SPREAD ${Math.round(spread * 100)}%`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(
      `YAW ${(yaw * 57.29).toFixed(1)}°  PITCH ${(pitch * 57.29).toFixed(1)}°`,
      width - 20,
      28,
    );
    ctx.fillStyle = hexToRgba(accentAlt, 0.7);
    ctx.fillText("CURSOR TRACK · LIVE", width - 20, 44);

    let statusText = "COMPILING INTERFACE";
    let statusColor = accent;

    if (progress >= 0.14 && progress < 0.38) {
      statusText = "DECOMPOSING LAYERS";
    } else if (progress >= 0.38 && progress < 0.92) {
      statusText = `LAYER INSPECTION ▸ ${pullables[pulledIdx].label.slice(6)}`;
      statusColor = accentAlt;
    } else if (progress >= 0.92) {
      statusText = "RECOMPOSITING ▸ LAUNCH";
      statusColor = scene.buy;
    }

    const blink =
      progress < 0.14 ? 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(statusColor, 0.9 * blink);
    ctx.fillText(`▸ ${statusText} ◂`, centerX, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
