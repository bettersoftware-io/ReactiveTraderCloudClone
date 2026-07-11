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
  h: number;
  sg: number;
  pair: string;
  base: number;
  dp: number;
  step: number;
  lastIdx: number;
  val: number;
  dir: number;
  flashT: number;
  t0: number;
}

/** Drifting survey mote (position anchored to a peak + phase/speed). */
interface Mote {
  x: number;
  z: number;
  o: number;
  s: number;
}

/** Sparse wireframe-mesh vertex: world x, height, world z. */
type MeshPoint = [number, number, number];

/** Camera-projected point (screen x/y, view-space depth, perspective factor). */
interface Projected3 {
  x: number;
  y: number;
  z: number;
  f: number;
}

/** Marching-squares edge-pair table, keyed by the 4-bit corner mask. */
const TBL: Record<number, Array<[number, number]>> = {
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
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Zero-pad an already-integer number to two digits. Verbatim from prototype. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * createBootTopo — factory that runs once per boot. Precomputes the 52×36
 * heightfield and the marching-squares contour segments (11 iso levels) a
 * single time; the returned closure only projects + draws each frame.
 */
export function createBootTopo(d: BootDrawCtx): BootFrameFn {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;
  const buy = d.buy;
  const sell = d.sell;

  function resize(): void {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  resize();

  // volatility peaks = fx pairs
  const peaks: Peak[] = [
    {
      x: 0.1,
      z: -0.15,
      h: 0.55,
      sg: 0.2,
      pair: "EUR/USD",
      base: 1.0917,
      dp: 4,
      step: 0.0004,
      lastIdx: -1,
      val: 1.0917,
      dir: 1,
      flashT: -9,
      t0: 0.44,
    },
    {
      x: -0.55,
      z: 0.1,
      h: 0.42,
      sg: 0.16,
      pair: "GBP/USD",
      base: 1.2744,
      dp: 4,
      step: 0.0005,
      lastIdx: -1,
      val: 1.2744,
      dir: 1,
      flashT: -9,
      t0: 0.495,
    },
    {
      x: 0.55,
      z: 0.25,
      h: 0.38,
      sg: 0.15,
      pair: "USD/JPY",
      base: 157.32,
      dp: 2,
      step: 0.05,
      lastIdx: -1,
      val: 157.32,
      dir: 1,
      flashT: -9,
      t0: 0.55,
    },
    {
      x: -0.15,
      z: 0.45,
      h: 0.3,
      sg: 0.13,
      pair: "AUD/USD",
      base: 0.6621,
      dp: 4,
      step: 0.0003,
      lastIdx: -1,
      val: 0.6621,
      dir: 1,
      flashT: -9,
      t0: 0.605,
    },
    {
      x: 0.75,
      z: -0.35,
      h: 0.26,
      sg: 0.12,
      pair: "EUR/GBP",
      base: 0.8567,
      dp: 4,
      step: 0.0002,
      lastIdx: -1,
      val: 0.8567,
      dir: 1,
      flashT: -9,
      t0: 0.66,
    },
    {
      x: -0.75,
      z: -0.4,
      h: 0.24,
      sg: 0.12,
      pair: "USD/CHF",
      base: 0.8842,
      dp: 4,
      step: 0.0003,
      lastIdx: -1,
      val: 0.8842,
      dir: 1,
      flashT: -9,
      t0: 0.715,
    },
  ];

  function hfn(x: number, z: number): number {
    let h = 0;

    peaks.forEach((p) => {
      const dx = x - p.x;
      const dz = z - p.z;
      h += p.h * Math.exp(-(dx * dx + dz * dz) / (p.sg * p.sg * 2));
    });

    h +=
      0.045 * Math.sin(3.1 * x + 1.7 * z) +
      0.035 * Math.sin(5.3 * z - 2.2 * x) +
      0.05;
    const fall =
      (1 - (Math.abs(x) / 1.32) ** 4) * (1 - (Math.abs(z) / 1.02) ** 4);
    return Math.max(0, h * Math.max(0, fall));
  }

  // heightfield + marching-squares contours (precomputed in world space)
  const NX = 52;
  const NZ = 36;
  const X0 = -1.3;
  const X1 = 1.3;
  const Z0 = -1.0;
  const Z1 = 1.0;
  const DX = (X1 - X0) / (NX - 1);
  const DZ = (Z1 - Z0) / (NZ - 1);
  const Hh: number[][] = [];

  for (let i = 0; i < NX; i++) {
    Hh[i] = [];

    for (let j = 0; j < NZ; j++) {
      Hh[i][j] = hfn(X0 + i * DX, Z0 + j * DZ);
    }
  }

  const LV: number[] = [];

  for (let li = 0; li < 11; li++) {
    LV.push(0.055 + li * 0.052);
  }

  const contours: number[][] = LV.map((L) => {
    const segs: number[] = [];

    for (let i = 0; i < NX - 1; i++) {
      for (let j = 0; j < NZ - 1; j++) {
        const v00 = Hh[i][j];
        const v10 = Hh[i + 1][j];
        const v01 = Hh[i][j + 1];
        const v11 = Hh[i + 1][j + 1];
        const bits =
          (v00 > L ? 1 : 0) |
          (v10 > L ? 2 : 0) |
          (v11 > L ? 4 : 0) |
          (v01 > L ? 8 : 0);
        const e = TBL[bits];

        if (!e) {
          continue;
        }

        const x0 = X0 + i * DX;
        const z0 = Z0 + j * DZ;

        function ep(ei: number): [number, number] {
          let t2: number;

          if (ei === 0) {
            t2 = clamp((L - v00) / (v10 - v00 || 1e-9));
            return [x0 + t2 * DX, z0];
          }

          if (ei === 1) {
            t2 = clamp((L - v10) / (v11 - v10 || 1e-9));
            return [x0 + DX, z0 + t2 * DZ];
          }

          if (ei === 2) {
            t2 = clamp((L - v01) / (v11 - v01 || 1e-9));
            return [x0 + t2 * DX, z0 + DZ];
          }

          t2 = clamp((L - v00) / (v01 - v00 || 1e-9));
          return [x0, z0 + t2 * DZ];
        }

        e.forEach((pr) => {
          const a = ep(pr[0]);
          const b = ep(pr[1]);
          segs.push(a[0], a[1], b[0], b[1]);
        });
      }
    }

    return segs;
  });

  // sparse mesh polylines
  const meshR: MeshPoint[][] = [];

  for (let j = 0; j < NZ; j += 7) {
    const row: MeshPoint[] = [];

    for (let i = 0; i < NX; i += 2) {
      row.push([X0 + i * DX, Hh[i][j], Z0 + j * DZ]);
    }

    meshR.push(row);
  }

  for (let i = 0; i < NX; i += 8) {
    const col: MeshPoint[] = [];

    for (let j = 0; j < NZ; j += 2) {
      col.push([X0 + i * DX, Hh[i][j], Z0 + j * DZ]);
    }

    meshR.push(col);
  }

  const motes: Mote[] = [];

  for (let i = 0; i < 26; i++) {
    const pk = peaks[i % 6];
    motes.push({
      x: pk.x + (rnd(i * 7 + 2) - 0.5) * 0.5,
      z: pk.z + (rnd(i * 11 + 3) - 0.5) * 0.5,
      o: rnd(i * 13 + 4),
      s: 0.06 + rnd(i * 17 + 5) * 0.1,
    });
  }

  const GY = 0.35;

  return function drawBootTopoFrame(): void {
    if (c.width !== c.offsetWidth) {
      resize();
    }

    // Cursor steering: BootSequence owns the window mousemove listener and
    // writes normalized -1..1 values into d.pointer each frame (prototype
    // read its own module-local mx/my, updated by its own listener — no
    // smoothing was applied there, so none is applied here either).
    const mx = d.pointer.mx;
    const my = d.pointer.my;

    const t = (performance.now() - d.start) / 1000;
    const prog = Math.min(1, (performance.now() - d.start) / BOOT_DURATION_MS);
    const W = c.width;
    const H = c.height;
    const cx = W / 2;
    const cy = H / 2 + 10;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,3,6,0.55)";
    ctx.fillRect(0, 0, W, H);
    const yaw = 0.5 + t * 0.16 + mx * 0.35;
    const pitch = 0.55 + 0.05 * Math.sin(t * 0.3) + my * 0.15;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const S = Math.min(W, H) * 0.44;

    function P(x: number, y: number, z: number): Projected3 {
      const x1 = x * cyw - z * syw;
      const z1 = x * syw + z * cyw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const f = 1 / Math.max(0.4, 1 + z2 * 0.26);
      return { x: cx + x1 * S * f, y: cy + y1 * S * f, z: z2, f };
    }

    const E = ease(prog / 0.4);
    let ga = 0.88 + 0.12 * Math.sin(t * 35 + Math.sin(t * 8) * 4);

    if (rnd(Math.floor(t * 6) + 11) > 0.94) {
      ga *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = ga;

    // survey table frame
    const B: Array<[number, number]> = [
      [X0, Z0],
      [X1, Z0],
      [X1, Z1],
      [X0, Z1],
    ];
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = hexToRgba(acc, 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    B.forEach((q, i) => {
      const p = P(q[0], GY, q[1]);

      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    B.forEach((q) => {
      const p = P(q[0], GY, q[1]);
      ctx.strokeStyle = hexToRgba(ac2, 0.7);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 7);
      ctx.stroke();
    });

    // sparse wireframe mesh
    ctx.lineWidth = 1;
    meshR.forEach((row) => {
      ctx.strokeStyle = hexToRgba(acc, 0.1 * E);
      ctx.beginPath();
      row.forEach((q, i) => {
        const p = P(q[0], GY - q[1] * E, q[2]);

        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();
    });

    // contour levels, revealed bottom-up
    contours.forEach((segs, li) => {
      const L = LV[li];
      const k = ease((prog - 0.06 - li * 0.032) / 0.1);

      if (k <= 0) {
        return;
      }

      const newest = k < 1;
      const hot = li >= 8;
      ctx.strokeStyle = hexToRgba(
        hot ? ac2 : acc,
        (newest ? 0.95 : 0.22 + li * 0.045) * Math.max(k, 0.4),
      );
      ctx.lineWidth = newest ? 1.8 : hot ? 1.3 : 1;

      if (newest) {
        ctx.shadowColor = hot ? ac2 : acc;
        ctx.shadowBlur = 10;
      }

      ctx.beginPath();
      const yy = GY - L * E;

      for (let s2 = 0; s2 < segs.length; s2 += 4) {
        const a = P(segs[s2], yy, segs[s2 + 1]);
        const b = P(segs[s2 + 2], yy, segs[s2 + 3]);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // route linking the summits
    const rk = ease((prog - 0.62) / 0.15);

    if (rk > 0) {
      ctx.strokeStyle = hexToRgba(ac2, 0.4 * rk);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      peaks.forEach((pk, i) => {
        const p = P(pk.x, GY - hfn(pk.x, pk.z) * E, pk.z);

        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();
    }

    // summit beacons + pair labels + ticking prices
    const ord = peaks
      .map((pk) => {
        return { pk, s: P(pk.x, GY - hfn(pk.x, pk.z) * E, pk.z) };
      })
      .sort((a, b) => {
        return b.s.z - a.s.z;
      });

    ord.forEach((o) => {
      const pk = o.pk;
      const k = ease((prog - pk.t0) / 0.12);

      if (k <= 0) {
        return;
      }

      const sm = o.s;
      const hgt = 0.3 * k;
      // dashed halo ring on the terrain
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = hexToRgba(acc, 0.45 * k);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let k2 = 0; k2 <= 36; k2++) {
        const an = (k2 / 36) * 6.283 + t * 0.5;
        const p = P(
          pk.x + Math.cos(an) * 0.1,
          GY - hfn(pk.x, pk.z) * E,
          pk.z + Math.sin(an) * 0.1,
        );

        if (k2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);

      // beacon
      const tp = P(pk.x, GY - hfn(pk.x, pk.z) * E - hgt, pk.z);
      ctx.strokeStyle = hexToRgba(ac2, 0.75 * k);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sm.x, sm.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(ac2, 0.9 * k);
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y - 4);
      ctx.lineTo(tp.x + 4, tp.y);
      ctx.lineTo(tp.x, tp.y + 4);
      ctx.lineTo(tp.x - 4, tp.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hexToRgba("#ffffff", 0.8 * k);
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, 1.8, 0, 6.283);
      ctx.fill();

      // live tick
      const idx = Math.floor(t / 0.3 + rnd(pk.base * 97) * 7);

      if (idx !== pk.lastIdx) {
        pk.lastIdx = idx;
        const nv =
          pk.base + (rnd(idx * 7.3 + pk.base * 31) - 0.5) * pk.step * 14;
        pk.dir = nv >= pk.val ? 1 : -1;
        pk.val = nv;
        pk.flashT = t;
      }

      const fl = clamp(1 - (t - pk.flashT) / 0.22);
      const pc = pk.dir > 0 ? buy : sell;
      const txt = pk.val.toFixed(pk.dp);
      ctx.font = `bold 12px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";

      if (fl > 0) {
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = hexToRgba(pc, 0.22 * fl * k);
        ctx.fillRect(tp.x - tw / 2 - 5, tp.y - 36, tw + 10, 14);
      }

      ctx.fillStyle = hexToRgba(acc, 0.95 * k);
      ctx.fillText(pk.pair, tp.x, tp.y - 40);
      ctx.font = `12px ${MONO}`;
      ctx.fillStyle = hexToRgba(pc, (0.75 + 0.25 * fl) * k);
      ctx.fillText(`${pk.dir > 0 ? "▴ " : "▾ "}${txt}`, tp.x, tp.y - 25);
      ctx.strokeStyle = hexToRgba(acc, 0.35 * k);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y - 8);
      ctx.lineTo(tp.x, tp.y - 21);
      ctx.stroke();
    });

    // drifting survey motes
    motes.forEach((m) => {
      const u = (t * m.s + m.o) % 1;
      const p = P(m.x, GY - hfn(m.x, m.z) * E - u * 0.22, m.z);
      ctx.fillStyle = hexToRgba(acc, 0.3 * (1 - u) * E);
      ctx.fillRect(p.x, p.y, 1.4, 1.4);
    });

    // legend + telemetry
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(acc, 0.7);
    ctx.fillText("◉ VOL SURFACE · 3DSCAN", 20, 28);
    ctx.fillText("GRID RZ_5.19.24 · σ ALTITUDE", 20, 44);

    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = hexToRgba(i > 2 ? ac2 : acc, 0.3 + i * 0.18);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(20, 58 + i * 7);
      ctx.lineTo(46, 58 + i * 7);
      ctx.stroke();
    }

    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, W - 20, 28);
    ctx.fillStyle = hexToRgba(ac2, 0.7);
    ctx.fillText(`PEAKS 6 · FEED ${prog > 0.5 ? "LIVE" : "SYNC"}`, W - 20, 44);
    const dt = new Date();
    ctx.textAlign = "left";
    ctx.fillStyle = hexToRgba(acc, 0.5);
    ctx.fillText(
      `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`,
      20,
      H - 20,
    );
    ctx.textAlign = "right";
    ctx.fillText(".// MAP/VOLSCAN", W - 20, H - 20);
    let stt = "SCANNING VOLATILITY TERRAIN";
    let sc = acc;

    if (prog >= 0.44 && prog < 0.75) {
      stt = "RESOLVING SUMMITS";
    } else if (prog >= 0.75) {
      stt = "PRICE FEED LIVE ▸ HANDOFF";
      sc = ac2;
    }

    const bk2 = prog < 0.44 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(sc, 0.9 * bk2);
    ctx.fillText(`▸ ${stt} ◂`, cx, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
