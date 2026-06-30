export type BootVariant = "globe" | "laser" | "docking";

export interface BootFrame {
  /** Elapsed time in ms since boot start. */
  t: number;
  /** Total boot duration in ms (for prog = t/dur). */
  dur: number;
  w: number;
  h: number;
  accent: string;
  accent2: string;
  /** Green "go" HUD colour (docking variant only). */
  buy: string;
  /** Red "stop" HUD colour (docking variant only). */
  sell: string;
}

/** Projected globe vertex; z is the depth used for per-line alpha. */
interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
}

/** A laser panel descriptor (normalised geometry + reveal window). */
interface BootPanel {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  t0: number;
  t1: number;
  kind: string;
}

/** A laser panel resolved to absolute pixel geometry. */
interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A 2D point (the laser draw head). */
interface Point2D {
  x: number;
  y: number;
}

// Ported verbatim from .dc.html line 836.
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

  const n = Number.parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Cubic ease-out (.dc.html: const ease=(k)=>1-Math.pow(1-clamp,3)).
function ease(k: number): number {
  return 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
}

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

// Zero-padded |floor(n)| (.dc.html: pad2 helper in _drawBootDocking).
function pad2(n: number): string {
  return String(Math.abs(Math.floor(n))).padStart(2, "0");
}

// One-time panel list hoisted from _drawBootLaser's setup (.dc.html 947–954).
const LASER_PANELS: BootPanel[] = [
  {
    nx: 0.055,
    ny: 0.045,
    nw: 0.89,
    nh: 0.075,
    t0: 0.0,
    t1: 0.1,
    kind: "header",
  },
  { nx: 0.055, ny: 0.155, nw: 0.56, nh: 0.5, t0: 0.09, t1: 0.32, kind: "main" },
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

// ---------------------------------------------------------------------------
// Globe — per-frame body of _drawBoot's inner draw() (.dc.html 924–939).
// ---------------------------------------------------------------------------
export function drawGlobe(
  ctx: CanvasRenderingContext2D,
  frame: BootFrame,
): void {
  const { w, h, accent } = frame;
  const t = frame.t / 1000;
  const prog = Math.min(1, frame.t / frame.dur);

  // Tiny lat/lon grids — cheap to rebuild per frame (was one-time setup).
  const lat: number[] = [];
  const lon: number[] = [];

  for (let a = -80; a <= 80; a += 20) {
    lat.push((a * Math.PI) / 180);
  }

  for (let b = 0; b < 360; b += 20) {
    lon.push((b * Math.PI) / 180);
  }

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 - 30;
  const R = Math.min(w, h) * 0.18 * Math.min(1, prog * 1.6 + 0.2);
  const yaw = t * 0.7;
  const pitch = 0.5;

  function proj(la: number, lo: number): ProjectedPoint {
    const x = Math.cos(la) * Math.cos(lo);
    const y = Math.sin(la);
    const z = Math.cos(la) * Math.sin(lo);
    const x2 = x * Math.cos(yaw) - z * Math.sin(yaw);
    const z2 = x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z2 * Math.sin(pitch);
    const z3 = y * Math.sin(pitch) + z2 * Math.cos(pitch);
    return { x: cx + x2 * R, y: cy + y2 * R, z: z3 };
  }

  ctx.lineWidth = 1;

  for (let i = 0; i < lat.length; i++) {
    ctx.beginPath();

    for (let j = 0; j <= lon.length; j++) {
      const p = proj(lat[i], lon[j % lon.length]);
      const a = 0.15 + 0.5 * ((p.z + 1) / 2);
      ctx.strokeStyle = hexToRgba(accent, a);

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
      const a = 0.12 + 0.45 * ((p.z + 1) / 2);
      ctx.strokeStyle = hexToRgba(accent, a);

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
      accent,
      Math.max(0, 0.4 - ((rad - R * 1.5) / 200) * 0.4),
    );
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(accent, 0.25);
  ctx.beginPath();
  ctx.moveTo(cx - w, cy);
  ctx.lineTo(cx + w, cy);
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx, cy + h);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.35, t * 2, t * 2 + 1.2);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Laser — per-frame body of _drawBootLaser's inner draw() (.dc.html 955–987).
// ---------------------------------------------------------------------------
export function drawLaser(
  ctx: CanvasRenderingContext2D,
  frame: BootFrame,
): void {
  const { accent, accent2 } = frame;
  const prog = Math.min(1, frame.t / frame.dur);
  const W = frame.w;
  const H = frame.h;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = hexToRgba(accent, 0.045);
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

  function rectOf(p: BootPanel): PanelRect {
    return { x: p.nx * W, y: p.ny * H, w: p.nw * W, h: p.nh * H };
  }

  let head: Point2D | null = null;

  for (const p of LASER_PANELS) {
    const r = rectOf(p);
    const frac = Math.max(0, Math.min(1, (prog - p.t0) / (p.t1 - p.t0)));

    if (frac <= 0) {
      continue;
    }

    const segs = [
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
    ctx.shadowColor = accent;
    ctx.shadowBlur = frac < 1 ? 16 : 7;
    ctx.strokeStyle = hexToRgba(accent, frac < 1 ? 0.98 : 0.62);
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
      ctx.fillStyle = hexToRgba(accent, 0.2 * fa);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    if (frac > 0.985) {
      ctx.strokeStyle = hexToRgba(accent2, 0.85);
      ctx.lineWidth = 1.4;
      const tk = 8;
      const corners = [
        [r.x, r.y, 1, 1],
        [r.x + r.w, r.y, -1, 1],
        [r.x, r.y + r.h, 1, -1],
        [r.x + r.w, r.y + r.h, -1, -1],
      ];

      for (const q of corners) {
        ctx.beginPath();
        ctx.moveTo(q[0], q[1] + q[3] * tk);
        ctx.lineTo(q[0], q[1]);
        ctx.lineTo(q[0] + q[2] * tk, q[1]);
        ctx.stroke();
      }
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
      drawPanelContent(ctx, p, r, accent, accent2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  if (head) {
    const ex = W * 0.5;
    const ey = -24;
    ctx.strokeStyle = hexToRgba(accent2, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(accent, 0.45);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// Per-panel schematic content — _bootContent (.dc.html 1105–1112).
function drawPanelContent(
  ctx: CanvasRenderingContext2D,
  p: BootPanel,
  r: PanelRect,
  accent: string,
  accent2: string,
): void {
  const pad = Math.min(r.w, r.h) * 0.11;
  const x = r.x + pad;
  const y = r.y + pad;
  const w = r.w - pad * 2;
  const h = r.h - pad * 2;

  if (p.kind === "header") {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = hexToRgba(i === 0 ? accent2 : accent, 0.55);
      ctx.fillRect(x + i * 72, y + h * 0.3, 54, h * 0.4);
    }
  } else if (p.kind === "main") {
    const tw = (w - 14) / 2;
    const tht = (h - 14) / 2;

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const bx = x + i * (tw + 14);
        const by = y + j * (tht + 14);
        ctx.strokeStyle = hexToRgba(accent, 0.5);
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, tw, tht);
        ctx.fillStyle = hexToRgba(accent, 0.16);
        ctx.fillRect(bx, by, tw, tht * 0.34);
        ctx.strokeStyle = hexToRgba(accent2, 0.7);
        ctx.lineWidth = 1.4;
        ctx.beginPath();

        for (let s = 0; s <= 12; s++) {
          const sx = bx + 6 + ((tw - 12) * s) / 12;
          const sy =
            by + tht * 0.78 - Math.sin(s * 0.8 + i * 2 + j) * tht * 0.13;

          if (s === 0) {
            ctx.moveTo(sx, sy);
          } else {
            ctx.lineTo(sx, sy);
          }
        }

        ctx.stroke();
      }
    }
  } else if (p.kind === "list") {
    const rows = 4;
    const rh = h / rows;

    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = hexToRgba(accent, 0.42 - i * 0.06);
      ctx.fillRect(x, y + i * rh + rh * 0.25, w * (0.92 - i * 0.14), rh * 0.4);
    }
  } else if (p.kind === "blotter") {
    const rows = 4;
    const rh = h / rows;
    ctx.fillStyle = hexToRgba(accent2, 0.5);
    ctx.fillRect(x, y, w, rh * 0.45);

    for (let i = 1; i < rows; i++) {
      ctx.strokeStyle = hexToRgba(accent, 0.3);
      ctx.beginPath();
      ctx.moveTo(x, y + i * rh);
      ctx.lineTo(x + w, y + i * rh);
      ctx.stroke();

      for (let cI = 0; cI < 5; cI++) {
        ctx.fillStyle = hexToRgba(accent, 0.3);
        ctx.fillRect(
          x + cI * (w / 5) + 5,
          y + i * rh + rh * 0.3,
          (w / 5) * 0.6,
          rh * 0.34,
        );
      }
    }
  } else if (p.kind === "status") {
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = hexToRgba(i % 3 === 0 ? accent2 : accent, 0.5);
      ctx.fillRect(x + i * (w / 9), y + h * 0.3, (w / 9) * 0.55, h * 0.4);
    }
  }
}

// ---------------------------------------------------------------------------
// Docking — per-frame body of _drawBootDocking's inner draw() (.dc.html 998–1102).
// Uses frame.buy (green go-cues) and frame.sell (red REC) faithfully to th.buy/th.sell.
// ---------------------------------------------------------------------------
export function drawDocking(
  ctx: CanvasRenderingContext2D,
  frame: BootFrame,
): void {
  const { accent, accent2, buy, sell } = frame;
  const t = frame.t / 1000;
  const prog = Math.min(1, frame.t / frame.dur);
  const W = frame.w;
  const H = frame.h;
  const cx = W / 2;
  const cy = H / 2;
  const E = ease(prog);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,2,4,0.64)";
  ctx.fillRect(0, 0, W, H);

  // camera vignette + scanlines
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
  ctx.fillStyle = hexToRgba(accent, 0.035);

  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }

  const shake = (1 - E) * 1.0 + 0.22;
  const jx = (Math.sin(t * 9) * 1.4 + Math.sin(t * 17) * 0.7) * shake;
  const jy = (Math.cos(t * 7) * 1.1 + Math.sin(t * 23) * 0.5) * shake;

  // tracked scene: perspective alignment grid converging on the bay
  ctx.save();
  ctx.translate(jx, jy);
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(accent, 0.1);

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

  ctx.strokeStyle = hexToRgba(accent2, 0.16);

  for (let r = 1; r <= 5; r++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * Math.min(W, H) * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // flat HUD grid overlay (fixed)
  ctx.strokeStyle = hexToRgba(accent, 0.06);
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

  // incoming craft (tracked target): distant → bay centre, growing
  const wob = 1 - E;
  const tgx = cx + jx + Math.sin(t * 1.3) * 6 * wob;
  const tgy = cy + jy + Math.cos(t * 1.1) * 5 * wob;
  const craftR = 12 + E * 92;
  const R0 = craftR;

  // docking target: station hull backdrop + docking port
  ctx.save();
  ctx.translate(tgx, tgy);
  ctx.fillStyle = "rgba(8,16,22,0.5)";
  ctx.fillRect(-R0 * 3.6, -R0 * 1.6, R0 * 7.2, R0 * 3.2);
  ctx.strokeStyle = hexToRgba(accent, 0.12);
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

  ctx.strokeStyle = hexToRgba(accent, 0.18);
  ctx.strokeRect(-R0 * 3.4, -R0 * 0.55, R0 * 0.95, R0 * 1.1);
  ctx.strokeRect(R0 * 2.45, -R0 * 0.55, R0 * 0.95, R0 * 1.1);
  ctx.restore();

  // concentric docking mechanism
  ctx.save();
  ctx.translate(tgx, tgy);
  ctx.rotate(Math.sin(t * 0.2) * 0.05);
  ctx.strokeStyle = hexToRgba(accent, 0.85);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 1.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 1.34, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r1 = R0 * 1.15;
    const r2 = R0 * (i % 3 === 0 ? 1.32 : 1.24);
    ctx.strokeStyle = hexToRgba(accent, i % 3 === 0 ? 0.6 : 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }

  ctx.strokeStyle = hexToRgba(accent, 0.6);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.84, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillStyle = hexToRgba(accent, 0.5);
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

  ctx.fillStyle = hexToRgba(accent2, 0.1);
  ctx.strokeStyle = hexToRgba(accent2, 0.55);
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

  ctx.strokeStyle = hexToRgba(accent, 0.7);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.28, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.strokeStyle = hexToRgba(accent, 0.4);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R0 * 0.28, Math.sin(a) * R0 * 0.28);
    ctx.lineTo(Math.cos(a) * R0 * 0.5, Math.sin(a) * R0 * 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = hexToRgba(accent2, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, R0 * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // green alignment marker drifting toward centre as we align
  const misx = -W * 0.05 * wob + Math.sin(t * 1.1) * R0 * 0.5 * wob;
  const misy = -H * 0.05 * wob + Math.cos(t * 0.9) * R0 * 0.45 * wob;
  ctx.save();
  ctx.translate(tgx + misx, tgy + misy);
  ctx.strokeStyle = hexToRgba(buy, 0.9);
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

  // primary circular docking reticle + PYR / PITCH / RANGE readouts
  const RR = Math.min(W, H) * 0.36;
  const rng = Math.max(0, Math.round(4820 * (1 - E)));
  ctx.strokeStyle = hexToRgba(accent, 0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, RR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(accent, 0.2);
  ctx.beginPath();
  ctx.arc(cx, cy, RR + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hexToRgba(buy, 0.85);
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
  ctx.fillStyle = hexToRgba(accent, 0.5);
  ctx.textAlign = "center";
  ctx.fillText("P Y R", 0, 0);
  ctx.restore();
  ctx.textAlign = "right";
  ctx.fillStyle = hexToRgba(buy, 0.85);
  ctx.fillText(
    `${(Math.sin(t * 0.5) * 0.1).toFixed(1)}°`,
    cx + RR - 18,
    cy - 8,
  );
  ctx.fillStyle = hexToRgba(accent2, 0.7);
  ctx.fillText(
    `${(Math.sin(t * 0.7) * 0.6 * wob).toFixed(1)}°/m`,
    cx + RR - 18,
    cy + 8,
  );
  ctx.save();
  ctx.translate(cx + RR - 6, cy);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = hexToRgba(accent, 0.5);
  ctx.textAlign = "center";
  ctx.fillText("P I T C H", 0, 0);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = hexToRgba(accent, 0.5);
  ctx.font = `9px ${MONO}`;
  ctx.fillText("RANGE", cx - RR * 0.42, cy + RR - 28);
  ctx.fillText("RANGE RATE", cx + RR * 0.42, cy + RR - 28);
  ctx.fillStyle = hexToRgba(accent, 0.95);
  ctx.font = `bold 18px ${MONO}`;
  ctx.fillText(`${rng} m`, cx - RR * 0.42, cy + RR - 9);
  ctx.fillStyle = hexToRgba(accent2, 0.95);
  ctx.fillText(
    `-0.${pad2(34 - Math.round(prog * 6))} m/s`,
    cx + RR * 0.42,
    cy + RR - 9,
  );
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // target-lock box with converging L brackets
  const lock = ease(Math.min(1, (prog - 0.18) / 0.5));
  const acq = prog < 0.25;
  const box = craftR * 1.45 + (1 - lock) * Math.min(W, H) * 0.18;
  const blink = acq ? 0.4 + 0.6 * Math.abs(Math.sin(t * 9)) : 1;
  const lc = prog > 0.55 ? accent2 : accent;
  ctx.strokeStyle = hexToRgba(lc, 0.92 * blink);
  ctx.lineWidth = 1.8;
  const tk = Math.max(10, box * 0.22);

  for (const q of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const qx = tgx + q[0] * box;
    const qy = tgy + q[1] * box;
    ctx.beginPath();
    ctx.moveTo(qx, qy - q[1] * tk);
    ctx.lineTo(qx, qy);
    ctx.lineTo(qx - q[0] * tk, qy);
    ctx.stroke();
  }

  if (prog < 0.6) {
    ctx.save();
    ctx.translate(tgx, tgy);
    ctx.rotate(t * 1.4);
    ctx.strokeStyle = hexToRgba(accent, 0.5 * blink);
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
  ctx.strokeStyle = hexToRgba(accent2, 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(tgx, tgy);
  ctx.lineTo(tgx + (cx - tgx) * 0.5, tgy + (cy - tgy) * 0.5);
  ctx.stroke();

  // boresight crosshair (fixed centre)
  ctx.strokeStyle = hexToRgba(accent, 0.6);
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
  ctx.strokeStyle = hexToRgba(accent, 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.stroke();

  // pitch ladder
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 0.8) * 10);
  ctx.strokeStyle = hexToRgba(accent, 0.22);
  ctx.fillStyle = hexToRgba(accent, 0.4);
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

  // horizontal scan sweep
  const ssy = ((t * 0.35) % 1) * H;
  const sg = ctx.createLinearGradient(0, ssy - 30, 0, ssy + 30);
  sg.addColorStop(0, "rgba(0,0,0,0)");
  sg.addColorStop(0.5, hexToRgba(accent2, 0.1));
  sg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, ssy - 30, W, 60);

  // telemetry corners
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
    ctx.fillStyle = hexToRgba(col ?? accent, 0.85);
    a.forEach((ln, i) => {
      ctx.fillText(ln, x, y + i * 15);
    });
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  lbl(20, 28, ["◉ CAM-04  DOCK BAY 07", "GIMBAL TRACK · AUTO", `TC ${tc}`]);
  ctx.fillStyle = hexToRgba(sell, 0.9);
  ctx.font = `11px ${MONO}`;
  ctx.fillText("● REC", 20, 73);
  ctx.textAlign = "right";
  lbl(W - 20, 28, [
    `RANGE   ${range} m`,
    `CLOSURE ${closure} m/s`,
    `BEARING ${bearing}°`,
  ]);
  lbl(W - 20, 73, [`AZ ${az}   EL ${el}`], accent2);
  lbl(
    W - 20,
    H - 58,
    ["LINK  SECURE · AES-256", "AUTH  OK ▸ TRD-0042"],
    accent2,
  );
  ctx.textAlign = "left";
  lbl(20, H - 58, [
    `ALIGN  dX ${dX}  dY ${dY}`,
    `       dZ ${dZ}  ROLL ${(Math.sin(t * 1.7) * 1.2).toFixed(1)}`,
    `THRUST ${Math.round(8 + 12 * (1 - prog))}%   MASS 42.6t`,
  ]);
  const bars = 5;

  for (let i = 0; i < bars; i++) {
    const on = i < 3 + Math.round(1.4 * Math.sin(t * 4 + i) + 1.2);
    ctx.fillStyle = hexToRgba(on ? accent2 : accent, on ? 0.85 : 0.2);
    ctx.fillRect(W - 20 - (bars - i) * 9, H - 26, 6, 4 + i * 3);
  }

  // lock status banner
  let stt = "ACQUIRING";
  let sc = accent;

  if (prog >= 0.25 && prog < 0.55) {
    stt = "TRACKING";
  } else if (prog >= 0.55 && prog < 0.8) {
    stt = "TARGET LOCKED";
    sc = accent2;
  } else if (prog >= 0.8 && prog < 0.96) {
    stt = "DOCKING SEQUENCE";
    sc = accent2;
  } else if (prog >= 0.96) {
    stt = "CLAMP ENGAGED";
    sc = buy;
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
    fg.addColorStop(0.35, hexToRgba(accent2, 0.3 * fa));
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
  }
}

export function drawBoot(
  ctx: CanvasRenderingContext2D,
  variant: BootVariant,
  frame: BootFrame,
): void {
  if (variant === "laser") {
    drawLaser(ctx, frame);
    return;
  }

  if (variant === "docking") {
    drawDocking(ctx, frame);
    return;
  }

  drawGlobe(ctx, frame);
}
