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
function hashRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Star-drift backdrop mote: normalized position, size and twinkle phase. */
interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

/** A trading-hub node in spherical coords, with a ping-ripple phase offset. */
interface HubNode {
  lat: number;
  lon: number;
  code: string;
  phase: number;
}

/** An in-flight order-flow arc between two hubs. */
interface FlowArc {
  fromHub: number;
  toHub: number;
  startSec: number;
  durationSec: number;
  buy: boolean;
}

/** 3D-projected screen point with depth (z) and perspective foreshortening. */
interface ProjPoint {
  x: number;
  y: number;
  z: number;
  perspective: number;
}

/** Unit-sphere cartesian vector [x, y, z] for a hub node. */
function hubToVector(hub: HubNode): [number, number, number] {
  return [
    Math.cos(hub.lat) * Math.cos(hub.lon),
    Math.sin(hub.lat),
    Math.cos(hub.lat) * Math.sin(hub.lon),
  ];
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
export function createBootCore(scene: BootDrawCtx): BootFrameFn {
  const canvas = scene.canvas;
  const ctx = scene.ctx;
  const accent = scene.accent;
  const accentAlt = scene.accent2 !== "" ? scene.accent2 : scene.accent;
  const buyColor = scene.buy;
  const sellColor = scene.sell;

  if (canvas.width !== canvas.offsetWidth) {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  const stars: Star[] = [];

  for (let i = 0; i < 52; i++) {
    stars.push({
      x: hashRandom(i * 7 + 1),
      y: hashRandom(i * 11 + 2) * 0.85,
      size: 0.5 + hashRandom(i * 13 + 3) * 1.5,
      phase: hashRandom(i * 17 + 4) * 6.283,
    });
  }

  const nodes: HubNode[] = HUBS.map((h, i) => {
    return {
      lat: (h[0] * Math.PI) / 180,
      lon: (h[1] * Math.PI) / 180,
      code: h[2],
      phase: hashRandom(i * 19 + 5) * 6.283,
    };
  });

  const arcs: FlowArc[] = [];
  let lastArcSec = 0;
  let arcSeed = 7;
  let arcCount = 0;

  return () => {
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
    const centerY = height / 2 - 20;
    const globeRadius = Math.min(width, height) * 0.24;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0,3,6,0.5)";
    ctx.fillRect(0, 0, width, height);
    let flickerAlpha =
      0.88 + 0.12 * Math.sin(elapsedSec * 36 + Math.sin(elapsedSec * 9) * 4);

    if (hashRandom(Math.floor(elapsedSec * 6) + 2) > 0.94) {
      flickerAlpha *= 0.55;
    }

    ctx.save();
    ctx.globalAlpha = flickerAlpha;
    // star drift backdrop
    stars.forEach((star) => {
      const twinkle =
        0.25 + 0.55 * Math.abs(Math.sin(elapsedSec * star.size + star.phase));
      ctx.fillStyle = hexToRgba(accent, 0.08 + 0.2 * twinkle);
      ctx.fillRect(star.x * width, star.y * height, 1.3, 1.3);
    });
    // 3D projection (yaw spin + fixed tilt)
    const yaw = elapsedSec * 0.42 + 0.6;
    const cosTilt = Math.cos(0.38);
    const sinTilt = Math.sin(0.38);

    function project(x: number, y: number, z: number): ProjPoint {
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const rotX = x * cosYaw - z * sinYaw;
      const rotZ = x * sinYaw + z * cosYaw;
      const tiltedY = y * cosTilt - rotZ * sinTilt;
      const depthZ = y * sinTilt + rotZ * cosTilt;
      const perspective = 1 / (1 + depthZ * 0.28);
      return {
        x: centerX + rotX * globeRadius * perspective,
        y: centerY - tiltedY * globeRadius * perspective,
        z: depthZ,
        perspective,
      };
    }

    function projectLatLon(lat: number, lon: number): ProjPoint {
      return project(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.sin(lon),
      );
    }

    // Point at fraction along the great-circle arc between hub vectors
    // fromVec/toVec, lifted off the sphere by a sine bulge so the arc bows out.
    function projectArcPoint(
      fraction: number,
      fromVec: [number, number, number],
      toVec: [number, number, number],
    ): ProjPoint {
      const x = fromVec[0] + (toVec[0] - fromVec[0]) * fraction;
      const y = fromVec[1] + (toVec[1] - fromVec[1]) * fraction;
      const z = fromVec[2] + (toVec[2] - fromVec[2]) * fraction;
      const length = Math.hypot(x, y, z) || 1;
      const bulge = 1 + 0.28 * Math.sin(Math.PI * fraction);
      return project(
        (x / length) * bulge,
        (y / length) * bulge,
        (z / length) * bulge,
      );
    }

    // nucleus glow
    const nucleusGrad = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      globeRadius * 1.15,
    );
    nucleusGrad.addColorStop(0, hexToRgba(accent, 0.16));
    nucleusGrad.addColorStop(0.55, hexToRgba(accent, 0.05));
    nucleusGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nucleusGrad;
    ctx.fillRect(
      centerX - globeRadius * 1.3,
      centerY - globeRadius * 1.3,
      globeRadius * 2.6,
      globeRadius * 2.6,
    );
    const reveal = ease(progress / 0.32);

    function segmentAlpha(z: number): number {
      return 0.1 + 0.4 * clamp((0.55 - z) / 1.1);
    }

    ctx.lineWidth = 1;
    // meridians sweep in pole-to-pole, each with a bright draw head
    const meridianCount = 12;

    for (let meridian = 0; meridian < meridianCount; meridian++) {
      const meridianPhase = clamp(reveal * meridianCount - meridian);

      if (meridianPhase <= 0) {
        break;
      }

      const lon = (meridian / meridianCount) * Math.PI * 2;
      const maxLat = -Math.PI / 2 + Math.PI * meridianPhase;
      let prevPoint: ProjPoint | null = null;

      for (let i = 0; i <= 28; i++) {
        const lat = -Math.PI / 2 + (Math.PI * i) / 28;

        if (lat > maxLat) {
          break;
        }

        const point = projectLatLon(lat, lon);

        if (prevPoint) {
          ctx.strokeStyle = hexToRgba(
            accent,
            segmentAlpha((point.z + prevPoint.z) / 2),
          );
          ctx.beginPath();
          ctx.moveTo(prevPoint.x, prevPoint.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }

        prevPoint = point;
      }

      if (meridianPhase < 1 && prevPoint) {
        ctx.fillStyle = hexToRgba(accentAlt, 0.9);
        ctx.shadowColor = accentAlt;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(prevPoint.x, prevPoint.y, 1.8, 0, 6.283);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // parallels
    for (let parallelIdx = -2; parallelIdx <= 2; parallelIdx++) {
      const parallelPhase = clamp(reveal * 5 - (parallelIdx + 2));

      if (parallelPhase <= 0) {
        continue;
      }

      const lat = (parallelIdx * Math.PI) / 6;
      let prevPoint: ProjPoint | null = null;

      for (let i = 0; i <= Math.floor(40 * parallelPhase); i++) {
        const point = projectLatLon(lat, (i / 40) * Math.PI * 2);

        if (prevPoint) {
          ctx.strokeStyle = hexToRgba(
            accent,
            segmentAlpha((point.z + prevPoint.z) / 2) * 0.85,
          );
          ctx.beginPath();
          ctx.moveTo(prevPoint.x, prevPoint.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }

        prevPoint = point;
      }
    }

    // latitude scan ring sweeping south → north
    {
      const scanLat = -Math.PI / 2 + ((elapsedSec * 0.3) % 1) * Math.PI;
      let prevPoint: ProjPoint | null = null;
      ctx.lineWidth = 1.4;

      for (let i = 0; i <= 40; i++) {
        const point = projectLatLon(scanLat, (i / 40) * Math.PI * 2);

        if (prevPoint) {
          ctx.strokeStyle = hexToRgba(
            accentAlt,
            0.08 + 0.38 * clamp((0.55 - point.z) / 1.1),
          );
          ctx.beginPath();
          ctx.moveTo(prevPoint.x, prevPoint.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }

        prevPoint = point;
      }

      ctx.lineWidth = 1;
    }

    // gyroscopic segmented rings
    const ringsPhase = ease((progress - 0.18) / 0.25);

    if (ringsPhase > 0) {
      ctx.save();
      ctx.globalAlpha = flickerAlpha * ringsPhase;

      function drawGyroRing(
        radius: number,
        tilt: number,
        spin: number,
        color: string,
        alpha: number,
        lineWidth: number,
      ): void {
        const cosRingTilt = Math.cos(tilt);
        const sinRingTilt = Math.sin(tilt);
        const cosSpin = Math.cos(spin);
        const sinSpin = Math.sin(spin);
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth = lineWidth;

        for (let seg = 0; seg < 8; seg++) {
          if (seg % 4 === 3) {
            continue;
          }

          ctx.beginPath();

          for (let sample = 0; sample <= 10; sample++) {
            const angle = ((seg * 10 + sample) / 80) * 6.283;
            const ringX = Math.cos(angle) * radius;
            const ringZ = Math.sin(angle) * radius;
            const tiltedY = -ringZ * sinRingTilt;
            const tiltedZ = ringZ * cosRingTilt;
            const spunX = ringX * cosSpin - tiltedY * sinSpin;
            const spunY = ringX * sinSpin + tiltedY * cosSpin;
            const point = project(spunX, spunY, tiltedZ);

            if (sample === 0) {
              ctx.moveTo(point.x, point.y);
            } else {
              ctx.lineTo(point.x, point.y);
            }
          }

          ctx.stroke();
        }
      }

      drawGyroRing(1.5, 1.05, elapsedSec * 0.6, accent, 0.5, 1.2);
      drawGyroRing(1.66, -0.85, -elapsedSec * 0.45, accentAlt, 0.3, 1);
      ctx.restore();
    }

    // hub nodes with ping ripples (front side only)
    const nodesPhase = ease((progress - 0.28) / 0.22);
    const nodePoints = nodes.map((hub) => {
      return { hub, point: projectLatLon(hub.lat, hub.lon) };
    });
    nodePoints.forEach((entry, i) => {
      const nodePhase = clamp(nodesPhase * nodes.length - i * 0.5);

      if (nodePhase <= 0) {
        return;
      }

      const point = entry.point;

      if (point.z > 0.12) {
        return;
      }

      const alpha = (0.4 + 0.55 * clamp(0.3 - point.z)) * nodePhase;
      ctx.fillStyle = hexToRgba(accentAlt, alpha);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2 * point.perspective, 0, 6.283);
      ctx.fill();
      const ring = (elapsedSec * 0.8 + entry.hub.phase) % 1;
      ctx.strokeStyle = hexToRgba(accentAlt, (1 - ring) * 0.5 * nodePhase);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, (2 + ring * 10) * point.perspective, 0, 6.283);
      ctx.stroke();
    });

    // rotating spotlight callout on a front-facing hub
    if (nodesPhase >= 1) {
      const spotlightIdx = Math.floor(elapsedSec / 2.2) % nodes.length;
      const spotlightNode = nodePoints[spotlightIdx];

      if (spotlightNode.point.z < 0) {
        const point = spotlightNode.point;
        const labelX = Math.min(Math.max(point.x + 14, 16), width - 130);
        ctx.strokeStyle = hexToRgba(accent, 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x + 12, point.y - 14);
        ctx.lineTo(labelX + 110, point.y - 14);
        ctx.stroke();
        ctx.font = `10px ${MONO}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = hexToRgba(accentAlt, 0.9);
        ctx.fillText(
          `${spotlightNode.hub.code} · NODE ${String(spotlightIdx + 1).padStart(2, "0")}`,
          labelX + 2,
          point.y - 20,
        );
        ctx.fillStyle = hexToRgba(accent, 0.7);
        ctx.fillText(
          "FLOW " +
            (120 +
              Math.round(
                90 * Math.sin(elapsedSec * 0.7 + spotlightNode.hub.phase) + 90,
              )) +
            "M/S",
          labelX + 2,
          point.y - 7,
        );
      }
    }

    // order-flow arcs between hubs
    if (progress > 0.36 && elapsedSec - lastArcSec > 0.5 && arcs.length < 6) {
      lastArcSec = elapsedSec;
      const fromHub = Math.floor(hashRandom(arcSeed++) * nodes.length);
      let toHub = Math.floor(hashRandom(arcSeed++) * nodes.length);

      if (toHub === fromHub) {
        toHub = (toHub + 4) % nodes.length;
      }

      arcs.push({
        fromHub,
        toHub,
        startSec: elapsedSec,
        durationSec: 1.5 + hashRandom(arcSeed++) * 0.8,
        buy: hashRandom(arcSeed++) > 0.45,
      });
      arcCount++;
    }

    for (let i = arcs.length - 1; i >= 0; i--) {
      const arc = arcs[i];
      const arcProgress = (elapsedSec - arc.startSec) / arc.durationSec;

      if (arcProgress >= 1) {
        arcs.splice(i, 1);
        continue;
      }

      const fromVec = hubToVector(nodes[arc.fromHub]);
      const toVec = hubToVector(nodes[arc.toHub]);
      const color = arc.buy ? buyColor : sellColor;
      ctx.strokeStyle = hexToRgba(color, 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let sample = 0; sample <= 20; sample++) {
        const point = projectArcPoint(sample / 20, fromVec, toVec);

        if (sample === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      ctx.strokeStyle = hexToRgba(color, 0.8);
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      const tailStart = Math.max(0, arcProgress - 0.18);

      for (let sample = 0; sample <= 8; sample++) {
        const point = projectArcPoint(
          tailStart + ((arcProgress - tailStart) * sample) / 8,
          fromVec,
          toVec,
        );

        if (sample === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }

      ctx.stroke();
      const head = projectArcPoint(arcProgress, fromVec, toVec);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 1.9, 0, 6.283);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (arcProgress > 0.88) {
        const point = projectArcPoint(1, fromVec, toVec);
        const ripple = (arcProgress - 0.88) / 0.12;
        ctx.strokeStyle = hexToRgba(color, 0.7 * (1 - ripple));
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2 + ripple * 9, 0, 6.283);
        ctx.stroke();
      }
    }

    // screen-space calibration ticks
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2;
      const on = (elapsedSec * 14) % 48 > i;
      ctx.strokeStyle = hexToRgba(accent, on ? 0.5 : 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(
        centerX + Math.cos(angle) * globeRadius * 1.86,
        centerY + Math.sin(angle) * globeRadius * 1.86,
      );
      ctx.lineTo(
        centerX + Math.cos(angle) * globeRadius * 1.93,
        centerY + Math.sin(angle) * globeRadius * 1.93,
      );
      ctx.stroke();
    }

    // telemetry + status banner
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexToRgba(accent, 0.7);
    ctx.fillText("◉ CORE SYNC · GLOBAL MESH", 20, 28);
    ctx.fillText(`NODES 10 · UPLINK ${Math.round(progress * 100)}%`, 20, 44);
    ctx.textAlign = "right";
    ctx.fillText(`YAW ${((yaw * 57.29) % 360).toFixed(1)}°`, width - 20, 28);
    ctx.fillStyle = hexToRgba(accentAlt, 0.7);
    ctx.fillText(`LINKS ${arcCount} · LIVE ${arcs.length}`, width - 20, 44);
    let statusText = "SPINNING UP CORE";
    let statusColor = accent;

    if (progress >= 0.32 && progress < 0.7) {
      statusText = "LINKING GLOBAL NODES";
    } else if (progress >= 0.7) {
      statusText = "MESH ONLINE ▸ HANDOFF";
      statusColor = accentAlt;
    }

    const bannerBlink =
      progress < 0.32 ? 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5)) : 1;
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hexToRgba(statusColor, 0.9 * bannerBlink);
    ctx.fillText(`▸ ${statusText} ◂`, centerX, 72);
    ctx.textAlign = "left";
    ctx.restore();
  };
}
