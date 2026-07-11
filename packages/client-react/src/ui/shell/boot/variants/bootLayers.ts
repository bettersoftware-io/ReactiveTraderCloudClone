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
  f: number;
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

function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
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
export function createBootLayers(d: BootDrawCtx): BootFrameFn {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;

  function resize(): void {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
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

  const pullables = panels.filter((p) => {
    return p.pull;
  });

  return function drawBootLayers(): void {
    if (c.width !== c.offsetWidth) {
      resize();
    }

    const t = (performance.now() - d.start) / 1000;
    const prog = Math.min(1, (performance.now() - d.start) / BOOT_DURATION_MS);
    const W = c.width;
    const H = c.height;
    const cx = W / 2;
    const cy = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,3,6,0.55)";
    ctx.fillRect(0, 0, W, H);

    // phases: draw-in → explode → orbit/pull → recomposite
    const ek = ease((prog - 0.14) / 0.2);
    const ck = ease((prog - 0.93) / 0.07);
    const E = ek * (1 - ck);
    const mx = d.pointer.mx;
    const my = d.pointer.my;
    const yaw = (0.5 + Math.sin(t * 0.5) * 0.2 + mx * 0.45) * E;
    const pitch = (0.15 + my * 0.22) * E;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const S = Math.min(W, H) * 0.42;

    function P(x: number, y: number, z: number): Projected3 {
      const x1 = x * cyw - z * syw;
      const z1 = x * syw + z * cyw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const f = 1 / Math.max(0.4, 1 + z2 * 0.24);
      return { x: cx + x1 * S * f, y: cy + y1 * S * f, z: z2, f };
    }

    let ga = 0.88 + 0.12 * Math.sin(t * 34 + Math.sin(t * 8) * 4);

    if (rnd(Math.floor(t * 6) + 7) > 0.94) {
      ga *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = ga;

    // arc rings behind the stack
    ctx.strokeStyle = hexToRgba(acc, 0.1);
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.arc(cx, cy, S * 1.18, t * 0.2, t * 0.2 + 5.4);
    ctx.stroke();
    ctx.setLineDash([2, 9]);
    ctx.beginPath();
    ctx.arc(cx, cy, S * 1.3, -t * 0.13, -t * 0.13 + 5.8);
    ctx.stroke();
    ctx.setLineDash([]);

    // which panel is pulled out right now
    const pullOn = prog > 0.38 && prog < 0.92;
    const cyc = Math.max(0, t - (BOOT_DURATION_MS / 1000) * 0.38);
    const pi2 = Math.floor(cyc / 1.05) % pullables.length;
    const ph2 = (cyc % 1.05) / 1.05;
    const pk = pullOn ? Math.sin(Math.PI * ph2) : 0;

    // world mapping + painter sort
    function wp(p: LayerPanel): WorldRect {
      const zz =
        p.z * E * 1.15 + (pullOn && pullables[pi2] === p ? -0.85 * pk : 0);
      return {
        x0: (p.x - 0.5) * 2.6,
        y0: (p.y - 0.5) * 1.7,
        ww: p.w * 2.6,
        wh: p.h * 1.7,
        zz,
      };
    }

    const order: OrderEntry[] = panels
      .map((p) => {
        const w = wp(p);
        const cP = P(w.x0 + w.ww / 2, w.y0 + w.wh / 2, w.zz);
        return { p, w, cP };
      })
      .sort((a, b) => {
        return b.cP.z - a.cP.z;
      });

    order.forEach((o) => {
      const p = o.p;
      const w = o.w;
      const ik = clamp((prog - 0.02 - panels.indexOf(p) * 0.014) / 0.09);

      if (ik <= 0) {
        return;
      }

      function M(u: number, v: number): Projected3 {
        return P(w.x0 + u * w.ww, w.y0 + v * w.wh, w.zz);
      }

      const pulled = pullOn && pullables[pi2] === p && pk > 0.05;
      const al =
        (0.35 + 0.45 * clamp((0.6 - o.cP.z) / 1.2)) * ik * (pulled ? 1.15 : 1);

      function quad(
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        fill?: string,
        fa?: number,
      ): void {
        const a = M(u0, v0);
        const b = M(u1, v0);
        const c2 = M(u1, v1);
        const dd = M(u0, v1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(dd.x, dd.y);
        ctx.closePath();

        if (fill !== undefined) {
          ctx.fillStyle = hexToRgba(fill, fa ?? 1);
          ctx.fill();
        }
      }

      function strokeQ(
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        col: string,
        sa: number,
        lw?: number,
      ): void {
        quad(u0, v0, u1, v1);
        ctx.strokeStyle = hexToRgba(col, sa);
        ctx.lineWidth = lw ?? 1;
        ctx.stroke();
      }

      // ghost frame + corner tethers back to the flat plane
      if (E > 0.05 && p.kind !== "bg") {
        function G(u: number, v: number): Projected3 {
          return P(w.x0 + u * w.ww, w.y0 + v * w.wh, 0);
        }

        ctx.setLineDash([4, 6]);
        const g0 = G(0, 0);
        const g1 = G(1, 0);
        const g2 = G(1, 1);
        const g3 = G(0, 1);
        ctx.strokeStyle = hexToRgba(acc, 0.13 * E);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g0.x, g0.y);
        ctx.lineTo(g1.x, g1.y);
        ctx.lineTo(g2.x, g2.y);
        ctx.lineTo(g3.x, g3.y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        (
          [
            [0, 0, g0],
            [1, 0, g1],
            [1, 1, g2],
            [0, 1, g3],
          ] as [number, number, Projected3][]
        ).forEach((q) => {
          const a = M(q[0], q[1]);
          ctx.strokeStyle = hexToRgba(acc, 0.1 * E);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(q[2].x, q[2].y);
          ctx.stroke();
        });
      }

      // panel face + border
      if (p.kind === "bg") {
        ctx.strokeStyle = hexToRgba(acc, 0.08 * ik * E);
        ctx.lineWidth = 1;

        for (let u = 0; u <= 1.001; u += 0.125) {
          const a = M(u, 0);
          const b = M(u, 1);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        for (let v = 0; v <= 1.001; v += 0.125) {
          const a = M(0, v);
          const b = M(1, v);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        strokeQ(0, 0, 1, 1, acc, 0.15 * ik * E, 1);
        return;
      }

      quad(0, 0, 1, 1, "#04141d", 0.42 * al);

      if (pulled) {
        ctx.shadowColor = acc;
        ctx.shadowBlur = 18 * pk;
      }

      strokeQ(
        0,
        0,
        1,
        1,
        pulled ? ac2 : acc,
        Math.min(1, al + 0.25),
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
      ).forEach((q) => {
        const a = M(q[0], q[1]);
        ctx.fillStyle = hexToRgba(pulled ? ac2 : acc, al);
        ctx.fillRect(a.x - 1.5, a.y - 1.5, 3, 3);
      });

      // panel content, drawn in-plane
      const ca = al * 0.9;

      if (p.kind === "header") {
        for (let i = 0; i < 5; i++) {
          quad(
            0.02 + i * 0.09,
            0.28,
            0.09 + i * 0.09,
            0.72,
            i === 0 ? ac2 : acc,
            ca * 0.5,
          );
        }

        quad(0.78, 0.25, 0.98, 0.75, acc, ca * 0.25);
      } else if (p.kind === "main") {
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const u0 = 0.03 + i * 0.5;
            const v0 = 0.04 + j * 0.5;
            const u1 = u0 + 0.44;
            const v1 = v0 + 0.42;
            strokeQ(u0, v0, u1, v1, acc, ca * 0.6, 1);
            quad(u0, v0, u1, v0 + 0.12, acc, ca * 0.18);
            ctx.strokeStyle = hexToRgba(ac2, ca * 0.85);
            ctx.lineWidth = 1.4;
            ctx.beginPath();

            for (let s2 = 0; s2 <= 10; s2++) {
              const u = u0 + 0.02 + (u1 - u0 - 0.04) * (s2 / 10);
              const v =
                v1 -
                0.06 -
                Math.abs(Math.sin(s2 * 0.9 + i * 2 + j + t * 0.7)) *
                  (v1 - v0) *
                  0.24;
              const a = M(u, v);

              if (s2 === 0) {
                ctx.moveTo(a.x, a.y);
              } else {
                ctx.lineTo(a.x, a.y);
              }
            }

            ctx.stroke();
          }
        }
      } else if (p.kind === "list") {
        for (let i = 0; i < 4; i++) {
          quad(
            0.04,
            0.08 + i * 0.24,
            0.04 + (0.9 - i * 0.13) * (0.8 + 0.2 * Math.sin(t * 1.3 + i)),
            0.22 + i * 0.24,
            acc,
            ca * (0.45 - i * 0.07),
          );
        }
      } else if (p.kind === "blotter") {
        quad(0.02, 0.06, 0.98, 0.24, ac2, ca * 0.4);

        for (let i = 1; i < 4; i++) {
          const v = 0.24 + i * 0.24;
          ctx.strokeStyle = hexToRgba(acc, ca * 0.3);
          ctx.lineWidth = 1;
          const a = M(0.02, v);
          const b = M(0.98, v);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          for (let cI = 0; cI < 5; cI++) {
            quad(
              0.03 + cI * 0.19,
              v - 0.16,
              0.15 + cI * 0.19,
              v - 0.04,
              acc,
              ca * 0.3,
            );
          }
        }
      } else if (p.kind === "status") {
        for (let i = 0; i < 9; i++) {
          quad(
            0.02 + i * 0.11,
            0.25,
            0.08 + i * 0.11,
            0.75,
            i % 3 === 0 ? ac2 : acc,
            ca * 0.5,
          );
        }
      }

      // layer id tag on the left edge
      if (E > 0.3) {
        const a = M(-0.005, 0.5);
        ctx.font = `9px ${MONO}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = hexToRgba(acc, 0.65 * E);
        ctx.fillText(p.label.slice(0, 3), a.x - 6, a.y);
      }

      // pulled panel: scan sweep + callout
      if (pulled) {
        const sv = (t * 1.4) % 1;
        ctx.strokeStyle = hexToRgba(ac2, 0.5 * pk);
        ctx.lineWidth = 1.2;
        const a = M(0, sv);
        const b = M(1, sv);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        const tr = M(1, 0);
        ctx.strokeStyle = hexToRgba(ac2, 0.7 * pk);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tr.x, tr.y);
        ctx.lineTo(tr.x + 26, tr.y - 20);
        ctx.lineTo(tr.x + 190, tr.y - 20);
        ctx.stroke();
        ctx.font = `11px ${MONO}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = hexToRgba(ac2, 0.95 * pk);
        ctx.fillText(p.label, tr.x + 32, tr.y - 25);
        ctx.fillStyle = hexToRgba(acc, 0.7 * pk);
        ctx.fillText(
          `Z ${(w.zz * 100).toFixed(0)}  ·  COMPOSITE OK`,
          tr.x + 32,
          tr.y - 11,
        );
      }
    });

    // corner telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(acc, 0.7);
    ctx.fillText("◉ UI COMPOSITOR · LAYER VIEW", 20, 28);
    ctx.fillText(`LAYERS 07 · Z-SPREAD ${Math.round(E * 100)}%`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(
      `YAW ${(yaw * 57.29).toFixed(1)}°  PITCH ${(pitch * 57.29).toFixed(1)}°`,
      W - 20,
      28,
    );
    ctx.fillStyle = hexToRgba(ac2, 0.7);
    ctx.fillText("CURSOR TRACK · LIVE", W - 20, 44);

    let stt = "COMPILING INTERFACE";
    let sc = acc;

    if (prog >= 0.14 && prog < 0.38) {
      stt = "DECOMPOSING LAYERS";
    } else if (prog >= 0.38 && prog < 0.92) {
      stt = `LAYER INSPECTION ▸ ${pullables[pi2].label.slice(6)}`;
      sc = ac2;
    } else if (prog >= 0.92) {
      stt = "RECOMPOSITING ▸ LAUNCH";
      sc = d.buy;
    }

    const bk2 = prog < 0.14 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(sc, 0.9 * bk2);
    ctx.fillText(`▸ ${stt} ◂`, cx, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
