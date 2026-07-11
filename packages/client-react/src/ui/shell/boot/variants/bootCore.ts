// createBootCore — verbatim port of the v4 prototype's rebuilt `_drawBoot`
// (docs/design/web/v4/dev-handoff/prototype/source/Reactive Trader.dc.html:943).
// The "global market mesh": a 3D globe whose meridians sweep in pole-to-pole
// with bright glowing draw-heads, parallels fill behind, and a scan ring sweeps
// south → north. Counter-rotating gyroscopic segmented rings wrap the sphere;
// ten trading-hub nodes (LON/NYC/TYO/SGP/SYD/FRA/HKG/ZRH/SAO/DXB) ping with
// expanding ripples while a rotating spotlight labels one front-facing hub at a
// time, and buy/sell order-flow arcs fire hub-to-hub over great-circle paths.
// Star-drift backdrop, nucleus glow, screen-space calibration ticks, holo
// flicker, and the SPINNING UP CORE → LINKING GLOBAL NODES → MESH ONLINE banner.
// Replaces the original flat-wireframe globe (see docs/design/web/v4/CHANGELOG.md
// entry 1, "core boot variant rebuilt — global market mesh").

import {
  BOOT_DURATION_MS,
  type BootDrawCtx,
  type BootFrameFn,
  ease,
  hexToRgba,
} from "../bootCanvas";

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Deterministic pseudo-random in [0,1) from an integer seed. Verbatim from the
 * prototype's `rnd` helper — a sine-based hash, not Math.random, so the star
 * field and arc scheduling are stable across renders.
 */
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Star-drift backdrop mote: normalized position, size and twinkle phase. */
interface Star {
  x: number;
  y: number;
  s: number;
  p: number;
}

/** A trading-hub node in spherical coords, with a ping-ripple phase offset. */
interface HubNode {
  la: number;
  lo: number;
  k: string;
  ph: number;
}

/** An in-flight order-flow arc between two hubs. */
interface FlowArc {
  a: number;
  b: number;
  t0: number;
  dur: number;
  buy: boolean;
}

/** 3D-projected screen point with depth (z) and perspective foreshortening (f). */
interface ProjPoint {
  x: number;
  y: number;
  z: number;
  f: number;
}

/** Ten global trading hubs: [latitude°, longitude°, code]. */
const HUBS: ReadonlyArray<readonly [number, number, string]> = [
  [51.5, -0.1, "LON"],
  [40.7, -74, "NYC"],
  [35.7, 139.7, "TYO"],
  [1.3, 103.8, "SGP"],
  [-33.9, 151.2, "SYD"],
  [50.1, 8.7, "FRA"],
  [22.3, 114.2, "HKG"],
  [47.4, 8.5, "ZRH"],
  [-23.5, -46.6, "SAO"],
  [25.2, 55.3, "DXB"],
];

/**
 * createBootCore — verbatim port of the prototype's `_drawBoot(start, DUR)`.
 * The factory runs once per boot (star field, hub node seeding); the returned
 * closure is the prototype's inner `draw()`, called every rAF frame by the caller.
 */
export function createBootCore(d: BootDrawCtx): BootFrameFn {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;
  const buy = d.buy;
  const sell = d.sell;

  if (c.width !== c.offsetWidth) {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  const stars: Star[] = [];

  for (let i = 0; i < 52; i++) {
    stars.push({
      x: rnd(i * 7 + 1),
      y: rnd(i * 11 + 2) * 0.85,
      s: 0.5 + rnd(i * 13 + 3) * 1.5,
      p: rnd(i * 17 + 4) * 6.283,
    });
  }

  const nodes: HubNode[] = HUBS.map((h, i) => {
    return {
      la: (h[0] * Math.PI) / 180,
      lo: (h[1] * Math.PI) / 180,
      k: h[2],
      ph: rnd(i * 19 + 5) * 6.283,
    };
  });

  const arcs: FlowArc[] = [];
  let lastArc = 0;
  let arcSeed = 7;
  let arcCount = 0;

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
    const cy = H / 2 - 20;
    const S = Math.min(W, H) * 0.24;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,3,6,0.5)";
    ctx.fillRect(0, 0, W, H);
    let ga = 0.88 + 0.12 * Math.sin(t * 36 + Math.sin(t * 9) * 4);

    if (rnd(Math.floor(t * 6) + 2) > 0.94) {
      ga *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = ga;
    // star drift backdrop
    stars.forEach((s) => {
      const tw = 0.25 + 0.55 * Math.abs(Math.sin(t * s.s + s.p));
      ctx.fillStyle = hexToRgba(acc, 0.08 + 0.2 * tw);
      ctx.fillRect(s.x * W, s.y * H, 1.3, 1.3);
    });
    // 3D projection (yaw spin + fixed tilt)
    const yaw = t * 0.42 + 0.6;
    const cp = Math.cos(0.38);
    const sp = Math.sin(0.38);
    const P3 = (x: number, y: number, z: number): ProjPoint => {
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const x1 = x * cyw - z * syw;
      const z1 = x * syw + z * cyw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const f = 1 / (1 + z2 * 0.28);
      return { x: cx + x1 * S * f, y: cy - y1 * S * f, z: z2, f };
    };
    const SPH = (la: number, lo: number): ProjPoint => {
      return P3(
        Math.cos(la) * Math.cos(lo),
        Math.sin(la),
        Math.cos(la) * Math.sin(lo),
      );
    };
    // nucleus glow
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 1.15);
    cg.addColorStop(0, hexToRgba(acc, 0.16));
    cg.addColorStop(0.55, hexToRgba(acc, 0.05));
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(cx - S * 1.3, cy - S * 1.3, S * 2.6, S * 2.6);
    const reveal = ease(prog / 0.32);
    const segAlpha = (z: number): number => {
      return 0.1 + 0.4 * clamp((0.55 - z) / 1.1);
    };
    ctx.lineWidth = 1;
    // meridians sweep in pole-to-pole, each with a bright draw head
    const NM = 12;

    for (let m = 0; m < NM; m++) {
      const k = clamp(reveal * NM - m);

      if (k <= 0) {
        break;
      }

      const lo = (m / NM) * Math.PI * 2;
      const maxLa = -Math.PI / 2 + Math.PI * k;
      let prev: ProjPoint | null = null;

      for (let i = 0; i <= 28; i++) {
        const la = -Math.PI / 2 + (Math.PI * i) / 28;

        if (la > maxLa) {
          break;
        }

        const p = SPH(la, lo);

        if (prev) {
          ctx.strokeStyle = hexToRgba(acc, segAlpha((p.z + prev.z) / 2));
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }

        prev = p;
      }

      if (k < 1 && prev) {
        ctx.fillStyle = hexToRgba(ac2, 0.9);
        ctx.shadowColor = ac2;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(prev.x, prev.y, 1.8, 0, 6.283);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // parallels
    for (let q = -2; q <= 2; q++) {
      const k = clamp(reveal * 5 - (q + 2));

      if (k <= 0) {
        continue;
      }

      const la = (q * Math.PI) / 6;
      let prev: ProjPoint | null = null;

      for (let i = 0; i <= Math.floor(40 * k); i++) {
        const p = SPH(la, (i / 40) * Math.PI * 2);

        if (prev) {
          ctx.strokeStyle = hexToRgba(acc, segAlpha((p.z + prev.z) / 2) * 0.85);
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }

        prev = p;
      }
    }

    // latitude scan ring sweeping south → north
    {
      const scanLa = -Math.PI / 2 + ((t * 0.3) % 1) * Math.PI;
      let prev: ProjPoint | null = null;
      ctx.lineWidth = 1.4;

      for (let i = 0; i <= 40; i++) {
        const p = SPH(scanLa, (i / 40) * Math.PI * 2);

        if (prev) {
          ctx.strokeStyle = hexToRgba(
            ac2,
            0.08 + 0.38 * clamp((0.55 - p.z) / 1.1),
          );
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }

        prev = p;
      }

      ctx.lineWidth = 1;
    }
    // gyroscopic segmented rings
    const rk = ease((prog - 0.18) / 0.25);

    if (rk > 0) {
      ctx.save();
      ctx.globalAlpha = ga * rk;
      const gyro = (
        r: number,
        tilt: number,
        spin: number,
        colr: string,
        alpha: number,
        lw: number,
      ): void => {
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
            const p = P3(x3, y3, z2);

            if (k2 === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }

          ctx.stroke();
        }
      };
      gyro(1.5, 1.05, t * 0.6, acc, 0.5, 1.2);
      gyro(1.66, -0.85, -t * 0.45, ac2, 0.3, 1);
      ctx.restore();
    }

    // hub nodes with ping ripples (front side only)
    const nk0 = ease((prog - 0.28) / 0.22);
    const nodePts = nodes.map((n) => {
      return { n, p: SPH(n.la, n.lo) };
    });
    nodePts.forEach((o, i) => {
      const k = clamp(nk0 * nodes.length - i * 0.5);

      if (k <= 0) {
        return;
      }

      const p = o.p;

      if (p.z > 0.12) {
        return;
      }

      const al = (0.4 + 0.55 * clamp(0.3 - p.z)) * k;
      ctx.fillStyle = hexToRgba(ac2, al);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 * p.f, 0, 6.283);
      ctx.fill();
      const ring = (t * 0.8 + o.n.ph) % 1;
      ctx.strokeStyle = hexToRgba(ac2, (1 - ring) * 0.5 * k);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (2 + ring * 10) * p.f, 0, 6.283);
      ctx.stroke();
    });

    // rotating spotlight callout on a front-facing hub
    if (nk0 >= 1) {
      const li = Math.floor(t / 2.2) % nodes.length;
      const lp = nodePts[li];

      if (lp.p.z < 0) {
        const p = lp.p;
        const lx = Math.min(Math.max(p.x + 14, 16), W - 130);
        ctx.strokeStyle = hexToRgba(acc, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 12, p.y - 14);
        ctx.lineTo(lx + 110, p.y - 14);
        ctx.stroke();
        ctx.font = `10px ${MONO}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = hexToRgba(ac2, 0.9);
        ctx.fillText(
          `${lp.n.k} · NODE ${String(li + 1).padStart(2, "0")}`,
          lx + 2,
          p.y - 20,
        );
        ctx.fillStyle = hexToRgba(acc, 0.7);
        ctx.fillText(
          "FLOW " +
            (120 + Math.round(90 * Math.sin(t * 0.7 + lp.n.ph) + 90)) +
            "M/S",
          lx + 2,
          p.y - 7,
        );
      }
    }

    // order-flow arcs between hubs
    if (prog > 0.36 && t - lastArc > 0.5 && arcs.length < 6) {
      lastArc = t;
      const a = Math.floor(rnd(arcSeed++) * nodes.length);
      let b = Math.floor(rnd(arcSeed++) * nodes.length);

      if (b === a) {
        b = (b + 4) % nodes.length;
      }

      arcs.push({
        a,
        b,
        t0: t,
        dur: 1.5 + rnd(arcSeed++) * 0.8,
        buy: rnd(arcSeed++) > 0.45,
      });
      arcCount++;
    }

    const v3 = (n: HubNode): [number, number, number] => {
      return [
        Math.cos(n.la) * Math.cos(n.lo),
        Math.sin(n.la),
        Math.cos(n.la) * Math.sin(n.lo),
      ];
    };

    for (let i = arcs.length - 1; i >= 0; i--) {
      const ar = arcs[i];
      const u = (t - ar.t0) / ar.dur;

      if (u >= 1) {
        arcs.splice(i, 1);
        continue;
      }

      const va = v3(nodes[ar.a]);
      const vb = v3(nodes[ar.b]);
      const col = ar.buy ? buy : sell;
      const at = (w: number): ProjPoint => {
        const x = va[0] + (vb[0] - va[0]) * w;
        const y = va[1] + (vb[1] - va[1]) * w;
        const z = va[2] + (vb[2] - va[2]) * w;
        const L = Math.hypot(x, y, z) || 1;
        const r = 1 + 0.28 * Math.sin(Math.PI * w);
        return P3((x / L) * r, (y / L) * r, (z / L) * r);
      };
      ctx.strokeStyle = hexToRgba(col, 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let s2 = 0; s2 <= 20; s2++) {
        const p = at(s2 / 20);

        if (s2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
      ctx.strokeStyle = hexToRgba(col, 0.8);
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      const u0 = Math.max(0, u - 0.18);

      for (let s2 = 0; s2 <= 8; s2++) {
        const p = at(u0 + ((u - u0) * s2) / 8);

        if (s2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
      const hd = at(u);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, 1.9, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (u > 0.88) {
        const p = at(1);
        const rr = (u - 0.88) / 0.12;
        ctx.strokeStyle = hexToRgba(col, 0.7 * (1 - rr));
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + rr * 9, 0, 6.283);
        ctx.stroke();
      }
    }

    // screen-space calibration ticks
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const on = ((t * 14) % 48) > i;
      ctx.strokeStyle = hexToRgba(acc, on ? 0.5 : 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * S * 1.86, cy + Math.sin(a) * S * 1.86);
      ctx.lineTo(cx + Math.cos(a) * S * 1.93, cy + Math.sin(a) * S * 1.93);
      ctx.stroke();
    }

    // telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(acc, 0.7);
    ctx.fillText("◉ CORE SYNC · GLOBAL MESH", 20, 28);
    ctx.fillText(`NODES 10 · UPLINK ${Math.round(prog * 100)}%`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, W - 20, 28);
    ctx.fillStyle = hexToRgba(ac2, 0.7);
    ctx.fillText(
      `LINKS ${arcCount} · LIVE ${arcs.length}`,
      W - 20,
      44,
    );
    let stt = "SPINNING UP CORE";
    let sc = acc;

    if (prog >= 0.32 && prog < 0.7) {
      stt = "LINKING GLOBAL NODES";
    } else if (prog >= 0.7) {
      stt = "MESH ONLINE ▸ HANDOFF";
      sc = ac2;
    }

    const bk = prog < 0.32 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(sc, 0.9 * bk);
    ctx.fillText(`▸ ${stt} ◂`, cx, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
