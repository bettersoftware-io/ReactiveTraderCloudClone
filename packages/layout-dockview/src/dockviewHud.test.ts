import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/* dockview-hud.css is consumed by both web clients, and its one job is to
 * make dockview's chrome read as the in-house panel chrome under EVERY skin.
 * The pixel tiers are the real witness; these text-level checks pin the two
 * mechanics a future edit is most likely to undo, because each looked like a
 * harmless simplification the first time round:
 *
 * - The panel card and head must be painted through the `background`
 *   SHORTHAND. Four skins (holo3d / terminal3d, dark and light) define
 *   `--panel` and `--panel-head` as `linear-gradient(...)` images, and a
 *   gradient is not a <color>: a `background-color: var(--panel)` — which is
 *   how dockview's base sheet applies its `--dv-*-background-color`
 *   variables — is invalid at computed-value time and paints NOTHING, so the
 *   page backdrop showed through every panel body.
 * - Those image-valued tokens must therefore never be routed into a `--dv-*`
 *   variable at all; the variables get the skins' plain-colour surface
 *   tokens instead.
 *
 * jsdom does not model invalid-at-computed-value custom properties, so the
 * stylesheet text is the only unit-level handle on this. */
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles", "dockview-hud.css"),
  "utf8",
);

/** Tokens that are gradient IMAGES in at least one skin
 *  (packages/client-react/src/ui/shell/theme/tokens.ts, the 3D skins). */
const IMAGE_VALUED_TOKENS = ["--panel", "--panel-head", "--tile", "--chip"];

describe("dockview-hud.css — skin-proof surface painting", () => {
  it("paints the group card with `background: var(--panel …)` (shorthand)", () => {
    const body = declarationsOf(".dockview-theme-rtc .dv-groupview");

    expect(body).toMatch(/^\s*background:\s*var\(--panel[,)]/m);
    expect(body).not.toMatch(/background-color/);
  });

  it("paints the head bar with `background: var(--panel-head …)` (shorthand)", () => {
    const body = declarationsOf(
      ".dockview-theme-rtc .dv-tabs-and-actions-container",
    );

    expect(body).toMatch(/^\s*background:\s*var\(--panel-head[,)]/m);
    expect(body).not.toMatch(/background-color/);
  });

  it("keeps the dock root transparent, like the in-house `.engine`", () => {
    const body = declarationsOf(".dockview-theme-rtc.dv-dockview");

    expect(body).toMatch(/^\s*background:\s*transparent;/m);
  });

  it("never routes an image-valued token into a `--dv-*` variable", () => {
    const themeBlock = declarationsOf(".dockview-theme-rtc");
    const dvAssignments = themeBlock.match(/--dv-[a-z-]+:\s*[^;]+;/g) ?? [];

    expect(dvAssignments.length).toBeGreaterThan(0);

    for (const assignment of dvAssignments) {
      for (const token of IMAGE_VALUED_TOKENS) {
        expect(assignment).not.toMatch(new RegExp(`var\\(${token}[,)]`));
      }
    }
  });
});

function declarationsOf(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule for "${selector}"`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("}", start);

  return css.slice(start + selector.length + 2, end);
}
