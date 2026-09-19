import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

  it("insets every LEAF view by half the gutter — the gap-0 model's other half", () => {
    // createDockEngine's theme deliberately carries no dockview `gap` (its
    // render-time shave made every model size fractional); the 7px gutter
    // exists only through this rule, so losing it would fuse the cards
    // edge-to-edge while every jsdom size assertion stayed green. The
    // `> .dv-groupview` scoping keeps branch views (nested splits) uninset,
    // or the gutter would compound with tree depth.
    const body = declarationsOf(
      ".dockview-theme-rtc .dv-view:has(> .dv-groupview)",
    );

    expect(body).toMatch(/^\s*padding:\s*3\.5px;/m);
    expect(body).toMatch(/^\s*box-sizing:\s*border-box;/m);
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

describe("floating groups (Phase 6a) — skin-proof surface painting", () => {
  it("gives a floating group's box an OPAQUE base and a lifted shadow", () => {
    const body = declarationsOf(".dockview-theme-rtc .dv-resize-container");

    // A float sits over OTHER panels, and the glass skins' `--panel` is
    // translucent by design (holo `rgba(6,26,38,0.5)`): painted on the box,
    // the content of the panel underneath read straight through the float.
    // The box carries a token that is a solid colour in every skin; the card
    // inside it (`.dv-groupview`, asserted above) still lays the skin's own
    // `--panel` over that base, so glass skins keep their look.
    expect(body).toMatch(
      new RegExp(
        `^\\s*background:\\s*var\\((${OPAQUE_BASE_TOKENS.join("|")})[,)]`,
        "m",
      ),
    );

    // And never a translucent or image-valued surface token in its place.
    for (const token of IMAGE_VALUED_TOKENS) {
      expect(body).not.toMatch(new RegExp(`var\\(${token}[,)]`));
    }

    expect(body).not.toMatch(/background-color/);
    expect(body).toMatch(/^\s*box-shadow:/m);
    expect(body).toMatch(/^\s*border-radius:\s*6px;/m);
  });

  // The float's resize handles straddle its edge (2px outside it) and are
  // stacked by dockview through a self-referencing custom property that
  // resolves to `z-index: auto`, leaving them under the float's content. Both
  // halves had to be undone for a float to resize at all: no clip on the box,
  // and an explicit stacking for the handles.
  it("leaves the float's resize handles reachable: no clip on the box, handles stacked above its content", () => {
    const box = declarationsOf(".dockview-theme-rtc .dv-resize-container");
    const handles = declarationsOf(
      '.dockview-theme-rtc .dv-resize-container > [class*="dv-resize-handle-"]',
    );

    expect(box).not.toMatch(/overflow/);
    expect(handles).toMatch(/^\s*z-index:\s*1;/m);
  });

  it("gives the float's resize edges a hover affordance, scoped to the float's box", () => {
    expect(css).toMatch(
      /\.dv-resize-container \.dv-resize-handle-top:hover,[\s\S]{0,300}\.dv-resize-container \.dv-resize-handle-right:hover\s*\{[^}]*background:\s*var\(--border-strong/,
    );
    // Every handle selector carries the prefix, not just the first and last.
    expect(css).not.toMatch(
      /\.dockview-theme-rtc \.dv-resize-handle-(top|bottom|left|right):hover/,
    );
  });
});

describe("stacked tabs (Phase 2)", () => {
  it("collapses an inactive stacked tab to its muted title chip", () => {
    expect(css).toMatch(
      /\.dv-tab\.dv-inactive-tab \[data-panel-title\] > \* \{[^}]*display: none/,
    );
    expect(css).toMatch(
      /\.dv-tab\.dv-inactive-tab \[data-panel-title\]::before \{[^}]*content: attr\(data-panel-title\)/,
    );
  });

  it("separates stacked tabs and seats the active one only in multi-tab bars", () => {
    expect(css).toMatch(
      /\.dv-tab \+ \.dv-tab \{[^}]*border-inline-start: 1px solid/,
    );
    expect(css).toMatch(
      /:has\(\.dv-tab \+ \.dv-tab\)\s+\.dv-tab\.dv-active-tab\s*\{[^}]*inset 0 -2px 0 0/,
    );
  });
});

function declarationsOf(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule for "${selector}"`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("}", start);

  return css.slice(start + selector.length + 2, end);
}

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

/** Tokens that are an opaque plain colour in EVERY skin and mode — the page
 *  ground (packages/client-react/src/ui/shell/theme/tokens.ts: every
 *  `--bg-primary` / `--bg-secondary` cell is a `#rrggbb` hex, while
 *  `--panel` / `--bg-tile` are `rgba(…)` or gradients in the glass skins). */
const OPAQUE_BASE_TOKENS = ["--bg-primary", "--bg-secondary"];

/** Tokens that are gradient IMAGES in at least one skin
 *  (packages/client-react/src/ui/shell/theme/tokens.ts, the 3D skins). */
const IMAGE_VALUED_TOKENS = ["--panel", "--panel-head", "--tile", "--chip"];
