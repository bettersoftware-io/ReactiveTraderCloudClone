import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(
  __dirname,
  "../../../scripts/pages/build-visual-report.mjs",
);

let tmp = "";
afterEach(() => {
  if (tmp !== "") {
    rmSync(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

describe("build-visual-report — green path", () => {
  it("emits an all-green page when no -diff.png images exist", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    // A tier ran and passed: report dir exists, but no diff images.
    put(join(react, "reports/ui/visual/playwright/react/report/index.html"));

    execFileSync("node", [
      SCRIPT,
      "--out",
      out,
      "--react",
      react,
      "--sha",
      "abc1234",
      "--branch",
      "main",
    ]);

    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).toContain("All visual tiers green");
    expect(html).toContain("abc1234");
    expect(html).not.toContain("assets/");
    // A green run must not physically copy anything — no assets, no
    // (potentially multi-MB) native tier report bundles.
    expect(existsSync(join(out, "assets"))).toBe(false);
    expect(existsSync(join(out, "reports"))).toBe(false);
  });

  it("renders an honest failure page (not green) when a tier fails without producing diff images", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    // A tier crashed (build error/timeout) before writing any -diff.png, but
    // it did manage to write its native report.
    put(join(react, "reports/ui/visual/playwright/react/report/index.html"));

    execFileSync("node", [
      SCRIPT,
      "--out",
      out,
      "--react",
      react,
      "--sha",
      "abc1234",
      "--branch",
      "main",
      "--failed",
      "client-react",
    ]);

    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).not.toContain("All visual tiers green");
    expect(html).toContain("failed");
    expect(html).toContain("reports/client-react/playwright/index.html");
    expect(
      existsSync(join(out, "reports/client-react/playwright/index.html")),
    ).toBe(true);
  });
});

describe("build-visual-report — failure wall", () => {
  it("renders a triple + report link per failed scenario, copying assets", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    const solid = join(tmp, "client-solid");

    // Playwright tier (react): artifacts carry -expected/-actual/-diff together.
    const pwArt = join(
      react,
      "reports/ui/visual/playwright/react/artifacts/fx",
    );
    put(join(pwArt, "fx-tile-stale-expected.png"));
    put(join(pwArt, "fx-tile-stale-actual.png"));
    put(join(pwArt, "fx-tile-stale-diff.png"));
    put(join(react, "reports/ui/visual/playwright/react/report/index.html"));

    // vitest-browser tier (react): -actual/-diff sit next to the golden
    // <base>.png, under the shared @rtc/ui-contract goldens tree (a workspace
    // sibling of client-react — see scanPackage's extraDirs doc comment).
    const vbShots = join(
      tmp,
      "ui-contract/goldens/vitest-browser/__screenshots__/react/visual.spec.tsx",
    );
    put(join(vbShots, "analytics-empty.png")); // golden = reference
    put(join(vbShots, "analytics-empty-actual.png"));
    put(join(vbShots, "analytics-empty-diff.png"));

    // Solid tier: its own artifacts tree.
    const solidArt = join(
      solid,
      "reports/ui/visual/playwright/solid/artifacts/app",
    );
    put(join(solidArt, "app-fx-system-expected.png"));
    put(join(solidArt, "app-fx-system-actual.png"));
    put(join(solidArt, "app-fx-system-diff.png"));

    execFileSync("node", [
      SCRIPT,
      "--out",
      out,
      "--react",
      react,
      "--solid",
      solid,
      "--sha",
      "def5678",
      "--branch",
      "main",
    ]);

    const html = readFileSync(join(out, "index.html"), "utf8");
    // Every failing scenario appears.
    expect(html).toContain("fx-tile-stale");
    expect(html).toContain("analytics-empty");
    expect(html).toContain("app-fx-system");
    // Grouped by package + tier — assert the rendered `<h2>` tier-label
    // headings themselves (not just substring presence anywhere in the page,
    // which the scenario `group` field — a relative path that can itself
    // contain a tier name, e.g. the extraDirs-discovered
    // `../ui-contract/goldens/vitest-browser/__screenshots__/...` — would
    // also satisfy even if `tierOf()` mislabeled the heading as "unknown").
    expect(html).toContain("<h2>client-react · playwright ");
    expect(html).toContain("<h2>client-react · vitest-browser ");
    expect(html).toContain("<h2>client-solid · playwright ");
    // before/after/diff labels present.
    expect(html).toContain("reference");
    expect(html).toContain("actual");
    expect(html).toContain("diff");
    // Drill-through to the native report was copied + linked.
    expect(html).toContain("reports/client-react/playwright/index.html");
    // Assets were physically copied into the site.
    expect(
      readFileSync(
        join(
          out,
          "assets/client-react/reports/ui/visual/playwright/react/artifacts/fx/fx-tile-stale-diff.png",
        ),
        "utf8",
      ),
    ).toBe("x");
  });

  it("resolves the vitest-browser golden as the reference image", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    // Shared @rtc/ui-contract goldens tree — a workspace sibling of
    // client-react (see scanPackage's extraDirs doc comment).
    const vbShots = join(
      tmp,
      "ui-contract/goldens/vitest-browser/__screenshots__/react/visual.spec.tsx",
    );
    put(join(vbShots, "tile-loading.png"), "REF");
    put(join(vbShots, "tile-loading-actual.png"), "ACT");
    put(join(vbShots, "tile-loading-diff.png"), "DIF");

    execFileSync("node", [SCRIPT, "--out", out, "--react", react]);

    // The golden <base>.png was copied as the reference asset. `relative()`
    // climbs out of client-react into the sibling ui-contract dir, and
    // `join(label, "../ui-contract/...")` cancels the label prefix back out —
    // see copyAsset/scanPackage.
    const refAsset = join(
      out,
      "assets/ui-contract/goldens/vitest-browser/__screenshots__/react/visual.spec.tsx/tile-loading.png",
    );
    expect(readFileSync(refAsset, "utf8")).toBe("REF");
  });

  it("still copies + links a fully-green sibling package's tier report", () => {
    tmp = mkdtempSync(join(tmpdir(), "vr-"));
    const out = join(tmp, "visual");
    const react = join(tmp, "client-react");
    const solid = join(tmp, "client-solid");

    // react: one failing scenario.
    const pwArt = join(
      react,
      "reports/ui/visual/playwright/react/artifacts/fx",
    );
    put(join(pwArt, "fx-tile-stale-expected.png"));
    put(join(pwArt, "fx-tile-stale-actual.png"));
    put(join(pwArt, "fx-tile-stale-diff.png"));
    put(join(react, "reports/ui/visual/playwright/react/report/index.html"));

    // solid: fully green — a valid report, but no -diff.png anywhere.
    put(join(solid, "reports/ui/visual/playwright/solid/report/index.html"));

    execFileSync("node", [
      SCRIPT,
      "--out",
      out,
      "--react",
      react,
      "--solid",
      solid,
    ]);

    const html = readFileSync(join(out, "index.html"), "utf8");
    // The green sibling's report is still linked in the "Full tier reports" footer.
    expect(html).toContain("reports/client-solid/playwright/index.html");
    // ...and was physically copied.
    expect(
      existsSync(join(out, "reports/client-solid/playwright/index.html")),
    ).toBe(true);
  });
});

// Writes a file (and any parent dirs), returning its path. Content is a tiny
// non-empty PNG-ish byte so copies are observable; the generator never decodes.
function put(path: string, content = "x"): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}
