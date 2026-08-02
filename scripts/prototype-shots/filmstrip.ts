// Builds the ceremony filmstrips: one PNG per ceremony, the same animation
// sampled at several instants and laid out left to right.
//
//   pnpm prototype-shots:filmstrips --out /tmp/proto-scratch
//
// A still cannot show a ceremony, and video breaks the mirrored-PNG model that
// makes the corpus readable on a phone — a strip keeps both. These are
// PROTOTYPE-ONLY: the app side of a motion reference needs a booted simulator
// and a human, which is the exact dependency this corpus exists to remove.
//
// Composed in a headless page rather than by an image library, so the corpus
// adds no image-processing dependency.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { type Browser, chromium } from "playwright";

import { argOf, driveToShot } from "./capture";
import { SHOTS, type Shot } from "./shots";

/** Height each frame is drawn at in the strip. The frames are 1206x2622
 * natively; four of those side by side is unreadable on a phone. */
const FRAME_HEIGHT_PX = 874;

/** 1206x2622 scaled to 874 tall is 402 wide — the phone's logical width. */
const FRAME_WIDTH_PX = 402;

/** Capture ONE ceremony, sampled at each pinned instant.
 *
 * A single page driven once, not a fresh context per instant. The obvious
 * alternative — restart the ceremony for every frame — assumes the underlying
 * data is deterministic, and it is not: the Credit RFQ list is a live
 * simulator, so four independent runs produced four DIFFERENT ceremonies. The
 * first strip built that way showed an ACCEPTED card in frames 1-2 and no such
 * card at all in frames 3-4, which reads as a bug in the design rather than as
 * the passage of time.
 *
 * Timing is scheduled against an absolute start rather than by sleeping the
 * deltas, so the ~100-300ms each screenshot costs does not accumulate into the
 * later frames.
 *
 * `skipSettle` matters here too — the instants are measured from the TRIGGER,
 * and the usual 500ms settle would shift every frame of a ceremony that only
 * runs for ~2s. */
async function frameData(browser: Browser, shot: Shot): Promise<string[]> {
  const instants = shot.filmstrip ?? [];
  const page = await driveToShot(browser, shot, { skipSettle: true });
  const startedAt = Date.now();
  const frames: string[] = [];

  for (const at of instants) {
    const remaining = startedAt + at * 1000 - Date.now();

    if (remaining > 0) {
      await page.waitForTimeout(remaining);
    }

    const buffer = await page.locator("[data-theme-root]").first().screenshot();

    frames.push(buffer.toString("base64"));
  }

  await page.context().close();

  return frames;
}

export async function buildFilmstrips(outDir: string): Promise<void> {
  const strips = SHOTS.filter((shot) => {
    return shot.filmstrip !== undefined;
  });
  const browser = await chromium.launch();

  try {
    for (const shot of strips) {
      const frames = await frameData(browser, shot);
      // The viewport must be sized to the STRIP, not left at Playwright's
      // 1280x720 default — a body screenshot is clipped to the viewport, which
      // silently truncated both the fourth frame and the bottom 150px of every
      // frame on the first run.
      const context = await browser.newContext({
        viewport: {
          width: frames.length * FRAME_WIDTH_PX,
          height: FRAME_HEIGHT_PX,
        },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      await page.setContent(
        `<body style="margin:0;display:flex;background:#000">${frames
          .map((encoded) => {
            return `<img src="data:image/png;base64,${encoded}" style="height:${FRAME_HEIGHT_PX}px">`;
          })
          .join("")}</body>`,
      );

      const file = join(outDir, "filmstrips", `${shot.id}.png`);
      mkdirSync(dirname(file), { recursive: true });
      await page.locator("body").screenshot({ path: file });
      await context.close();

      console.log(`filmstrip ${shot.id} (${frames.length} frames) → ${file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("filmstrip.ts")) {
  buildFilmstrips(
    argOf("--out") ?? "docs/design/mobile/v1/reference-shots",
  ).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
