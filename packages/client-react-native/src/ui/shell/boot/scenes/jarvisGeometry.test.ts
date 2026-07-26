import { expect, test } from "vitest";

import {
  crossLinkPhase,
  fragmentAlpha,
  fragmentGlitch,
  fragmentIsLunging,
  fragmentLabel,
  fragmentRevealPhase,
  fragmentZ,
  JARVIS_MIN_PERSPECTIVE_DENOM,
  JARVIS_PERSPECTIVE_K,
  JARVIS_RING_LABELS,
  JARVIS_RINGS,
  jarvisBlinkAlpha,
  jarvisFlicker,
  jarvisFragments,
  jarvisParticles,
  jarvisPitch,
  jarvisStatus,
  jarvisTelemetry,
  jarvisYaw,
  lungeAmount,
  lungeFragmentIndex,
  particleAlpha,
  particleDriftY,
  ringPhase,
  ringZPlane,
  shownFragmentCount,
  sphereBob,
  spherePhase,
  sphereRadius,
  spokesPhase,
  spokeZPlane,
} from "./jarvisGeometry";

const FRAGMENTS = jarvisFragments();
const PARTICLES = jarvisParticles();

// ── build-once tables ───────────────────────────────────────────────────────

test("there are fourteen blueprint fragments, deterministic across calls", () => {
  expect(FRAGMENTS).toHaveLength(14);
  expect(jarvisFragments()).toStrictEqual(FRAGMENTS);
});

test("fragments are scattered in depth and cycle the five card kinds", () => {
  const kinds = new Set(
    FRAGMENTS.map((fragment) => {
      return fragment.kind;
    }),
  );

  expect(kinds.size).toBe(5);
  expect(
    Math.max(
      ...FRAGMENTS.map((fragment) => {
        return fragment.baseZ;
      }),
    ),
  ).toBeGreaterThan(0);
  expect(
    Math.min(
      ...FRAGMENTS.map((fragment) => {
        return fragment.baseZ;
      }),
    ),
  ).toBeLessThan(0);
});

test("fragments reveal in sequence across the second half of the boot", () => {
  for (let i = 1; i < FRAGMENTS.length; i++) {
    expect(FRAGMENTS[i].revealAt).toBeGreaterThan(FRAGMENTS[i - 1].revealAt);
  }

  expect(FRAGMENTS[0].revealAt).toBeCloseTo(0.34);
});

test("every fragment carries an ND- node id", () => {
  for (const fragment of FRAGMENTS) {
    expect(fragment.id).toMatch(/^ND-\d+$/);
  }
});

test("there are 55 dust particles, deterministic across calls", () => {
  expect(PARTICLES).toHaveLength(55);
  expect(jarvisParticles()).toStrictEqual(PARTICLES);
});

test("the six ring layers grow outward and sweep in one after another", () => {
  expect(JARVIS_RINGS).toHaveLength(6);

  for (let i = 1; i < JARVIS_RINGS.length; i++) {
    expect(JARVIS_RINGS[i].radius).toBeGreaterThan(JARVIS_RINGS[i - 1].radius);
    expect(JARVIS_RINGS[i].revealAt).toBeGreaterThan(
      JARVIS_RINGS[i - 1].revealAt,
    );
  }
});

test("each ring layer has a distinct kind", () => {
  expect(
    new Set(
      JARVIS_RINGS.map((ring) => {
        return ring.kind;
      }),
    ).size,
  ).toBe(JARVIS_RINGS.length);
});

test("the dashed ring carries the web's three labels verbatim", () => {
  expect(JARVIS_RING_LABELS).toStrictEqual([
    "CL/7 PRICING",
    "RISK CORE",
    "ORDER MESH",
  ]);
});

// ── camera ──────────────────────────────────────────────────────────────────

// `bootJarvis.ts:166` is `1 / Math.max(0.4, 1 + depthZ * 0.3)` — clamped, and
// the steepest k of the five projected scenes.
test("jarvis projects with the steepest k, and a clamped near plane", () => {
  expect(JARVIS_PERSPECTIVE_K).toBe(0.3);
  expect(JARVIS_MIN_PERSPECTIVE_DENOM).toBe(0.4);
});

test("the camera sways continuously and responds to drift", () => {
  expect(jarvisYaw(0, 0)).toBeCloseTo(0.55);
  expect(jarvisYaw(0, 1)).toBeGreaterThan(jarvisYaw(0, -1));
  expect(jarvisPitch(0, 0)).toBeCloseTo(0.3);
  expect(jarvisPitch(0, 1)).toBeGreaterThan(jarvisPitch(0, -1));
});

// Unlike `layers`, jarvis's camera is NOT scaled by any envelope — it sways
// from the first frame, so the scene is never square-on.
test("the camera sways even at rest, never sitting square-on", () => {
  expect(jarvisYaw(3, 0)).not.toBeCloseTo(jarvisYaw(0, 0));
});

// ── the shared ring Z-plane (the hazard) ────────────────────────────────────

// The ring machinery shares one wobbling Z-plane, assigned to a mutable
// closure variable in the web. Porting it as a pure function is correct;
// silently pinning it to 0 is the failure mode, and it looks almost right —
// the rings would simply sit flat instead of breathing.
test("the shared ring Z-plane wobbles rather than sitting flat", () => {
  const samples = Array.from({ length: 200 }, (_, i) => {
    return ringZPlane(i / 20, 0);
  });

  expect(Math.max(...samples)).toBeGreaterThan(0);
  expect(Math.min(...samples)).toBeLessThan(0);
});

test("each ring breathes on its own offset, so they do not move as one", () => {
  expect(ringZPlane(1, 0)).not.toBeCloseTo(ringZPlane(1, 1));
});

// Compared across a range, not at one instant: the two curves have different
// frequency, phase AND amplitude, but they cross, so a single sample can land
// anywhere — including close enough to pass a naive not-equal assertion.
test("the spokes breathe on a different plane from the rings", () => {
  let maxGap = 0;

  for (let step = 0; step < 200; step++) {
    const t = step / 10;
    maxGap = Math.max(maxGap, Math.abs(spokeZPlane(t) - ringZPlane(t, 0)));
  }

  expect(maxGap).toBeGreaterThan(0.05);
});

// ── schedules ───────────────────────────────────────────────────────────────

test("the core sphere grows first, before any ring sweeps in", () => {
  expect(spherePhase(0.08)).toBeGreaterThan(0);
  expect(ringPhase(JARVIS_RINGS[0], 0.05)).toBe(0);
  expect(sphereRadius(1)).toBeCloseTo(0.2);
});

test("the sphere bobs along Z rather than sitting still", () => {
  const samples = Array.from({ length: 100 }, (_, i) => {
    return sphereBob(i / 8);
  });

  expect(Math.max(...samples)).toBeGreaterThan(0.05);
  expect(Math.min(...samples)).toBeLessThan(-0.05);
});

test("the spokes extend in the middle of the boot", () => {
  expect(spokesPhase(0.22)).toBe(0);
  expect(spokesPhase(0.5)).toBe(1);
});

test("cross-links appear only late, once fragments are placed", () => {
  expect(crossLinkPhase(0.6)).toBe(0);
  expect(crossLinkPhase(0.8)).toBe(1);
});

// ── fragments ───────────────────────────────────────────────────────────────

test("one fragment lunges at a time, cycling through all fourteen", () => {
  const seen = new Set<number>();

  for (let step = 0; step < 400; step++) {
    const index = lungeFragmentIndex(step / 8);

    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(14);
    seen.add(index);
  }

  expect(seen.size).toBe(14);
});

test("a lunge is a smooth out-and-back within [0, 1]", () => {
  let peak = 0;

  for (let step = 0; step < 200; step++) {
    const amount = lungeAmount(step / 50);

    expect(amount).toBeGreaterThanOrEqual(0);
    expect(amount).toBeLessThanOrEqual(1);
    peak = Math.max(peak, amount);
  }

  expect(peak).toBeGreaterThan(0.95);
});

test("nothing lunges before the boot is nearly half done", () => {
  expect(fragmentIsLunging(lungeFragmentIndex(2), 2, 0.4)).toBe(false);
  expect(fragmentIsLunging(lungeFragmentIndex(2), 2, 0.5)).toBe(true);
});

// The cross-link pass reads EVERY fragment's z, including ones that have not
// revealed yet. The web resets those to baseZ; collapsing that branch would
// attach the links at the wrong depths — visible only as slightly wrong lines.
test("an un-revealed fragment sits at its base depth, not a breathing one", () => {
  const fragment = FRAGMENTS[13];

  expect(fragmentRevealPhase(fragment, 0.1)).toBe(0);
  expect(fragmentZ(fragment, 13, 3.3, 0.1)).toBe(fragment.baseZ);
});

test("a revealed fragment breathes around its base depth", () => {
  const fragment = FRAGMENTS[0];
  const samples = Array.from({ length: 200 }, (_, i) => {
    return fragmentZ(fragment, 0, i / 10, 0.44);
  });

  expect(Math.max(...samples)).toBeGreaterThan(fragment.baseZ);
  expect(Math.min(...samples)).toBeLessThan(fragment.baseZ);
});

test("the lunging fragment comes closer than it ever breathes", () => {
  const index = lungeFragmentIndex(2.4);
  const fragment = FRAGMENTS[index];
  const lunged = fragmentZ(fragment, index, 2.4, 0.6);
  const breathingFloor = fragment.baseZ - fragment.zAmplitude;

  expect(lunged).toBeLessThan(breathingFloor);
});

test("the glitch jitter fades out as a fragment finishes revealing", () => {
  expect(fragmentGlitch(0, 1, 2)).toBe(0);
  expect(Math.abs(fragmentGlitch(0, 0.2, 2))).toBeGreaterThan(0);
});

test("fragment alpha never exceeds 1, even mid-lunge", () => {
  for (let step = 0; step < 200; step++) {
    const alpha = fragmentAlpha(-0.7, 1, true, step / 20);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("nearer fragments read stronger", () => {
  expect(fragmentAlpha(-0.5, 1, false, 0)).toBeGreaterThan(
    fragmentAlpha(0.5, 1, false, 0),
  );
});

test("the shown count grows across the boot and reaches every fragment", () => {
  expect(shownFragmentCount(FRAGMENTS, 0.1)).toBe(0);
  expect(shownFragmentCount(FRAGMENTS, 0.5)).toBeGreaterThan(0);
  expect(shownFragmentCount(FRAGMENTS, 1)).toBe(14);
});

test("a fragment label carries its id and depth", () => {
  expect(fragmentLabel(FRAGMENTS[0], -0.13)).toBe(`${FRAGMENTS[0].id} · Z-13`);
});

// ── particles, flicker ──────────────────────────────────────────────────────

test("particles drift and wrap rather than escaping the frame", () => {
  const particle = PARTICLES[0];
  const samples = Array.from({ length: 300 }, (_, i) => {
    return particleDriftY(particle, i / 4);
  });

  expect(Math.max(...samples)).toBeLessThanOrEqual(particle.y + 0.25001);
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(particle.y - 0.25001);
});

test("particle alpha stays faint and never negative", () => {
  for (let step = 0; step < 200; step++) {
    const alpha = particleAlpha(PARTICLES[3], step / 5);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(0.22);
  }
});

test("the whole-frame flicker stays within the web's alpha band", () => {
  for (let i = 0; i < 600; i++) {
    const alpha = jarvisFlicker(i / 40);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("the flicker occasionally drops the frame to a dim dropout", () => {
  const samples = Array.from({ length: 4000 }, (_, i) => {
    return jarvisFlicker(i / 20);
  });

  expect(Math.min(...samples)).toBeLessThan(0.6);
});

// ── telemetry, status ───────────────────────────────────────────────────────

test("telemetry uses the substituted bullet, never the web's fisheye", () => {
  const telemetry = jarvisTelemetry(5, 0, 0);

  expect(telemetry.title).not.toContain("◉");
  expect(telemetry.title).toContain("●");
  expect(telemetry.title).toContain("HOLO CORE");
});

test("the element count offsets the shown fragments by the web's 15", () => {
  expect(jarvisTelemetry(0, 0, 0).elements).toBe(
    "ELEMENTS 15 / 29 · DEPTH FIELD ON",
  );
  expect(jarvisTelemetry(14, 0, 0).elements).toBe(
    "ELEMENTS 29 / 29 · DEPTH FIELD ON",
  );
});

test("telemetry reports both axes in degrees", () => {
  expect(jarvisTelemetry(0, 0, 0).orientation).toBe("YAW 0.0°  PITCH 0.0°");
});

test("the status ladder walks its three states in order", () => {
  expect(jarvisStatus(0.1).text).toBe("PROJECTING SCHEMATIC");
  expect(jarvisStatus(0.5).text).toBe("LINKING SUBSYSTEMS");
  expect(jarvisStatus(0.8).text).toBe("HOLOGRAM STABLE ▸ HANDOFF");
});

test("only the final status switches to the alt accent", () => {
  expect(jarvisStatus(0.1).useAltAccent).toBe(false);
  expect(jarvisStatus(0.8).useAltAccent).toBe(true);
});

test("the banner blinks only while projecting, then holds solid", () => {
  expect(jarvisBlinkAlpha(0.5, 0.3)).toBe(1);

  const blinking = Array.from({ length: 60 }, (_, i) => {
    return jarvisBlinkAlpha(0.1, i / 10);
  });

  expect(Math.min(...blinking)).toBeLessThan(0.99);
  expect(Math.min(...blinking)).toBeGreaterThanOrEqual(0.55);
});
