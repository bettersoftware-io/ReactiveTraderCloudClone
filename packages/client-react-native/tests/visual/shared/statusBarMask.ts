import { PNG } from "pngjs";

import type { Platform } from "./platform.ts";

/**
 * How many rows at the top of a shot belong to the system's status bar and are
 * painted black before the shot is compared or stored.
 *
 * Android: 142, the `statusBars` inset `dumpsys window` reports on the pinned
 * Pixel 10a (1080x2424). The bar is System UI's, not ours, and it does not
 * reproduce: between two boots of the same emulator the clock sat 43 px
 * further right and the mobile-signal glyph showed one bar instead of three —
 * about 0.05% of the frame, in all 26 scenarios at once (measured 2026-10-05).
 * System UI's demo mode was tried first and pinned the clock's text and the
 * battery, but neither of those two. At 0.05% the bar alone is the size of a
 * real change (`shell/connection-banner`'s whole rewrite is 0.0833%), so it
 * cannot be absorbed by a tolerance.
 *
 * The cost is stated rather than hidden: the app draws edge to edge, so its
 * own background behind the bar is masked too, and a change confined to those
 * rows goes unseen on Android.
 *
 * iOS: 0. `simctl status_bar override` holds the simulator's bar still, and
 * its goldens reproduce exactly with the bar in frame.
 */
export const STATUS_BAR_ROWS: Record<Platform, number> = {
  ios: 0,
  android: 142,
};

/** Paints the top `rows` rows opaque black — the same treatment `simctl`'s
 * `--mask=black` gives the device mask on the other tier. */
export function maskTopRows(png: Buffer, rows: number): Buffer {
  if (rows === 0) {
    return png;
  }

  const image = PNG.sync.read(png);
  const end = Math.min(rows, image.height) * image.width * 4;

  for (let offset = 0; offset < end; offset += 4) {
    image.data[offset] = 0;
    image.data[offset + 1] = 0;
    image.data[offset + 2] = 0;
    image.data[offset + 3] = 255;
  }

  return PNG.sync.write(image);
}
