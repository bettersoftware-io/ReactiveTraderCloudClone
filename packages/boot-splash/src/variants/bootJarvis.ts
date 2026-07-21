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
interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  perspective: number;
}

/** One of the 14 depth-scattered blueprint fragments orbiting the core. */
interface Fragment {
  baseX: number;
  baseY: number;
  baseZ: number;
  currentZ: number;
  zSpeed: number;
  zAmplitude: number;
  scale: number;
  kind: number;
  phase: number;
  revealAt: number;
  angle: number;
  id: string;
}

/** One drifting background dust particle. */
interface Particle {
  x: number;
  y: number;
  z: number;
  driftSpeed: number;
  seed: number;
}

/** One of the six ring-machinery layers sweeping in around the core. */
interface Ring {
  radius: number;
  revealAt: number;
  kind: "ticks" | "segs" | "dash" | "pads" | "arcs" | "ruler";
}

/** Deterministic pseudo-random in [0,1), seeded by index (sin-hash). */
function hashRandom(i: number): number {
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
 * returned function every frame, and feeds cursor position via scene.pointer.
 */
export function createBootJarvis(scene: BootDrawCtx): BootFrameFn {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;
  const buyColor = scene.buy;

  function resize(): void {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  resize();

  // floating blueprint fragments at varied depth
  const fragments: Fragment[] = [];

  for (let i = 0; i < 14; i++) {
    const angle = hashRandom(i * 3 + 1) * 6.283;
    const radius = 0.58 + hashRandom(i * 5 + 2) * 0.6;
    fragments.push({
      baseX: Math.cos(angle) * radius * 1.4,
      baseY: Math.sin(angle) * radius * 0.85,
      baseZ: (hashRandom(i * 7 + 3) - 0.5) * 1.0,
      currentZ: 0,
      zSpeed: 0.35 + hashRandom(i * 19 + 8) * 0.7,
      zAmplitude: 0.22 + hashRandom(i * 23 + 9) * 0.28,
      scale: 0.06 + hashRandom(i * 11 + 4) * 0.05,
      kind: i % 5,
      phase: hashRandom(i * 13 + 5) * 6.283,
      revealAt: 0.34 + (i / 14) * 0.42,
      angle: angle,
      id: `ND-${30 + Math.floor(hashRandom(i * 17 + 6) * 60)}`,
    });
  }

  const particles: Particle[] = [];

  for (let i = 0; i < 55; i++) {
    particles.push({
      x: (hashRandom(i * 17 + 2) - 0.5) * 3.0,
      y: (hashRandom(i * 19 + 3) - 0.5) * 2.0,
      z: (hashRandom(i * 23 + 4) - 0.5) * 1.2,
      driftSpeed: 0.04 + hashRandom(i * 29 + 5) * 0.1,
      seed: hashRandom(i * 31 + 6),
    });
  }

  const RINGS: Ring[] = [
    { radius: 0.3, revealAt: 0.05, kind: "ticks" },
    { radius: 0.38, revealAt: 0.1, kind: "segs" },
    { radius: 0.5, revealAt: 0.15, kind: "dash" },
    { radius: 0.62, revealAt: 0.2, kind: "pads" },
    { radius: 0.78, revealAt: 0.25, kind: "arcs" },
    { radius: 0.95, revealAt: 0.3, kind: "ruler" },
  ];

  return function drawBootJarvis(): void {
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

    const pointerX = scene.pointer.mx;
    const pointerY = scene.pointer.my;
    const yaw = 0.55 + 0.18 * Math.sin(elapsedSec * 0.35) + pointerX * 0.3;
    const pitch = 0.3 + 0.08 * Math.sin(elapsedSec * 0.27) + pointerY * 0.18;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const projScale = Math.min(width, height) * 0.42;

    function project(x: number, y: number, z: number): ProjectedPoint {
      const rotX = x * cosYaw - z * sinYaw;
      const rotZ = x * sinYaw + z * cosYaw;
      const pitchedY = y * cosPitch - rotZ * sinPitch;
      const depthZ = y * sinPitch + rotZ * cosPitch;
      const perspective = 1 / Math.max(0.4, 1 + depthZ * 0.3);
      return {
        x: centerX + rotX * projScale * perspective,
        y: centerY + pitchedY * projScale * perspective,
        z: depthZ,
        perspective,
      };
    }

    // shared Z-plane wobble read by projectPolar when no explicit z is passed
    let ringZPlane = 0;

    function projectPolar(
      angle: number,
      radius: number,
      z?: number,
    ): ProjectedPoint {
      return project(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        z === undefined ? ringZPlane : z,
      );
    }

    let flickerAlpha =
      0.88 + 0.12 * Math.sin(elapsedSec * 36 + Math.sin(elapsedSec * 9) * 4);

    if (hashRandom(Math.floor(elapsedSec * 6) + 9) > 0.94) {
      flickerAlpha *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = flickerAlpha;

    // dotted backdrop grid, deep parallax
    ctx.fillStyle = hexToRgba(accent, 0.06);

    for (let gridX = -7; gridX <= 7; gridX++) {
      for (let gridY = -4; gridY <= 4; gridY++) {
        const point = project(gridX * 0.22, gridY * 0.22, 0.85);
        ctx.fillRect(point.x - 0.6, point.y - 0.6, 1.2, 1.2);
      }
    }

    // core glow
    const coreCenter = project(0, 0, 0);
    const coreGradient = ctx.createRadialGradient(
      coreCenter.x,
      coreCenter.y,
      0,
      coreCenter.x,
      coreCenter.y,
      projScale * 0.3,
    );
    coreGradient.addColorStop(0, hexToRgba(accent, 0.2));
    coreGradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = coreGradient;
    ctx.fillRect(
      coreCenter.x - projScale * 0.32,
      coreCenter.y - projScale * 0.32,
      projScale * 0.64,
      projScale * 0.64,
    );

    // radar wedge sweep
    {
      const sweepStart = elapsedSec * 0.5;
      ctx.fillStyle = hexToRgba(accent, 0.045);
      ctx.beginPath();

      for (let step = 0; step <= 10; step++) {
        const point = projectPolar(sweepStart + (step / 10) * 0.55, 0.3);

        if (step === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      for (let step = 10; step >= 0; step--) {
        const point = projectPolar(sweepStart + (step / 10) * 0.55, 0.95);
        ctx.lineTo(point.x, point.y);
      }

      ctx.closePath();
      ctx.fill();
    }

    // wireframe core sphere
    const spherePhase = ease(progress / 0.16);
    const sphereRadius = 0.2 * spherePhase;

    if (spherePhase > 0) {
      const spin = elapsedSec * 0.55;
      const zBob = Math.sin(elapsedSec * 0.6) * 0.1;

      function projectSphere(lat: number, lon: number): ProjectedPoint {
        const x = Math.cos(lat) * Math.cos(lon + spin) * sphereRadius;
        const y = Math.sin(lat) * sphereRadius;
        const z = Math.cos(lat) * Math.sin(lon + spin) * sphereRadius;
        return project(x, y, z + zBob);
      }

      ctx.lineWidth = 1;

      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();

        for (let lon = 0; lon <= 360; lon += 15) {
          const point = projectSphere(
            (lat * Math.PI) / 180,
            (lon * Math.PI) / 180,
          );

          if (lon === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }

        ctx.strokeStyle = hexToRgba(accent, 0.4 * spherePhase);
        ctx.stroke();
      }

      for (let lon = 0; lon < 360; lon += 30) {
        ctx.beginPath();

        for (let lat = -80; lat <= 80; lat += 10) {
          const point = projectSphere(
            (lat * Math.PI) / 180,
            (lon * Math.PI) / 180,
          );

          if (lat === -80) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }

        ctx.strokeStyle = hexToRgba(accent, 0.3 * spherePhase);
        ctx.stroke();
      }

      const corePoint = project(0, 0, zBob);
      ctx.fillStyle = hexToRgba("#ffffff", 0.75 * spherePhase);
      ctx.shadowColor = accent;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(corePoint.x, corePoint.y, 2.4, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ring machinery, each sweeps in
    const topAngle = -Math.PI / 2;

    RINGS.forEach((ring, ringIdx) => {
      const ringPhase = ease((progress - ring.revealAt) / 0.18);

      if (ringPhase <= 0) {
        return;
      }

      const sweep = ringPhase * 6.283;
      ringZPlane = Math.sin(elapsedSec * 0.5 + ringIdx * 1.25) * 0.09;

      function arc(
        radius: number,
        startAngle: number,
        endAngle: number,
        color: string,
        alpha: number,
        lineWidth: number,
        dash?: number[],
      ): void {
        const segCount = Math.max(6, Math.floor((endAngle - startAngle) * 26));
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth = lineWidth;

        if (dash) {
          ctx.setLineDash(dash);
        }

        ctx.beginPath();

        for (let step = 0; step <= segCount; step++) {
          const point = projectPolar(
            startAngle + ((endAngle - startAngle) * step) / segCount,
            radius,
          );

          if (step === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (ring.kind === "ticks") {
        arc(ring.radius, topAngle, topAngle + sweep, accent, 0.6, 1.3);
        const tickCount = 60;

        for (let i = 0; i < tickCount * ringPhase; i++) {
          const angle = topAngle + (i / tickCount) * 6.283 + elapsedSec * 0.05;
          const innerPoint = projectPolar(angle, ring.radius - 0.012);
          const outerPoint = projectPolar(
            angle,
            ring.radius + (i % 5 === 0 ? 0.022 : 0.01),
          );
          ctx.strokeStyle = hexToRgba(accent, i % 5 === 0 ? 0.55 : 0.25);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(innerPoint.x, innerPoint.y);
          ctx.lineTo(outerPoint.x, outerPoint.y);
          ctx.stroke();
        }
      } else if (ring.kind === "segs") {
        const rotation = elapsedSec * 0.14;

        for (let segment = 0; segment < 12 * ringPhase; segment++) {
          const angle = topAngle + rotation + (segment / 12) * 6.283;
          arc(
            ring.radius,
            angle,
            angle + 0.38,
            segment % 4 === 0 ? accentAlt : accent,
            segment % 4 === 0 ? 0.7 : 0.4,
            segment % 4 === 0 ? 2 : 1.2,
          );
        }
      } else if (ring.kind === "dash") {
        arc(ring.radius, topAngle, topAngle + sweep, accent, 0.35, 1, [3, 8]);
        const rotation = -elapsedSec * 0.1;

        ["CL/7 PRICING", "RISK CORE", "ORDER MESH"].forEach(
          (label, labelIdx) => {
            if (ringPhase < 1) {
              return;
            }

            const angle = rotation + labelIdx * 2.094;
            const point = projectPolar(angle, ring.radius + 0.035);
            ctx.font = `8px ${MONO}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = hexToRgba(accent, 0.55);
            ctx.fillText(label, point.x, point.y);
          },
        );
      } else if (ring.kind === "pads") {
        arc(ring.radius - 0.008, topAngle, topAngle + sweep, accent, 0.4, 1);
        arc(ring.radius + 0.008, topAngle, topAngle + sweep, accent, 0.4, 1);
        const rotation = elapsedSec * 0.03;

        for (let segment = 0; segment < 8 * ringPhase; segment++) {
          const angle = topAngle + rotation + (segment / 8) * 6.283;
          const halfAngle = 0.1;
          const halfRadial = 0.026;
          const corners = [
            projectPolar(angle - halfAngle, ring.radius - halfRadial),
            projectPolar(angle + halfAngle, ring.radius - halfRadial),
            projectPolar(angle + halfAngle, ring.radius + halfRadial),
            projectPolar(angle - halfAngle, ring.radius + halfRadial),
          ];
          ctx.beginPath();
          ctx.moveTo(corners[0].x, corners[0].y);
          corners.forEach((point) => {
            ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
          ctx.fillStyle = hexToRgba(
            segment % 3 === 0 ? accentAlt : accent,
            0.14,
          );
          ctx.fill();
          ctx.strokeStyle = hexToRgba(
            segment % 3 === 0 ? accentAlt : accent,
            0.6,
          );
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else if (ring.kind === "arcs") {
        arc(ring.radius, topAngle, topAngle + sweep, accent, 0.3, 1);

        for (let arcIdx = 0; arcIdx < 4 * ringPhase; arcIdx++) {
          const angle = -elapsedSec * 0.07 + arcIdx * 1.571;
          arc(ring.radius, angle, angle + 0.7, accentAlt, 0.55, 2.2);
        }

        const tickCount = 36;

        for (let i = 0; i < tickCount * ringPhase; i++) {
          const angle = (i / tickCount) * 6.283 - elapsedSec * 0.07;
          const innerPoint = projectPolar(angle, ring.radius + 0.006);
          const outerPoint = projectPolar(angle, ring.radius + 0.02);
          ctx.strokeStyle = hexToRgba(accent, 0.3);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(innerPoint.x, innerPoint.y);
          ctx.lineTo(outerPoint.x, outerPoint.y);
          ctx.stroke();
        }
      } else {
        // ruler
        arc(ring.radius, topAngle, topAngle + sweep, accent, 0.22, 1);
        const tickCount = 120;

        for (let i = 0; i < tickCount * ringPhase; i++) {
          const angle = (i / tickCount) * 6.283;
          const isMajor = i % 10 === 0;
          const innerPoint = projectPolar(
            angle,
            ring.radius - (isMajor ? 0.02 : 0.008),
          );
          const outerPoint = projectPolar(angle, ring.radius);
          ctx.strokeStyle = hexToRgba(accent, isMajor ? 0.5 : 0.2);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(innerPoint.x, innerPoint.y);
          ctx.lineTo(outerPoint.x, outerPoint.y);
          ctx.stroke();

          if (i % 30 === 0 && ringPhase >= 1) {
            const point = projectPolar(angle, ring.radius + 0.03);
            ctx.font = `7px ${MONO}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = hexToRgba(accent, 0.45);
            ctx.fillText(String(i * 3).padStart(3, "0"), point.x, point.y);
          }
        }
      }
    });

    ringZPlane = 0;

    // radial spokes (expo walkways)
    const spokesPhase = ease((progress - 0.22) / 0.2);

    if (spokesPhase > 0) {
      const rotation = elapsedSec * 0.03;
      ringZPlane = Math.sin(elapsedSec * 0.45 + 2.0) * 0.06;

      for (let spokeIdx = 0; spokeIdx < 8; spokeIdx++) {
        const angle = rotation + (spokeIdx / 8) * 6.283 + 0.3927;
        const outerRadius = 0.33 + (0.6 - 0.33) * spokesPhase;
        const corners = [
          projectPolar(angle - 0.03, 0.33),
          projectPolar(angle + 0.03, 0.33),
          projectPolar(angle + 0.018, outerRadius),
          projectPolar(angle - 0.018, outerRadius),
        ];
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        corners.forEach((point) => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fillStyle = hexToRgba(accent, 0.06);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(accent, 0.35);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ringZPlane = 0;

    // blueprint fragments
    let shownCount = 0;
    const lungeIdx = Math.floor(elapsedSec / 1.6) % fragments.length;
    const lungeAmount = Math.sin(Math.PI * ((elapsedSec % 1.6) / 1.6));

    fragments.forEach((fragment, fragmentIdx) => {
      const revealPhase = ease((progress - fragment.revealAt) / 0.12);

      if (revealPhase <= 0) {
        fragment.currentZ = fragment.baseZ;
        return;
      }

      shownCount++;
      const glitch =
        revealPhase < 1
          ? (hashRandom(Math.floor(elapsedSec * 30) + fragmentIdx) * 6 - 3) *
            (1 - revealPhase)
          : 0;
      const isLunge = fragmentIdx === lungeIdx && progress > 0.45;
      const fragmentZ =
        fragment.baseZ +
        Math.sin(elapsedSec * fragment.zSpeed + fragment.phase) *
          fragment.zAmplitude -
        (isLunge ? 0.6 * lungeAmount : 0);
      fragment.currentZ = fragmentZ;

      function projectFragmentUV(u: number, v: number): ProjectedPoint {
        return project(
          fragment.baseX + u * fragment.scale + glitch * 0.001,
          fragment.baseY + v * fragment.scale,
          fragmentZ,
        );
      }

      const nearness = clamp((0.5 - fragmentZ) / 1.2);
      const alpha = Math.min(
        1,
        (0.3 + 0.45 * nearness) *
          revealPhase *
          (isLunge ? 1 + 0.35 * lungeAmount : 1),
      );

      // leader back to the outer ring
      const anchor = projectPolar(fragment.angle, 0.95);
      const originPoint = projectFragmentUV(0, 0);
      ctx.strokeStyle = hexToRgba(accent, 0.1 * revealPhase);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo((anchor.x + originPoint.x) / 2, originPoint.y);
      ctx.lineTo(originPoint.x, originPoint.y);
      ctx.stroke();

      function seg(
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        color: string,
        segAlpha: number,
        lineWidth?: number,
      ): void {
        const a = projectFragmentUV(u0, v0);
        const b = projectFragmentUV(u1, v1);
        ctx.strokeStyle = hexToRgba(color, segAlpha);
        ctx.lineWidth = lineWidth ?? 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (fragment.kind === 0) {
        // data card
        (
          [
            [-1, -0.7, 1, -0.7],
            [1, -0.7, 1, 0.7],
            [1, 0.7, -1, 0.7],
            [-1, 0.7, -1, -0.7],
          ] as [number, number, number, number][]
        ).forEach((edge) => {
          seg(edge[0], edge[1], edge[2], edge[3], accent, alpha, 1);
        });
        seg(-1, -0.42, 1, -0.42, accent, alpha * 0.8, 1);

        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 4; col++) {
            const a = projectFragmentUV(-0.85 + col * 0.48, -0.18 + row * 0.32);
            const b = projectFragmentUV(-0.6 + col * 0.48, -0.18 + row * 0.32);
            ctx.strokeStyle = hexToRgba(accent, alpha * 0.5);
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
        ).forEach((corner) => {
          const a = projectFragmentUV(corner[0], corner[1]);
          ctx.strokeStyle = hexToRgba(accentAlt, alpha);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - corner[3] * 5);
          ctx.lineTo(a.x, a.y);
          ctx.lineTo(a.x + corner[2] * 5, a.y);
          ctx.stroke();
        });
      } else if (fragment.kind === 1) {
        // dial
        ctx.strokeStyle = hexToRgba(accent, alpha);
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let step = 0; step <= 24; step++) {
          const a = projectFragmentUV(
            Math.cos((step / 24) * 6.283),
            Math.sin((step / 24) * 6.283),
          );

          if (step === 0) {
            ctx.moveTo(a.x, a.y);
          } else {
            ctx.lineTo(a.x, a.y);
          }
        }

        ctx.stroke();
        seg(-1, 0, 1, 0, accent, alpha * 0.6, 1);
        seg(0, -1, 0, 1, accent, alpha * 0.6, 1);
        ctx.strokeStyle = hexToRgba(accentAlt, alpha);
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let step = 0; step <= 8; step++) {
          const angle = elapsedSec * 1.2 + fragment.phase + (step / 8) * 1.4;
          const a = projectFragmentUV(
            Math.cos(angle) * 0.8,
            Math.sin(angle) * 0.8,
          );

          if (step === 0) {
            ctx.moveTo(a.x, a.y);
          } else {
            ctx.lineTo(a.x, a.y);
          }
        }

        ctx.stroke();
      } else if (fragment.kind === 2) {
        // hex cluster with live node
        (
          [
            [0, 0],
            [0.95, 0.55],
            [0.95, -0.55],
            [-0.95, 0.55],
            [0, 1.1],
          ] as [number, number][]
        ).forEach((hexCenter, hexIdx) => {
          ctx.beginPath();

          for (let step = 0; step <= 6; step++) {
            const angle = (step / 6) * 6.283 + 0.5236;
            const a = projectFragmentUV(
              hexCenter[0] + Math.cos(angle) * 0.55,
              hexCenter[1] + Math.sin(angle) * 0.55,
            );

            if (step === 0) {
              ctx.moveTo(a.x, a.y);
            } else {
              ctx.lineTo(a.x, a.y);
            }
          }

          if (hexIdx === 1) {
            ctx.fillStyle = hexToRgba(
              buyColor,
              alpha *
                (0.35 + 0.25 * Math.sin(elapsedSec * 2.5 + fragment.phase)),
            );
            ctx.fill();
          }

          ctx.strokeStyle = hexToRgba(hexIdx === 1 ? buyColor : accent, alpha);
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      } else if (fragment.kind === 3) {
        // meter
        (
          [
            [-0.45, -1, 0.45, -1],
            [0.45, -1, 0.45, 1],
            [0.45, 1, -0.45, 1],
            [-0.45, 1, -0.45, -1],
          ] as [number, number, number, number][]
        ).forEach((edge) => {
          seg(edge[0], edge[1], edge[2], edge[3], accent, alpha, 1);
        });
        const level = 0.5 + 0.4 * Math.sin(elapsedSec * 1.1 + fragment.phase);
        const a = projectFragmentUV(-0.32, 1 - level * 1.7);
        const b = projectFragmentUV(0.32, 1 - level * 1.7);
        const bottomLeft = projectFragmentUV(-0.32, 0.85);
        const bottomRight = projectFragmentUV(0.32, 0.85);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(bottomRight.x, bottomRight.y);
        ctx.lineTo(bottomLeft.x, bottomLeft.y);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(accentAlt, alpha * 0.4);
        ctx.fill();

        for (let i = 0; i < 4; i++) {
          seg(
            0.45,
            -0.8 + i * 0.5,
            0.62,
            -0.8 + i * 0.5,
            accent,
            alpha * 0.5,
            1,
          );
        }
      } else {
        // waveform
        (
          [
            [-1.1, -0.55, 1.1, -0.55],
            [-1.1, 0.55, 1.1, 0.55],
          ] as [number, number, number, number][]
        ).forEach((edge) => {
          seg(edge[0], edge[1], edge[2], edge[3], accent, alpha * 0.5, 1);
        });
        ctx.strokeStyle = hexToRgba(accentAlt, alpha);
        ctx.lineWidth = 1.3;
        ctx.beginPath();

        for (let step = 0; step <= 16; step++) {
          const u = -1 + step / 8;
          const a = projectFragmentUV(
            u,
            Math.sin(u * 4 + elapsedSec * 2 + fragment.phase) * 0.38,
          );

          if (step === 0) {
            ctx.moveTo(a.x, a.y);
          } else {
            ctx.lineTo(a.x, a.y);
          }
        }

        ctx.stroke();
      }

      if (revealPhase >= 1) {
        const labelPoint = projectFragmentUV(0, 1.5);
        ctx.font = `7px ${MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = hexToRgba(accent, 0.5);
        ctx.fillText(
          `${fragment.id} · Z${(fragment.currentZ * 100).toFixed(0)}`,
          labelPoint.x,
          labelPoint.y,
        );
      }
    });

    // cross-links between fragments
    if (progress > 0.6) {
      const linkPhase = ease((progress - 0.6) / 0.15);
      ctx.strokeStyle = hexToRgba(accent, 0.07 * linkPhase);
      ctx.lineWidth = 1;

      for (let i = 0; i < fragments.length; i += 3) {
        const a = project(
          fragments[i].baseX,
          fragments[i].baseY,
          fragments[i].currentZ,
        );
        const other = fragments[(i + 5) % 14];
        const b = project(other.baseX, other.baseY, other.currentZ);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // drifting particles
    particles.forEach((particle) => {
      const driftedY =
        particle.y -
        ((elapsedSec * particle.driftSpeed + particle.seed) % 1) * 0.5 +
        0.25;
      const point = project(particle.x, driftedY, particle.z);
      ctx.fillStyle = hexToRgba(
        accent,
        0.22 *
          (0.4 +
            0.6 * hashRandom(Math.floor(elapsedSec * 2) + particle.seed * 99)),
      );
      ctx.fillRect(point.x, point.y, 1.4, 1.4);
    });

    // corner telemetry + banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(accent, 0.7);
    ctx.fillText("◉ HOLO CORE · RT / 3Dx.40A", 20, 28);
    ctx.fillText(`ELEMENTS ${15 + shownCount} / 29 · DEPTH FIELD ON`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(
      `YAW ${(yaw * 57.29).toFixed(1)}°  PITCH ${(pitch * 57.29).toFixed(1)}°`,
      width - 20,
      28,
    );
    ctx.fillStyle = hexToRgba(accentAlt, 0.7);
    ctx.fillText("CURSOR TRACK · LIVE", width - 20, 44);

    let statusText = "PROJECTING SCHEMATIC";
    let statusColor = accent;

    if (progress >= 0.32 && progress < 0.75) {
      statusText = "LINKING SUBSYSTEMS";
    } else if (progress >= 0.75) {
      statusText = "HOLOGRAM STABLE ▸ HANDOFF";
      statusColor = accentAlt;
    }

    const blinkAlpha =
      progress < 0.32 ? 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(statusColor, 0.9 * blinkAlpha);
    ctx.fillText(`▸ ${statusText} ◂`, centerX, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
