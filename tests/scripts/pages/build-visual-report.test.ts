import { execFileSync } from "node:child_process";
import {
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

    // vitest-browser tier (react): -actual/-diff sit next to the golden <base>.png.
    const vbShots = join(
      react,
      "tests/ui/visual/vitest-browser/__screenshots__/react/visual.spec.tsx",
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
    // Grouped by package + tier.
    expect(html).toContain("client-react");
    expect(html).toContain("client-solid");
    expect(html).toContain("playwright");
    expect(html).toContain("vitest-browser");
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
    const vbShots = join(
      react,
      "tests/ui/visual/vitest-browser/__screenshots__/react/visual.spec.tsx",
    );
    put(join(vbShots, "tile-loading.png"), "REF");
    put(join(vbShots, "tile-loading-actual.png"), "ACT");
    put(join(vbShots, "tile-loading-diff.png"), "DIF");

    execFileSync("node", [SCRIPT, "--out", out, "--react", react]);

    // The golden <base>.png was copied as the reference asset.
    const refAsset = join(
      out,
      "assets/client-react/tests/ui/visual/vitest-browser/__screenshots__/react/visual.spec.tsx/tile-loading.png",
    );
    expect(readFileSync(refAsset, "utf8")).toBe("REF");
  });
});

// Writes a file (and any parent dirs), returning its path. Content is a tiny
// non-empty PNG-ish byte so copies are observable; the generator never decodes.
function put(path: string, content = "x"): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}
