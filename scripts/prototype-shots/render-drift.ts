// Generates DRIFT.md — the page that makes app-vs-design drift readable.
//
//   pnpm prototype-shots:drift
//
// MARKDOWN, not HTML, and that is the whole point: the requirement is reading
// this on a PHONE, and github.com renders md with images for free. A committed
// html file would mean downloading a file or standing up hosting.
//
// Reads both PNG trees and writes the page. Captures nothing, and never touches
// the app goldens — they are an input here, and read-only everywhere.

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { APP_ONLY_IDS, SHOTS, type Shot } from "./shots";

const SHOTS_DIR = "docs/design/mobile/v1/reference-shots";
const APP_DIR =
  "packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl";

/** From DRIFT.md's own directory up to the repo root.
 *
 * FIVE levels: reference-shots -> v1 -> mobile -> design -> docs -> root. Four
 * was the first guess and it was wrong, and `check:doc-links` did NOT catch it
 * — it validates markdown links, not `<img src>` inside inline HTML, which is
 * what every image on this page is. Verified by resolving the paths on disk. */
const UP = "../../../../..";

/** Rendered width of each panel. Two of these sit side by side on a phone. */
const PANEL_PX = 300;

function hasAppGolden(shot: Shot): boolean {
  return existsSync(join(APP_DIR, `${shot.id}.png`));
}

function pairedRow(shot: Shot): string {
  // A registered app scenario whose golden was never captured is INFORMATION,
  // not an error: it says "nobody has pinned this yet", and rendering a broken
  // image instead would read as "the app has nothing here". Both current cases
  // are Phase 5a's open Task 11.
  const app = hasAppGolden(shot)
    ? `<img src="${UP}/${APP_DIR}/${shot.id}.png" width="${PANEL_PX}">`
    : "_app golden not captured yet_";

  return `| **${shot.id}** | ${app} | <img src="./${shot.id}.png" width="${PANEL_PX}"> |`;
}

function protoOnlyRow(shot: Shot): string {
  return `| **${shot.id}** | <img src="./${shot.id}.png" width="${PANEL_PX}"> |`;
}

function stripRow(shot: Shot): string {
  const instants = (shot.filmstrip ?? []).join(", ");

  return `| **${shot.id}** | ${instants} | <img src="./filmstrips/${shot.id}.png" width="620"> |`;
}

const paired = SHOTS.filter((shot) => {
  return shot.appTwin && shot.filmstrip === undefined;
});

const protoOnly = SHOTS.filter((shot) => {
  return !shot.appTwin && shot.filmstrip === undefined;
});

const strips = SHOTS.filter((shot) => {
  return shot.filmstrip !== undefined;
});

const uncaptured = paired.filter((shot) => {
  return !hasAppGolden(shot);
});

const doc = `# Design drift — app vs mobile-v1 prototype

> **Generated. Do not edit by hand** — run \`pnpm prototype-shots:drift\`.
>
> **This is not a test report.** The prototype is frozen: it cannot change and
> cannot break, so a difference here is *never* a failure. It measures how far
> the app has moved from the design, and where. See
> [the spec](${UP}/docs/superpowers/specs/2026-08-02-rn-prototype-deviation-corpus-design.md)
> and [the rules](README.md).

Both sides are 1206×2622 — the prototype's simulated screen is exactly the
iPhone 17 logical viewport — so the panels are directly comparable rather than
merely adjacent.

**One expected difference that is NOT drift:** the app column carries the real
iOS status bar and dynamic island; the prototype column does not, because those
are drawn by the simulated bezel outside the captured element. Hardware standing
in for hardware.

## Paired — ${paired.length} scenarios

${
  uncaptured.length === 0
    ? ""
    : `> **${uncaptured.length} of these have no app golden yet** — ${uncaptured
        .map((shot) => {
          return `\`${shot.id}\``;
        })
        .join(", ")}. They are registered in the app's \`SCENARIO_IDS\` with
> Maestro flows generated, but the PNGs were never captured (Phase 5a, Task 11).
> Until they are, this page cannot show the comparison for them.

`
}| scenario | app | prototype |
|---|---|---|
${paired.map(pairedRow).join("\n")}

## Prototype only — ${protoOnly.length}

Surfaces the app has no golden for. Not drift — design reference. \`rates/*\`
exists because that golden was never pinned; \`equities/*\` because the module is
not built yet, so these are Phase 5b's reference.

| scenario | prototype |
|---|---|
${protoOnly.map(protoOnlyRow).join("\n")}

## Ceremony filmstrips — ${strips.length}

One ceremony, sampled at several instants, left to right. Prototype only: the
app side of a motion reference needs a booted simulator and a human, which is
the dependency this corpus exists to remove.

| ceremony | instants (s) | prototype |
|---|---|---|
${strips.map(stripRow).join("\n")}

## App only — ${APP_ONLY_IDS.length}

The app has these; the design never specified them. Worth knowing: a corpus that
only looked for missing app surfaces would never surface this direction.

${APP_ONLY_IDS.map((id) => {
  return `- \`${id}\``;
}).join("\n")}
`;

writeFileSync(join(SHOTS_DIR, "DRIFT.md"), doc);
console.log(
  `DRIFT.md: ${paired.length} paired, ${protoOnly.length} prototype-only, ${strips.length} strips, ${APP_ONLY_IDS.length} app-only`,
);

if (uncaptured.length > 0) {
  console.log(
    `  note: ${uncaptured.length} paired shots have no app golden yet (${uncaptured
      .map((shot) => {
        return shot.id;
      })
      .join(", ")})`,
  );
}
