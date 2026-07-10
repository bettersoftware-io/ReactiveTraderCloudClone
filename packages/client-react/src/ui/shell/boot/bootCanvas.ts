// Pure per-frame canvas draw functions — ported verbatim from prototype
// (Reactive Trader.dc.html:819, 852-1045). No React, no DOM-owning state,
// no requestAnimationFrame (the rAF loop lives in BootSequence.tsx).

const BOOT_DURATION_MS = 4200;

/** Projected point in 3D globe rendering */
interface Projected {
  x: number;
  y: number;
  z: number;
}

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
}

/** hexToRgba — verbatim from prototype line 819 */
function hexToRgba(hex: string, a: number): string {
  let h = hex.replace("#", "");

  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => {
        return c + c;
      })
      .join("");
  }

  const n = parseInt(h, 16);
  return (
    "rgba(" +
    ((n >> 16) & 255) +
    "," +
    ((n >> 8) & 255) +
    "," +
    (n & 255) +
    "," +
    a +
    ")"
  );
}

/**
 * Cubic ease-out used by laser and docking variants.
 * Verbatim from prototype (both _drawBootLaser and _drawBootDocking).
 */
function ease(k: number): number {
  return 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
}

/** Zero-pad a number to two digits. Verbatim from prototype _drawBootDocking. */
function pad2(n: number): string {
  return String(Math.abs(Math.floor(n))).padStart(2, "0");
}

/**
 * drawBootCore — verbatim inner draw() from prototype _drawBoot (lines 857-872).
 * Draws one frame of the spinning globe boot animation.
 */
export function drawBootCore(d: BootDrawCtx): void {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const lat: number[] = [];
  const lon: number[] = [];

  for (let a = -80; a <= 80; a += 20) {
    lat.push((a * Math.PI) / 180);
  }

  for (let b = 0; b < 360; b += 20) {
    lon.push((b * Math.PI) / 180);
  }

  if (c.width !== c.offsetWidth) {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  const t = (performance.now() - d.start) / 1000;
  const prog = Math.min(1, (performance.now() - d.start) / BOOT_DURATION_MS);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, c.width, c.height);
  const cx = c.width / 2;
  const cy = c.height / 2 - 30;
  const R = Math.min(c.width, c.height) * 0.18 * Math.min(1, prog * 1.6 + 0.2);
  const yaw = t * 0.7;
  const pitch = 0.5;

  function proj(la: number, lo: number): Projected {
    const px = Math.cos(la) * Math.cos(lo);
    const py = Math.sin(la);
    const pz = Math.cos(la) * Math.sin(lo);
    const x2 = px * Math.cos(yaw) - pz * Math.sin(yaw);
    const z2 = px * Math.sin(yaw) + pz * Math.cos(yaw);
    const y2 = py * Math.cos(pitch) - z2 * Math.sin(pitch);
    const z3 = py * Math.sin(pitch) + z2 * Math.cos(pitch);
    return { x: cx + x2 * R, y: cy + y2 * R, z: z3 };
  }

  ctx.lineWidth = 1;

  for (let i = 0; i < lat.length; i++) {
    ctx.beginPath();

    for (let j = 0; j <= lon.length; j++) {
      const p = proj(lat[i], lon[j % lon.length]);
      const alpha = 0.15 + 0.5 * ((p.z + 1) / 2);
      ctx.strokeStyle = hexToRgba(acc, alpha);

      if (j === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.stroke();
  }

  for (let j = 0; j < lon.length; j += 1) {
    ctx.beginPath();

    for (let i = 0; i < lat.length; i++) {
      const p = proj(lat[i], lon[j]);
      const alpha = 0.12 + 0.45 * ((p.z + 1) / 2);
      ctx.strokeStyle = hexToRgba(acc, alpha);

      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.stroke();
  }

  for (let r = 0; r < 3; r++) {
    const rad = R * 1.5 + ((t * 60 + r * 70) % 200);
    ctx.beginPath();
    ctx.strokeStyle = hexToRgba(
      acc,
      Math.max(0, 0.4 - ((rad - R * 1.5) / 200) * 0.4),
    );
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(acc, 0.25);
  ctx.beginPath();
  ctx.moveTo(cx - c.width, cy);
  ctx.lineTo(cx + c.width, cy);
  ctx.moveTo(cx, cy - c.height);
  ctx.lineTo(cx, cy + c.height);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(acc, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.35, t * 2, t * 2 + 1.2);
  ctx.stroke();
}

/**
 * drawBootLaser — verbatim inner draw() from prototype _drawBootLaser (lines 888-921)
 * plus _bootContent (lines 1038-1045), inlined as a local helper.
 * Draws one frame of the UI-draw-in laser animation.
 */
export function drawBootLaser(d: BootDrawCtx): void {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;

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

  function bootContent(
    bCtx: CanvasRenderingContext2D,
    p: LaserPanel,
    r: Rect,
    bAcc: string,
    bAc2: string,
  ): void {
    const pad = Math.min(r.w, r.h) * 0.11;
    const x = r.x + pad;
    const y = r.y + pad;
    const w = r.w - pad * 2;
    const h = r.h - pad * 2;

    if (p.kind === "header") {
      for (let i = 0; i < 4; i++) {
        bCtx.fillStyle = hexToRgba(i === 0 ? bAc2 : bAcc, 0.55);
        bCtx.fillRect(x + i * 72, y + h * 0.3, 54, h * 0.4);
      }
    } else if (p.kind === "main") {
      const tw = (w - 14) / 2;
      const tht = (h - 14) / 2;

      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const bx = x + i * (tw + 14);
          const by = y + j * (tht + 14);
          bCtx.strokeStyle = hexToRgba(bAcc, 0.5);
          bCtx.lineWidth = 1;
          bCtx.strokeRect(bx, by, tw, tht);
          bCtx.fillStyle = hexToRgba(bAcc, 0.16);
          bCtx.fillRect(bx, by, tw, tht * 0.34);
          bCtx.strokeStyle = hexToRgba(bAc2, 0.7);
          bCtx.lineWidth = 1.4;
          bCtx.beginPath();

          for (let s = 0; s <= 12; s++) {
            const sx = bx + 6 + ((tw - 12) * s) / 12;
            const sy =
              by + tht * 0.78 - Math.sin(s * 0.8 + i * 2 + j) * tht * 0.13;

            if (s === 0) {
              bCtx.moveTo(sx, sy);
            } else {
              bCtx.lineTo(sx, sy);
            }
          }

          bCtx.stroke();
        }
      }
    } else if (p.kind === "list") {
      const rows = 4;
      const rh = h / rows;

      for (let i = 0; i < rows; i++) {
        bCtx.fillStyle = hexToRgba(bAcc, 0.42 - i * 0.06);
        bCtx.fillRect(
          x,
          y + i * rh + rh * 0.25,
          w * (0.92 - i * 0.14),
          rh * 0.4,
        );
      }
    } else if (p.kind === "blotter") {
      const rows = 4;
      const rh = h / rows;
      bCtx.fillStyle = hexToRgba(bAc2, 0.5);
      bCtx.fillRect(x, y, w, rh * 0.45);

      for (let i = 1; i < rows; i++) {
        bCtx.strokeStyle = hexToRgba(bAcc, 0.3);
        bCtx.beginPath();
        bCtx.moveTo(x, y + i * rh);
        bCtx.lineTo(x + w, y + i * rh);
        bCtx.stroke();

        for (let cI = 0; cI < 5; cI++) {
          bCtx.fillStyle = hexToRgba(bAcc, 0.3);
          bCtx.fillRect(
            x + cI * (w / 5) + 5,
            y + i * rh + rh * 0.3,
            (w / 5) * 0.6,
            rh * 0.34,
          );
        }
      }
    } else if (p.kind === "status") {
      for (let i = 0; i < 9; i++) {
        bCtx.fillStyle = hexToRgba(i % 3 === 0 ? bAc2 : bAcc, 0.5);
        bCtx.fillRect(x + i * (w / 9), y + h * 0.3, (w / 9) * 0.55, h * 0.4);
      }
    }
  }

  if (c.width !== c.offsetWidth) {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  const prog = Math.min(1, (performance.now() - d.start) / BOOT_DURATION_MS);
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = hexToRgba(acc, 0.045);
  ctx.lineWidth = 1;

  for (let x = 0; x < W; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  for (let y = 0; y < H; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  function toRect(p: PanelNorm): Rect {
    return {
      x: p.nx * W,
      y: p.ny * H,
      w: p.nw * W,
      h: p.nh * H,
    };
  }

  let head: HeadPos | null = null;
  panels.forEach((p) => {
    const r = toRect(p);
    const frac = Math.max(0, Math.min(1, (prog - p.t0) / (p.t1 - p.t0)));

    if (frac <= 0) {
      return;
    }

    const segs: [number, number, number, number][] = [
      [r.x, r.y, r.x + r.w, r.y],
      [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
      [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
      [r.x, r.y + r.h, r.x, r.y],
    ];
    const lens = segs.map((s) => {
      return Math.hypot(s[2] - s[0], s[3] - s[1]);
    });
    const P = lens.reduce((a, b) => {
      return a + b;
    }, 0);
    let target = frac * P;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.shadowColor = acc;
    ctx.shadowBlur = frac < 1 ? 16 : 7;
    ctx.strokeStyle = hexToRgba(acc, frac < 1 ? 0.98 : 0.62);
    ctx.beginPath();
    ctx.moveTo(segs[0][0], segs[0][1]);
    let hx = segs[0][0];
    let hy = segs[0][1];

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];

      if (target >= lens[i]) {
        ctx.lineTo(s[2], s[3]);
        hx = s[2];
        hy = s[3];
        target -= lens[i];
      } else {
        const u = lens[i] ? target / lens[i] : 0;
        hx = s[0] + (s[2] - s[0]) * u;
        hy = s[1] + (s[3] - s[1]) * u;
        ctx.lineTo(hx, hy);
        target = 0;
        break;
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    if (frac < 1) {
      head = { x: hx, y: hy };
    }

    if (prog >= p.t1 && prog < p.t1 + 0.07) {
      const fa = 1 - (prog - p.t1) / 0.07;
      ctx.fillStyle = hexToRgba(acc, 0.2 * fa);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    if (frac > 0.985) {
      ctx.strokeStyle = hexToRgba(ac2, 0.85);
      ctx.lineWidth = 1.4;
      const tk = 8;
      (
        [
          [r.x, r.y, 1, 1],
          [r.x + r.w, r.y, -1, 1],
          [r.x, r.y + r.h, 1, -1],
          [r.x + r.w, r.y + r.h, -1, -1],
        ] as [number, number, number, number][]
      ).forEach((q) => {
        ctx.beginPath();
        ctx.moveTo(q[0], q[1] + q[3] * tk);
        ctx.lineTo(q[0], q[1]);
        ctx.lineTo(q[0] + q[2] * tk, q[1]);
        ctx.stroke();
      });
    }

    const cs = p.t1;
    const ce = Math.min(1, p.t1 + 0.24);
    const k = ease((prog - cs) / (ce - cs));

    if (k > 0) {
      const cxp = r.x + r.w / 2;
      const cyp = r.y + r.h / 2;
      const sc = 0.32 + 0.68 * k;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(cxp, cyp);
      ctx.scale(sc, sc);
      ctx.translate(-cxp, -cyp);
      bootContent(ctx, p, r, acc, ac2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  });

  if (head !== null) {
    const hd = head as HeadPos;
    const ex = W * 0.5;
    const ey = -24;
    ctx.strokeStyle = hexToRgba(ac2, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(hd.x, hd.y);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(acc, 0.45);
    ctx.shadowColor = acc;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(hd.x, hd.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(hd.x, hd.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/**
 * drawBootDocking — verbatim inner draw() from prototype _drawBootDocking (lines 931-1036).
 * Draws one frame of the docking-HUD boot animation.
 */
export function drawBootDocking(d: BootDrawCtx): void {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;

  const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

  if (c.width !== c.offsetWidth) {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  const t = (performance.now() - d.start) / 1000;
  const prog = Math.min(1, (performance.now() - d.start) / BOOT_DURATION_MS);
  const W = c.width;
  const H = c.height;
  const cx = W / 2;
  const cy = H / 2;
  const E = ease(prog);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,2,4,0.64)";
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(W, H) * 0.18,
    cx,
    cy,
    Math.max(W, H) * 0.62,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = hexToRgba(acc, 0.035);

  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }

  const shake = (1 - E) * 1.0 + 0.22;
  const jx = (Math.sin(t * 9) * 1.4 + Math.sin(t * 17) * 0.7) * shake;
  const jy = (Math.cos(t * 7) * 1.1 + Math.sin(t * 23) * 0.5) * shake;
  ctx.save();
  ctx.translate(jx, jy);
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(acc, 0.1);

  for (let i = -6; i <= 6; i++) {
    const ex = cx + i * (W / 12);
    ctx.beginPath();
    ctx.moveTo(ex, 0);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, H);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }

  for (let i = -4; i <= 4; i++) {
    const ey = cy + i * (H / 8);
    ctx.beginPath();
    ctx.moveTo(0, ey);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W, ey);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(ac2, 0.16);

  for (let r = 1; r <= 5; r++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * Math.min(W, H) * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
  ctx.strokeStyle = hexToRgba(acc, 0.06);
  ctx.lineWidth = 1;
  const gs = Math.round(W / 16);

  for (let x = 0; x <= W; x += gs) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  for (let y = 0; y <= H; y += gs) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const wob = 1 - E;
  const tgx = cx + jx + Math.sin(t * 1.3) * 6 * wob;
  const tgy = cy + jy + Math.cos(t * 1.1) * 5 * wob;
  const craftR = 12 + E * 92;
  const R0 = craftR;
  ctx.save();
  ctx.translate(tgx, tgy);
  ctx.fillStyle = "rgba(8,16,22,0.5)";
  ctx.fillRect(-R0 * 3.6, -R0 * 1.6, R0 * 7.2, R0 * 3.2);
  ctx.strokeStyle = hexToRgba(acc, 0.12);
  ctx.lineWidth = 1;

  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * R0 * 1.15, -R0 * 1.6);
    ctx.lineTo(i * R0 * 1.15, R0 * 1.6);
    ctx.stroke();
  }

  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-R0 * 3.6, i * R0 * 0.95);
    ctx.lineTo(R0 * 3.6, i * R0 * 0.95);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(acc, 0.18);
  ctx.strokeRect(-R0 * 3.4, -R0 * 0.55, R0 * 0.95, R0 * 1.1);
  ctx.strokeRect(R0 * 2.45, -R0 * 0.55, R0 * 0.95, R0 * 1.1);
  ctx.restore();
  ctx.save();
  ctx.translate(tgx, tgy);
  ctx.rotate(Math.sin(t * 0.2) * 0.05);
  ctx.strokeStyle = hexToRgba(acc, 0.85);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 1.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(acc, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 1.34, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r1 = R0 * 1.15;
    const r2 = R0 * (i % 3 === 0 ? 1.32 : 1.24);
    ctx.strokeStyle = hexToRgba(acc, i % 3 === 0 ? 0.6 : 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(acc, 0.6);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.84, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillStyle = hexToRgba(acc, 0.5);
    ctx.beginPath();
    ctx.arc(
      Math.cos(a) * R0 * 0.84,
      Math.sin(a) * R0 * 0.84,
      R0 * 0.045,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.fillStyle = hexToRgba(ac2, 0.1);
  ctx.strokeStyle = hexToRgba(ac2, 0.55);
  ctx.lineWidth = 1.4;

  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-R0 * 0.22, -R0 * 0.64);
    ctx.lineTo(R0 * 0.22, -R0 * 0.64);
    ctx.lineTo(R0 * 0.12, -R0 * 0.34);
    ctx.lineTo(-R0 * 0.12, -R0 * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = hexToRgba(acc, 0.7);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(acc, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.28, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.strokeStyle = hexToRgba(acc, 0.4);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R0 * 0.28, Math.sin(a) * R0 * 0.28);
    ctx.lineTo(Math.cos(a) * R0 * 0.5, Math.sin(a) * R0 * 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = hexToRgba(ac2, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const misx = -W * 0.05 * wob + Math.sin(t * 1.1) * R0 * 0.5 * wob;
  const misy = -H * 0.05 * wob + Math.cos(t * 0.9) * R0 * 0.45 * wob;
  ctx.save();
  ctx.translate(tgx + misx, tgy + misy);
  ctx.strokeStyle = hexToRgba(d.buy, 0.9);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -R0 * 0.26);
  ctx.lineTo(0, R0 * 0.26);
  ctx.moveTo(-R0 * 0.26, 0);
  ctx.lineTo(R0 * 0.26, 0);
  ctx.stroke();
  ctx.restore();
  const RR = Math.min(W, H) * 0.36;
  const rng = Math.max(0, Math.round(4820 * (1 - E)));
  ctx.strokeStyle = hexToRgba(acc, 0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, RR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(acc, 0.2);
  ctx.beginPath();
  ctx.arc(cx, cy, RR + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hexToRgba(d.buy, 0.85);
  ctx.fillText(
    `${(Math.sin(t * 0.6) * 3.1 * wob).toFixed(1)}°`,
    cx - RR + 20,
    cy - 14,
  );
  ctx.fillText(
    `${(Math.cos(t * 0.5) * 2.3 * wob).toFixed(1)}°`,
    cx - RR + 20,
    cy,
  );
  ctx.fillText(
    `${(Math.sin(t * 0.4) * 0.6 * wob).toFixed(1)}°`,
    cx - RR + 20,
    cy + 14,
  );
  ctx.save();
  ctx.translate(cx - RR + 8, cy);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = hexToRgba(acc, 0.5);
  ctx.textAlign = "center";
  ctx.fillText("P Y R", 0, 0);
  ctx.restore();
  ctx.textAlign = "right";
  ctx.fillStyle = hexToRgba(d.buy, 0.85);
  ctx.fillText(
    `${(Math.sin(t * 0.5) * 0.1).toFixed(1)}°`,
    cx + RR - 18,
    cy - 8,
  );
  ctx.fillStyle = hexToRgba(ac2, 0.7);
  ctx.fillText(
    `${(Math.sin(t * 0.7) * 0.6 * wob).toFixed(1)}°/m`,
    cx + RR - 18,
    cy + 8,
  );
  ctx.save();
  ctx.translate(cx + RR - 6, cy);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = hexToRgba(acc, 0.5);
  ctx.textAlign = "center";
  ctx.fillText("P I T C H", 0, 0);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = hexToRgba(acc, 0.5);
  ctx.font = `9px ${MONO}`;
  ctx.fillText("RANGE", cx - RR * 0.42, cy + RR - 28);
  ctx.fillText("RANGE RATE", cx + RR * 0.42, cy + RR - 28);
  ctx.fillStyle = hexToRgba(acc, 0.95);
  ctx.font = `bold 18px ${MONO}`;
  ctx.fillText(`${rng} m`, cx - RR * 0.42, cy + RR - 9);
  ctx.fillStyle = hexToRgba(ac2, 0.95);
  ctx.fillText(
    `-0.${pad2(34 - Math.round(prog * 6))} m/s`,
    cx + RR * 0.42,
    cy + RR - 9,
  );
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const lock = ease(Math.min(1, (prog - 0.18) / 0.5));
  const acq = prog < 0.25;
  const box = craftR * 1.45 + (1 - lock) * Math.min(W, H) * 0.18;
  const blink = acq ? 0.4 + 0.6 * Math.abs(Math.sin(t * 9)) : 1;
  const lc = prog > 0.55 ? ac2 : acc;
  ctx.strokeStyle = hexToRgba(lc, 0.92 * blink);
  ctx.lineWidth = 1.8;
  const tk = Math.max(10, box * 0.22);
  (
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as [number, number][]
  ).forEach((q) => {
    const qx = tgx + q[0] * box;
    const qy = tgy + q[1] * box;
    ctx.beginPath();
    ctx.moveTo(qx, qy - q[1] * tk);
    ctx.lineTo(qx, qy);
    ctx.lineTo(qx - q[0] * tk, qy);
    ctx.stroke();
  });

  if (prog < 0.6) {
    ctx.save();
    ctx.translate(tgx, tgy);
    ctx.rotate(t * 1.4);
    ctx.strokeStyle = hexToRgba(acc, 0.5 * blink);
    ctx.setLineDash([8, 7]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, box * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.strokeStyle = hexToRgba(lc, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tgx + box, tgy - box);
  ctx.lineTo(tgx + box + 34, tgy - box - 24);
  ctx.lineTo(tgx + box + 200, tgy - box - 24);
  ctx.stroke();
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = hexToRgba(lc, 0.9);
  ctx.fillText("AC-417 ▸ EUR/USD ESCORT", tgx + box + 40, tgy - box - 28);
  ctx.strokeStyle = hexToRgba(ac2, 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(tgx, tgy);
  ctx.lineTo(tgx + (cx - tgx) * 0.5, tgy + (cy - tgy) * 0.5);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(acc, 0.6);
  ctx.lineWidth = 1.4;
  const gp = 14;
  ctx.beginPath();
  ctx.moveTo(cx - 46, cy);
  ctx.lineTo(cx - gp, cy);
  ctx.moveTo(cx + gp, cy);
  ctx.lineTo(cx + 46, cy);
  ctx.moveTo(cx, cy - 46);
  ctx.lineTo(cx, cy - gp);
  ctx.moveTo(cx, cy + gp);
  ctx.lineTo(cx, cy + 46);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(acc, 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 0.8) * 10);
  ctx.strokeStyle = hexToRgba(acc, 0.22);
  ctx.fillStyle = hexToRgba(acc, 0.4);
  ctx.font = `9px ${MONO}`;
  ctx.lineWidth = 1;

  for (let p = -2; p <= 2; p++) {
    if (p === 0) {
      continue;
    }

    const yy = p * 46;
    ctx.beginPath();
    ctx.moveTo(-72, yy);
    ctx.lineTo(-32, yy);
    ctx.moveTo(32, yy);
    ctx.lineTo(72, yy);
    ctx.stroke();
    ctx.fillText(pad2(p * 5), -92, yy + 3);
  }

  ctx.restore();
  const ssy = ((t * 0.35) % 1) * H;
  const sg = ctx.createLinearGradient(0, ssy - 30, 0, ssy + 30);
  sg.addColorStop(0, "rgba(0,0,0,0)");
  sg.addColorStop(0.5, hexToRgba(ac2, 0.1));
  sg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, ssy - 30, W, 60);
  const range = Math.max(0, Math.round(4820 * (1 - E)));
  const closure = Math.max(
    0,
    Math.round((58 + 22 * Math.sin(t * 2)) * (1 - prog) + 3),
  );
  const bearing = (271.4 + Math.sin(t * 0.7) * 0.6).toFixed(1);
  const az = (Math.sin(t * 0.9) * 2.4 * wob).toFixed(2);
  const el = (Math.cos(t * 0.8) * 1.8 * wob).toFixed(2);
  const dX = (((tgx - cx) / W) * 100).toFixed(2);
  const dY = (((tgy - cy) / H) * 100).toFixed(2);
  const dZ = (range / 100).toFixed(2);
  const tc = `${pad2(t / 60)}:${pad2(t % 60)}:${pad2((t * 100) % 100)}`;

  function lbl(x: number, y: number, a: string[], col?: string): void {
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = hexToRgba(col ?? acc, 0.85);
    a.forEach((ln, i) => {
      ctx.fillText(ln, x, y + i * 15);
    });
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  lbl(20, 28, ["◉ CAM-04  DOCK BAY 07", "GIMBAL TRACK · AUTO", `TC ${tc}`]);
  ctx.fillStyle = hexToRgba(d.sell, 0.9);
  ctx.font = `11px ${MONO}`;
  ctx.fillText("● REC", 20, 73);
  ctx.textAlign = "right";
  lbl(W - 20, 28, [
    `RANGE   ${range} m`,
    `CLOSURE ${closure} m/s`,
    `BEARING ${bearing}°`,
  ]);
  lbl(W - 20, 73, [`AZ ${az}   EL ${el}`], ac2);
  lbl(W - 20, H - 58, ["LINK  SECURE · AES-256", "AUTH  OK ▸ TRD-0042"], ac2);
  ctx.textAlign = "left";
  lbl(20, H - 58, [
    `ALIGN  dX ${dX}  dY ${dY}`,
    `       dZ ${dZ}  ROLL ${(Math.sin(t * 1.7) * 1.2).toFixed(1)}`,
    `THRUST ${Math.round(8 + 12 * (1 - prog))}%   MASS 42.6t`,
  ]);
  const bars = 5;

  for (let i = 0; i < bars; i++) {
    const on = i < 3 + Math.round(1.4 * Math.sin(t * 4 + i) + 1.2);
    ctx.fillStyle = hexToRgba(on ? ac2 : acc, on ? 0.85 : 0.2);
    ctx.fillRect(W - 20 - (bars - i) * 9, H - 26, 6, 4 + i * 3);
  }

  let stt = "ACQUIRING";
  let sc = acc;

  if (prog >= 0.25 && prog < 0.55) {
    stt = "TRACKING";
    sc = acc;
  } else if (prog >= 0.55 && prog < 0.8) {
    stt = "TARGET LOCKED";
    sc = ac2;
  } else if (prog >= 0.8 && prog < 0.96) {
    stt = "DOCKING SEQUENCE";
    sc = ac2;
  } else if (prog >= 0.96) {
    stt = "CLAMP ENGAGED";
    sc = d.buy;
  }

  const bk = stt === "ACQUIRING" ? 0.45 + 0.55 * Math.abs(Math.sin(t * 7)) : 1;
  ctx.font = `bold 13px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillStyle = hexToRgba(sc, 0.95 * bk);
  ctx.fillText(`▸ ${stt} ◂`, cx, cy - 66);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (prog > 0.92) {
    const fa = (prog - 0.92) / 0.08;
    const fg = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      Math.max(W, H) * 0.5,
    );
    fg.addColorStop(0, hexToRgba("#ffffff", 0.4 * fa));
    fg.addColorStop(0.35, hexToRgba(ac2, 0.3 * fa));
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
  }
}
