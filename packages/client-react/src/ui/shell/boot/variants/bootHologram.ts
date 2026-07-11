// drawBootHologram — verbatim port of the v3 prototype's _drawBootHologram
// (Reactive Trader.dc.html). Renders "HOLO-PROJ 01" — a volumetric hologram
// of the market core: an orbiting 3D bar-column grid that assembles from
// scattered particles inside a rising light cone, ringed by an emitter pad,
// gyroscopic segmented rings and dust motes, with floating FX/Risk/Order-flow
// callout panels on leader lines (see docs/design/v3/CHANGELOG.md entry 4,
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
function ease(k: number): number {
  return 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Deterministic pseudo-random in [0,1) from an integer seed. Verbatim from
 * the prototype's `rnd` helper — a sine-based hash, not Math.random, so the
 * particle field is stable across renders.
 */
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** One market-data column in the 9x9 assembling grid. */
interface HoloColumn {
  nx: number;
  nz: number;
  h: number;
  ph: number;
  d: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Backdrop hex-field cell. */
interface HoloHex {
  x: number;
  y: number;
  r: number;
  p: number;
}

/** Rising dust mote inside the light cone. */
interface HoloMote {
  a: number;
  r: number;
  s: number;
  o: number;
}

/** Floating callout panel (FX CORE / RISK GRID / ORDER FLOW). */
interface HoloTag {
  i: number;
  label: string;
  v: string;
  t0: number;
}

/** 3D-projected screen point with depth (z) and perspective foreshortening (f). */
interface ProjPoint {
  x: number;
  y: number;
  z: number;
  f: number;
}

/**
 * createBootHologram — verbatim port of the prototype's `_drawBootHologram(start, DUR)`.
 * The factory runs once per boot (grid/hex/mote/tag seeding); the returned
 * closure is the prototype's inner `draw()`, called every rAF frame by the caller.
 */
export function createBootHologram(d: BootDrawCtx): BootFrameFn {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;

  if (c.width !== c.offsetWidth) {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  const cols: HoloColumn[] = [];

  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      const i = gx * GRID_SIZE + gz;
      cols.push({
        nx: (gx - (GRID_SIZE - 1) / 2) / ((GRID_SIZE - 1) / 2),
        nz: (gz - (GRID_SIZE - 1) / 2) / ((GRID_SIZE - 1) / 2),
        h: 0.16 + 0.78 * rnd(i * 3 + 1),
        ph: rnd(i * 7 + 2) * 6.283,
        d: rnd(i * 5 + 3),
        sx: (rnd(i * 11 + 4) - 0.5) * 3.4,
        sy: -0.5 - rnd(i * 13 + 5) * 1.8,
        sz: (rnd(i * 17 + 6) - 0.5) * 3.4,
      });
    }
  }

  const hexes: HoloHex[] = [];

  for (let i = 0; i < 16; i++) {
    hexes.push({
      x: rnd(i * 29 + 9),
      y: rnd(i * 31 + 8),
      r: 8 + rnd(i * 37 + 7) * 20,
      p: rnd(i * 41 + 6) * 6.283,
    });
  }

  const motes: HoloMote[] = [];

  for (let i = 0; i < 36; i++) {
    motes.push({
      a: rnd(i * 19 + 2) * 6.283,
      r: 0.15 + rnd(i * 23 + 3) * 1.1,
      s: 0.05 + rnd(i * 43 + 4) * 0.16,
      o: rnd(i * 47 + 5),
    });
  }

  const tags: HoloTag[] = [
    { i: GRID_SIZE * 1 + 1, label: "FX CORE", v: "▲ 1.0842", t0: 0.55 },
    { i: GRID_SIZE * 7 + 2, label: "RISK GRID", v: "σ 12.4", t0: 0.65 },
    { i: GRID_SIZE * 4 + 7, label: "ORDER FLOW", v: "≡ 48/s", t0: 0.75 },
  ];

  return () => {
    if (c.width !== c.offsetWidth) {
      c.width = c.offsetWidth;
      c.height = c.offsetHeight;
    }

    const t = (performance.now() - d.start) / 1000;
    const prog = Math.min(1, (performance.now() - d.start) / BOOT_DURATION_MS);
    const W = c.width;
    const H = c.height;
    const cx = W / 2;
    const cy = H / 2 - 10;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,3,6,0.5)";
    ctx.fillRect(0, 0, W, H);

    // sparse hex field backdrop
    hexes.forEach((hx) => {
      const a = 0.045 + 0.045 * Math.sin(t * 0.8 + hx.p);
      ctx.strokeStyle = hexToRgba(acc, a);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let k2 = 0; k2 <= 6; k2++) {
        const an = (k2 / 6) * 6.283 + 0.52;
        const px = hx.x * W + Math.cos(an) * hx.r;
        const py = hx.y * H + Math.sin(an) * hx.r;

        if (k2 === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }

      ctx.stroke();
    });

    // 3D projection (slow orbital yaw + fixed pitch, mild perspective)
    const yaw = t * 0.45 + 0.7;
    const cp = Math.cos(0.46);
    const sp = Math.sin(0.46);
    const S = Math.min(W, H) * 0.27;

    function P(x: number, y: number, z: number): ProjPoint {
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const x1 = x * cyw - z * syw;
      const z1 = x * syw + z * cyw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const f = 1 / (1 + z2 * 0.26);
      return { x: cx + x1 * S * f, y: cy + y1 * S * f, z: z2, f };
    }

    // hologram flicker
    let ga = 0.86 + 0.14 * Math.sin(t * 37 + Math.sin(t * 9) * 4);

    if (rnd(Math.floor(t * 6) + 3) > 0.94) {
      ga *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = ga;

    // light cone rising from emitter pad
    const pad = P(0, 0.62, 0);
    const cone = ctx.createLinearGradient(0, pad.y, 0, cy - S * 0.9);
    cone.addColorStop(0, hexToRgba(acc, 0.1));
    cone.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(pad.x - S * 1.5, pad.y);
    ctx.lineTo(cx - S * 0.6, cy - S * 0.9);
    ctx.lineTo(cx + S * 0.6, cy - S * 0.9);
    ctx.lineTo(pad.x + S * 1.5, pad.y);
    ctx.closePath();
    ctx.fill();

    // emitter pad rings
    function ring(
      r: number,
      y: number,
      alpha: number,
      lw?: number,
      dash?: number[],
      rot?: number,
      colr?: string,
    ): void {
      ctx.strokeStyle = hexToRgba(colr ?? acc, alpha);
      ctx.lineWidth = lw ?? 1;

      if (dash) {
        ctx.setLineDash(dash);
      }

      ctx.beginPath();

      for (let k2 = 0; k2 <= 60; k2++) {
        const an = (k2 / 60) * 6.283 + (rot ?? 0);
        const p = P(Math.cos(an) * r, y, Math.sin(an) * r);

        if (k2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    ring(1.62, 0.62, 0.5, 1.6);
    ring(1.5, 0.62, 0.22, 1);
    ring(1.74, 0.62, 0.16, 1, [3, 6], -t * 0.6);

    for (let i = 0; i < 48; i++) {
      const an = (i / 48) * 6.283 + t * 0.25;
      const p1 = P(Math.cos(an) * 1.52, 0.62, Math.sin(an) * 1.52);
      const p2 = P(Math.cos(an) * 1.6, 0.62, Math.sin(an) * 1.6);
      ctx.strokeStyle = hexToRgba(acc, i % 4 === 0 ? 0.5 : 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // ground grid expands from centre
    const gk = ease((prog - 0.04) / 0.3);

    if (gk > 0) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexToRgba(acc, 0.14 * gk);

      for (let gx = 0; gx < GRID_SIZE; gx++) {
        ctx.beginPath();

        for (let gz = 0; gz < GRID_SIZE; gz++) {
          const col = cols[gx * GRID_SIZE + gz];
          const p = P(col.nx * gk, 0.62, col.nz * gk);

          if (gz === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }

        ctx.stroke();
      }

      for (let gz = 0; gz < GRID_SIZE; gz++) {
        ctx.beginPath();

        for (let gx = 0; gx < GRID_SIZE; gx++) {
          const col = cols[gx * GRID_SIZE + gz];
          const p = P(col.nx * gk, 0.62, col.nz * gk);

          if (gx === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }

        ctx.stroke();
      }
    }

    // market columns assemble from particle scatter (far → near)
    const order = cols
      .map((col) => {
        return { col, p: P(col.nx, 0.62, col.nz) };
      })
      .sort((a, b) => {
        return b.p.z - a.p.z;
      });

    order.forEach((o) => {
      const col = o.col;
      const k = ease(clamp((prog * 1.5 - 0.18 - col.d * 0.6) / 0.3));

      if (k <= 0) {
        return;
      }

      const hh = col.h * (0.88 + 0.12 * Math.sin(t * 1.7 + col.ph));
      const hot = col.h > 0.75;

      if (k < 1) {
        const u = k;
        const p = P(
          col.sx + (col.nx - col.sx) * u,
          col.sy + (0.62 - hh - col.sy) * u,
          col.sz + (col.nz - col.sz) * u,
        );
        ctx.fillStyle = hexToRgba(hot ? ac2 : acc, 0.35 + 0.5 * u);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 * p.f + 1, 0, 6.283);
        ctx.fill();
      }

      const rise = clamp((k - 0.55) / 0.45);

      if (rise <= 0) {
        return;
      }

      const b = o.p;
      const tp = P(col.nx, 0.62 - hh * rise, col.nz);
      const nearness = clamp((0.9 - b.z) / 1.8);
      const al = 0.15 + 0.55 * nearness;
      ctx.strokeStyle = hexToRgba(hot ? ac2 : acc, al);
      ctx.lineWidth = Math.max(1, 2.2 * b.f);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();
      const ms = Math.max(1.4, 2.6 * tp.f);
      ctx.fillStyle = hexToRgba(hot ? ac2 : acc, Math.min(0.9, al + 0.25));
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y - ms);
      ctx.lineTo(tp.x + ms, tp.y);
      ctx.lineTo(tp.x, tp.y + ms);
      ctx.lineTo(tp.x - ms, tp.y);
      ctx.closePath();
      ctx.fill();
    });

    // vertical scan ring sweeping up through the structure
    const sy2 = 0.62 - ((t * 0.45) % 1) * 1.35;
    ctx.strokeStyle = hexToRgba(ac2, 0.38);
    ctx.lineWidth = 1.4;
    ctx.beginPath();

    for (let k2 = 0; k2 <= 60; k2++) {
      const an = (k2 / 60) * 6.283;
      const p = P(Math.cos(an) * 1.28, sy2, Math.sin(an) * 1.28);

      if (k2 === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.stroke();

    // gyroscopic segmented rings
    function gyro(
      r: number,
      tilt: number,
      spin: number,
      colr: string,
      alpha: number,
      lw: number,
    ): void {
      const ct2 = Math.cos(tilt);
      const st2 = Math.sin(tilt);
      const cs2 = Math.cos(spin);
      const ss2 = Math.sin(spin);
      ctx.strokeStyle = hexToRgba(colr, alpha);
      ctx.lineWidth = lw;

      for (let seg = 0; seg < 8; seg++) {
        if (seg % 4 === 3) {
          continue;
        }

        ctx.beginPath();

        for (let k2 = 0; k2 <= 10; k2++) {
          const an = ((seg * 10 + k2) / 80) * 6.283;
          const x = Math.cos(an) * r;
          const z = Math.sin(an) * r;
          const y2 = -z * st2;
          const z2 = z * ct2;
          const x3 = x * cs2 - y2 * ss2;
          const y3 = x * ss2 + y2 * cs2;
          const p = P(x3, y3 + 0.02, z2);

          if (k2 === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }

        ctx.stroke();
      }
    }

    const rk = ease((prog - 0.35) / 0.3);

    if (rk > 0) {
      ctx.save();
      ctx.globalAlpha = ga * rk;
      gyro(1.9, 1.05, t * 0.7, acc, 0.5, 1.3);
      gyro(2.05, -0.9, -t * 0.5, ac2, 0.32, 1);
      ctx.restore();
    }

    // dust motes rising in the cone
    motes.forEach((m) => {
      const u = (t * m.s + m.o) % 1;
      const p = P(
        Math.cos(m.a + t * 0.2) * m.r,
        0.62 - u * 1.3,
        Math.sin(m.a + t * 0.2) * m.r,
      );
      ctx.fillStyle = hexToRgba(acc, 0.35 * (1 - u));
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    });

    // floating callout panels with leader lines
    tags.forEach((tg, ti) => {
      const kk = ease(clamp((prog - tg.t0) / 0.12));

      if (kk <= 0) {
        return;
      }

      const col = cols[tg.i];
      const hh = col.h * (0.88 + 0.12 * Math.sin(t * 1.7 + col.ph));
      const p = P(col.nx, 0.62 - hh, col.nz);
      const bx = [cx - S * 2.55, cx + S * 1.55, cx + S * 1.75][ti];
      const by = [cy - S * 1.0, cy - S * 1.2, cy + S * 0.35][ti];
      ctx.globalAlpha = ga * kk;
      ctx.fillStyle = hexToRgba(ac2, 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(acc, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(bx + 58, by + (by < cy ? 50 : -6));
      ctx.stroke();
      ctx.fillStyle = "rgba(0,10,16,0.65)";
      ctx.fillRect(bx, by, 116, 44);
      ctx.strokeStyle = hexToRgba(acc, 0.5);
      ctx.strokeRect(bx, by, 116, 44);
      ctx.strokeStyle = hexToRgba(ac2, 0.8);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by + 10);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 10, by);
      ctx.stroke();
      ctx.font = `8px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = hexToRgba(ac2, 0.85);
      ctx.fillText(tg.label, bx + 9, by + 15);
      ctx.font = `bold 13px ${MONO}`;
      ctx.fillStyle = hexToRgba(acc, 0.95);
      ctx.fillText(tg.v, bx + 9, by + 33);
      ctx.globalAlpha = ga;
    });

    // corner telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(acc, 0.7);
    ctx.fillText("◉ HOLO-PROJ 01 · VOLUMETRIC", 20, 28);
    ctx.fillText(`PARTICLES ${Math.round(6480 * prog)} / 6480`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, W - 20, 28);
    ctx.fillStyle = hexToRgba(ac2, 0.7);
    ctx.fillText(`ASSEMBLY ${Math.round(prog * 100)}%`, W - 20, 44);

    let stt = "COMPILING MARKET HOLOGRAM";
    let sc = acc;

    if (prog >= 0.5 && prog < 0.82) {
      stt = "RESOLVING DEPTH FIELD";
    } else if (prog >= 0.82) {
      stt = "STRUCTURE STABLE ▸ HANDOFF";
      sc = ac2;
    }

    const bk = prog < 0.82 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(sc, 0.9 * bk);
    ctx.fillText(`▸ ${stt} ◂`, cx, cy - S * 1.42);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
