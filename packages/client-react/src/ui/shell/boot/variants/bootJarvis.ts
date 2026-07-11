// drawBootJarvis — verbatim port of the v3 prototype's _drawBootJarvis.
// The densest scene: a wireframe core sphere inside six layers of ring
// machinery (tick dial, counter-rotating segments, pavilion pads,
// highlighted arcs, a degree ruler), eight radial spoke walkways, a radar
// wedge, and 14 depth-scattered blueprint fragments (data cards, dials, hex
// clusters, meters, waveforms) that glitch in, breathe along Z, get
// tethered to the outer ring, cross-linked, and one lunges at the camera
// every ~1.6s; fully cursor-tracked.

import {
  BOOT_DURATION_MS,
  type BootDrawCtx,
  type BootFrameFn,
  ease,
  hexToRgba,
} from "../bootCanvas";

const MONO = "'JetBrains Mono','IBM Plex Mono',monospace";

/** Yaw/pitch-projected 3D point with perspective-divide factor. */
interface Proj {
  x: number;
  y: number;
  z: number;
  f: number;
}

/** One of the 14 depth-scattered blueprint fragments orbiting the core. */
interface Fragment {
  fx: number;
  fy: number;
  fz: number;
  cz: number;
  zs: number;
  za: number;
  s: number;
  kind: number;
  ph: number;
  t0: number;
  ang: number;
  id: string;
}

/** One drifting background dust particle. */
interface Particle {
  x: number;
  y: number;
  z: number;
  s: number;
  o: number;
}

/** One of the six ring-machinery layers sweeping in around the core. */
interface Ring {
  r: number;
  t0: number;
  st: "ticks" | "segs" | "dash" | "pads" | "arcs" | "ruler";
}

/** Deterministic pseudo-random in [0,1), seeded by index (sin-hash). */
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * createBootJarvis — factory runs once per boot (builds the fragment table,
 * dust particles and ring definitions), returns the per-frame draw closure.
 * No self-scheduling: BootSequence.tsx owns the rAF loop and calls the
 * returned function every frame, and feeds cursor position via d.pointer.
 */
export function createBootJarvis(d: BootDrawCtx): BootFrameFn {
  const c = d.canvas;
  const ctx = d.ctx;
  const acc = d.accent;
  const ac2 = d.accent2 !== "" ? d.accent2 : d.accent;
  const buy = d.buy;

  function resize(): void {
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
  }

  resize();

  // floating blueprint fragments at varied depth
  const frags: Fragment[] = [];

  for (let i = 0; i < 14; i++) {
    const a = rnd(i * 3 + 1) * 6.283;
    const rad = 0.58 + rnd(i * 5 + 2) * 0.6;
    frags.push({
      fx: Math.cos(a) * rad * 1.4,
      fy: Math.sin(a) * rad * 0.85,
      fz: (rnd(i * 7 + 3) - 0.5) * 1.0,
      cz: 0,
      zs: 0.35 + rnd(i * 19 + 8) * 0.7,
      za: 0.22 + rnd(i * 23 + 9) * 0.28,
      s: 0.06 + rnd(i * 11 + 4) * 0.05,
      kind: i % 5,
      ph: rnd(i * 13 + 5) * 6.283,
      t0: 0.34 + (i / 14) * 0.42,
      ang: a,
      id: `ND-${30 + Math.floor(rnd(i * 17 + 6) * 60)}`,
    });
  }

  const parts: Particle[] = [];

  for (let i = 0; i < 55; i++) {
    parts.push({
      x: (rnd(i * 17 + 2) - 0.5) * 3.0,
      y: (rnd(i * 19 + 3) - 0.5) * 2.0,
      z: (rnd(i * 23 + 4) - 0.5) * 1.2,
      s: 0.04 + rnd(i * 29 + 5) * 0.1,
      o: rnd(i * 31 + 6),
    });
  }

  const RINGS: Ring[] = [
    { r: 0.3, t0: 0.05, st: "ticks" },
    { r: 0.38, t0: 0.1, st: "segs" },
    { r: 0.5, t0: 0.15, st: "dash" },
    { r: 0.62, t0: 0.2, st: "pads" },
    { r: 0.78, t0: 0.25, st: "arcs" },
    { r: 0.95, t0: 0.3, st: "ruler" },
  ];

  return function drawBootJarvis(): void {
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

    const mx = d.pointer.mx;
    const my = d.pointer.my;
    const yaw = 0.55 + 0.18 * Math.sin(t * 0.35) + mx * 0.3;
    const pitch = 0.3 + 0.08 * Math.sin(t * 0.27) + my * 0.18;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const S = Math.min(W, H) * 0.42;

    function P(x: number, y: number, z: number): Proj {
      const x1 = x * cyw - z * syw;
      const z1 = x * syw + z * cyw;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const f = 1 / Math.max(0.4, 1 + z2 * 0.3);
      return { x: cx + x1 * S * f, y: cy + y1 * S * f, z: z2, f };
    }

    let zPlane = 0;

    function PT(a: number, r: number, z?: number): Proj {
      return P(Math.cos(a) * r, Math.sin(a) * r, z === undefined ? zPlane : z);
    }

    let ga = 0.88 + 0.12 * Math.sin(t * 36 + Math.sin(t * 9) * 4);

    if (rnd(Math.floor(t * 6) + 9) > 0.94) {
      ga *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = ga;

    // dotted backdrop grid, deep parallax
    ctx.fillStyle = hexToRgba(acc, 0.06);

    for (let gx = -7; gx <= 7; gx++) {
      for (let gy = -4; gy <= 4; gy++) {
        const p = P(gx * 0.22, gy * 0.22, 0.85);
        ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
      }
    }

    // core glow
    const g0 = P(0, 0, 0);
    const cg = ctx.createRadialGradient(g0.x, g0.y, 0, g0.x, g0.y, S * 0.3);
    cg.addColorStop(0, hexToRgba(acc, 0.2));
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(g0.x - S * 0.32, g0.y - S * 0.32, S * 0.64, S * 0.64);

    // radar wedge sweep
    {
      const a0 = t * 0.5;
      ctx.fillStyle = hexToRgba(acc, 0.045);
      ctx.beginPath();

      for (let k2 = 0; k2 <= 10; k2++) {
        const p = PT(a0 + (k2 / 10) * 0.55, 0.3);

        if (k2 === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }

      for (let k2 = 10; k2 >= 0; k2--) {
        const p = PT(a0 + (k2 / 10) * 0.55, 0.95);
        ctx.lineTo(p.x, p.y);
      }

      ctx.closePath();
      ctx.fill();
    }

    // wireframe core sphere
    const sk = ease(prog / 0.16);
    const SR = 0.2 * sk;

    if (sk > 0) {
      const y2 = t * 0.55;
      const zb = Math.sin(t * 0.6) * 0.1;

      function SP(la: number, lo: number): Proj {
        const x = Math.cos(la) * Math.cos(lo + y2) * SR;
        const y = Math.sin(la) * SR;
        const z = Math.cos(la) * Math.sin(lo + y2) * SR;
        return P(x, y, z + zb);
      }

      ctx.lineWidth = 1;

      for (let la = -60; la <= 60; la += 30) {
        ctx.beginPath();

        for (let lo = 0; lo <= 360; lo += 15) {
          const p = SP((la * Math.PI) / 180, (lo * Math.PI) / 180);

          if (lo === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }

        ctx.strokeStyle = hexToRgba(acc, 0.4 * sk);
        ctx.stroke();
      }

      for (let lo = 0; lo < 360; lo += 30) {
        ctx.beginPath();

        for (let la = -80; la <= 80; la += 10) {
          const p = SP((la * Math.PI) / 180, (lo * Math.PI) / 180);

          if (la === -80) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }

        ctx.strokeStyle = hexToRgba(acc, 0.3 * sk);
        ctx.stroke();
      }

      const cp2 = P(0, 0, zb);
      ctx.fillStyle = hexToRgba("#ffffff", 0.75 * sk);
      ctx.shadowColor = acc;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cp2.x, cp2.y, 2.4, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ring machinery, each sweeps in
    const A0 = -Math.PI / 2;

    RINGS.forEach((rg, ri) => {
      const k = ease((prog - rg.t0) / 0.18);

      if (k <= 0) {
        return;
      }

      const sw = k * 6.283;
      zPlane = Math.sin(t * 0.5 + ri * 1.25) * 0.09;

      function arc(
        r: number,
        a0: number,
        a1: number,
        col: string,
        al: number,
        lw: number,
        dash?: number[],
      ): void {
        const n = Math.max(6, Math.floor((a1 - a0) * 26));
        ctx.strokeStyle = hexToRgba(col, al);
        ctx.lineWidth = lw;

        if (dash) {
          ctx.setLineDash(dash);
        }

        ctx.beginPath();

        for (let k2 = 0; k2 <= n; k2++) {
          const p = PT(a0 + ((a1 - a0) * k2) / n, r);

          if (k2 === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (rg.st === "ticks") {
        arc(rg.r, A0, A0 + sw, acc, 0.6, 1.3);
        const N = 60;

        for (let i = 0; i < N * k; i++) {
          const a = A0 + (i / N) * 6.283 + t * 0.05;
          const p1 = PT(a, rg.r - 0.012);
          const p2 = PT(a, rg.r + (i % 5 === 0 ? 0.022 : 0.01));
          ctx.strokeStyle = hexToRgba(acc, i % 5 === 0 ? 0.55 : 0.25);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      } else if (rg.st === "segs") {
        const rot = t * 0.14;

        for (let s2 = 0; s2 < 12 * k; s2++) {
          const a = A0 + rot + (s2 / 12) * 6.283;
          arc(
            rg.r,
            a,
            a + 0.38,
            s2 % 4 === 0 ? ac2 : acc,
            s2 % 4 === 0 ? 0.7 : 0.4,
            s2 % 4 === 0 ? 2 : 1.2,
          );
        }
      } else if (rg.st === "dash") {
        arc(rg.r, A0, A0 + sw, acc, 0.35, 1, [3, 8]);
        const rot = -t * 0.1;

        ["CL/7 PRICING", "RISK CORE", "ORDER MESH"].forEach((lb, li) => {
          if (k < 1) {
            return;
          }

          const a = rot + li * 2.094;
          const p = PT(a, rg.r + 0.035);
          ctx.font = `8px ${MONO}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = hexToRgba(acc, 0.55);
          ctx.fillText(lb, p.x, p.y);
        });
      } else if (rg.st === "pads") {
        arc(rg.r - 0.008, A0, A0 + sw, acc, 0.4, 1);
        arc(rg.r + 0.008, A0, A0 + sw, acc, 0.4, 1);
        const rot = t * 0.03;

        for (let s2 = 0; s2 < 8 * k; s2++) {
          const a = A0 + rot + (s2 / 8) * 6.283;
          const da = 0.1;
          const dr = 0.026;
          const q = [
            PT(a - da, rg.r - dr),
            PT(a + da, rg.r - dr),
            PT(a + da, rg.r + dr),
            PT(a - da, rg.r + dr),
          ];
          ctx.beginPath();
          ctx.moveTo(q[0].x, q[0].y);
          q.forEach((p) => {
            ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.fillStyle = hexToRgba(s2 % 3 === 0 ? ac2 : acc, 0.14);
          ctx.fill();
          ctx.strokeStyle = hexToRgba(s2 % 3 === 0 ? ac2 : acc, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else if (rg.st === "arcs") {
        arc(rg.r, A0, A0 + sw, acc, 0.3, 1);

        for (let s2 = 0; s2 < 4 * k; s2++) {
          const a = -t * 0.07 + s2 * 1.571;
          arc(rg.r, a, a + 0.7, ac2, 0.55, 2.2);
        }

        const N = 36;

        for (let i = 0; i < N * k; i++) {
          const a = (i / N) * 6.283 - t * 0.07;
          const p1 = PT(a, rg.r + 0.006);
          const p2 = PT(a, rg.r + 0.02);
          ctx.strokeStyle = hexToRgba(acc, 0.3);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      } else {
        // ruler
        arc(rg.r, A0, A0 + sw, acc, 0.22, 1);
        const N = 120;

        for (let i = 0; i < N * k; i++) {
          const a = (i / N) * 6.283;
          const lng = i % 10 === 0;
          const p1 = PT(a, rg.r - (lng ? 0.02 : 0.008));
          const p2 = PT(a, rg.r);
          ctx.strokeStyle = hexToRgba(acc, lng ? 0.5 : 0.2);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          if (i % 30 === 0 && k >= 1) {
            const p = PT(a, rg.r + 0.03);
            ctx.font = `7px ${MONO}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = hexToRgba(acc, 0.45);
            ctx.fillText(String(i * 3).padStart(3, "0"), p.x, p.y);
          }
        }
      }
    });

    zPlane = 0;

    // radial spokes (expo walkways)
    const spk = ease((prog - 0.22) / 0.2);

    if (spk > 0) {
      const rot = t * 0.03;
      zPlane = Math.sin(t * 0.45 + 2.0) * 0.06;

      for (let s2 = 0; s2 < 8; s2++) {
        const a = rot + (s2 / 8) * 6.283 + 0.3927;
        const rOut = 0.33 + (0.6 - 0.33) * spk;
        const q = [
          PT(a - 0.03, 0.33),
          PT(a + 0.03, 0.33),
          PT(a + 0.018, rOut),
          PT(a - 0.018, rOut),
        ];
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        q.forEach((p) => {
          ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = hexToRgba(acc, 0.06);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(acc, 0.35);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    zPlane = 0;

    // blueprint fragments
    let shown = 0;
    const lungeIdx = Math.floor(t / 1.6) % frags.length;
    const lunge = Math.sin(Math.PI * ((t % 1.6) / 1.6));

    frags.forEach((fr, fi) => {
      const k = ease((prog - fr.t0) / 0.12);

      if (k <= 0) {
        fr.cz = fr.fz;
        return;
      }

      shown++;
      const gl = k < 1 ? (rnd(Math.floor(t * 30) + fi) * 6 - 3) * (1 - k) : 0;
      const isLunge = fi === lungeIdx && prog > 0.45;
      const cz =
        fr.fz +
        Math.sin(t * fr.zs + fr.ph) * fr.za -
        (isLunge ? 0.6 * lunge : 0);
      fr.cz = cz;

      function M(u: number, v: number): Proj {
        return P(fr.fx + u * fr.s + gl * 0.001, fr.fy + v * fr.s, cz);
      }

      const near = clamp((0.5 - cz) / 1.2);
      const al = Math.min(
        1,
        (0.3 + 0.45 * near) * k * (isLunge ? 1 + 0.35 * lunge : 1),
      );

      // leader back to the outer ring
      const anch = PT(fr.ang, 0.95);
      const e0 = M(0, 0);
      ctx.strokeStyle = hexToRgba(acc, 0.1 * k);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(anch.x, anch.y);
      ctx.lineTo((anch.x + e0.x) / 2, e0.y);
      ctx.lineTo(e0.x, e0.y);
      ctx.stroke();

      function seg(
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        col: string,
        sa: number,
        lw?: number,
      ): void {
        const a = M(u0, v0);
        const b = M(u1, v1);
        ctx.strokeStyle = hexToRgba(col, sa);
        ctx.lineWidth = lw ?? 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (fr.kind === 0) {
        // data card
        (
          [
            [-1, -0.7, 1, -0.7],
            [1, -0.7, 1, 0.7],
            [1, 0.7, -1, 0.7],
            [-1, 0.7, -1, -0.7],
          ] as [number, number, number, number][]
        ).forEach((q) => {
          seg(q[0], q[1], q[2], q[3], acc, al, 1);
        });
        seg(-1, -0.42, 1, -0.42, acc, al * 0.8, 1);

        for (let r2 = 0; r2 < 3; r2++) {
          for (let c2 = 0; c2 < 4; c2++) {
            const a = M(-0.85 + c2 * 0.48, -0.18 + r2 * 0.32);
            const b = M(-0.6 + c2 * 0.48, -0.18 + r2 * 0.32);
            ctx.strokeStyle = hexToRgba(acc, al * 0.5);
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }

        (
          [
            [-1, -0.7, 1, 1],
            [1, -0.7, -1, 1],
            [-1, 0.7, 1, -1],
            [1, 0.7, -1, -1],
          ] as [number, number, number, number][]
        ).forEach((q) => {
          const a = M(q[0], q[1]);
          ctx.strokeStyle = hexToRgba(ac2, al);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - q[3] * 5);
          ctx.lineTo(a.x, a.y);
          ctx.lineTo(a.x + q[2] * 5, a.y);
          ctx.stroke();
        });
      } else if (fr.kind === 1) {
        // dial
        ctx.strokeStyle = hexToRgba(acc, al);
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let k2 = 0; k2 <= 24; k2++) {
          const a = M(Math.cos((k2 / 24) * 6.283), Math.sin((k2 / 24) * 6.283));

          if (k2 === 0) {
            ctx.moveTo(a.x, a.y);
          } else {
            ctx.lineTo(a.x, a.y);
          }
        }

        ctx.stroke();
        seg(-1, 0, 1, 0, acc, al * 0.6, 1);
        seg(0, -1, 0, 1, acc, al * 0.6, 1);
        ctx.strokeStyle = hexToRgba(ac2, al);
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let k2 = 0; k2 <= 8; k2++) {
          const an = t * 1.2 + fr.ph + (k2 / 8) * 1.4;
          const a = M(Math.cos(an) * 0.8, Math.sin(an) * 0.8);

          if (k2 === 0) {
            ctx.moveTo(a.x, a.y);
          } else {
            ctx.lineTo(a.x, a.y);
          }
        }

        ctx.stroke();
      } else if (fr.kind === 2) {
        // hex cluster with live node
        (
          [
            [0, 0],
            [0.95, 0.55],
            [0.95, -0.55],
            [-0.95, 0.55],
            [0, 1.1],
          ] as [number, number][]
        ).forEach((hx, hi) => {
          ctx.beginPath();

          for (let k2 = 0; k2 <= 6; k2++) {
            const an = (k2 / 6) * 6.283 + 0.5236;
            const a = M(
              hx[0] + Math.cos(an) * 0.55,
              hx[1] + Math.sin(an) * 0.55,
            );

            if (k2 === 0) {
              ctx.moveTo(a.x, a.y);
            } else {
              ctx.lineTo(a.x, a.y);
            }
          }

          if (hi === 1) {
            ctx.fillStyle = hexToRgba(
              buy,
              al * (0.35 + 0.25 * Math.sin(t * 2.5 + fr.ph)),
            );
            ctx.fill();
          }

          ctx.strokeStyle = hexToRgba(hi === 1 ? buy : acc, al);
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      } else if (fr.kind === 3) {
        // meter
        (
          [
            [-0.45, -1, 0.45, -1],
            [0.45, -1, 0.45, 1],
            [0.45, 1, -0.45, 1],
            [-0.45, 1, -0.45, -1],
          ] as [number, number, number, number][]
        ).forEach((q) => {
          seg(q[0], q[1], q[2], q[3], acc, al, 1);
        });
        const lv = 0.5 + 0.4 * Math.sin(t * 1.1 + fr.ph);
        const a = M(-0.32, 1 - lv * 1.7);
        const b = M(0.32, 1 - lv * 1.7);
        const dpt = M(-0.32, 0.85);
        const e2 = M(0.32, 0.85);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(e2.x, e2.y);
        ctx.lineTo(dpt.x, dpt.y);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(ac2, al * 0.4);
        ctx.fill();

        for (let i = 0; i < 4; i++) {
          seg(0.45, -0.8 + i * 0.5, 0.62, -0.8 + i * 0.5, acc, al * 0.5, 1);
        }
      } else {
        // waveform
        (
          [
            [-1.1, -0.55, 1.1, -0.55],
            [-1.1, 0.55, 1.1, 0.55],
          ] as [number, number, number, number][]
        ).forEach((q) => {
          seg(q[0], q[1], q[2], q[3], acc, al * 0.5, 1);
        });
        ctx.strokeStyle = hexToRgba(ac2, al);
        ctx.lineWidth = 1.3;
        ctx.beginPath();

        for (let k2 = 0; k2 <= 16; k2++) {
          const u = -1 + k2 / 8;
          const a = M(u, Math.sin(u * 4 + t * 2 + fr.ph) * 0.38);

          if (k2 === 0) {
            ctx.moveTo(a.x, a.y);
          } else {
            ctx.lineTo(a.x, a.y);
          }
        }

        ctx.stroke();
      }

      if (k >= 1) {
        const lp = M(0, 1.5);
        ctx.font = `7px ${MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = hexToRgba(acc, 0.5);
        ctx.fillText(`${fr.id} · Z${(fr.cz * 100).toFixed(0)}`, lp.x, lp.y);
      }
    });

    // cross-links between fragments
    if (prog > 0.6) {
      const lk = ease((prog - 0.6) / 0.15);
      ctx.strokeStyle = hexToRgba(acc, 0.07 * lk);
      ctx.lineWidth = 1;

      for (let i = 0; i < frags.length; i += 3) {
        const a = P(frags[i].fx, frags[i].fy, frags[i].cz);
        const other = frags[(i + 5) % 14];
        const b = P(other.fx, other.fy, other.cz);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // drifting particles
    parts.forEach((pt2) => {
      const yy = pt2.y - ((t * pt2.s + pt2.o) % 1) * 0.5 + 0.25;
      const p = P(pt2.x, yy, pt2.z);
      ctx.fillStyle = hexToRgba(
        acc,
        0.22 * (0.4 + 0.6 * rnd(Math.floor(t * 2) + pt2.o * 99)),
      );
      ctx.fillRect(p.x, p.y, 1.4, 1.4);
    });

    // corner telemetry + banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(acc, 0.7);
    ctx.fillText("◉ HOLO CORE · RT / 3Dx.40A", 20, 28);
    ctx.fillText(`ELEMENTS ${15 + shown} / 29 · DEPTH FIELD ON`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(
      `YAW ${(yaw * 57.29).toFixed(1)}°  PITCH ${(pitch * 57.29).toFixed(1)}°`,
      W - 20,
      28,
    );
    ctx.fillStyle = hexToRgba(ac2, 0.7);
    ctx.fillText("CURSOR TRACK · LIVE", W - 20, 44);

    let stt = "PROJECTING SCHEMATIC";
    let sc = acc;

    if (prog >= 0.32 && prog < 0.75) {
      stt = "LINKING SUBSYSTEMS";
    } else if (prog >= 0.75) {
      stt = "HOLOGRAM STABLE ▸ HANDOFF";
      sc = ac2;
    }

    const bk2 = prog < 0.32 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(sc, 0.9 * bk2);
    ctx.fillText(`▸ ${stt} ◂`, cx, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
