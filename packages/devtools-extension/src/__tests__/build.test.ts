import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("extension build", () => {
  it("produces a loadable unpacked MV3 bundle", () => {
    // Force a production build: vitest runs with NODE_ENV=test, which the
    // child would inherit and hand to @vitejs/plugin-react, emitting a
    // dev-mode React bundle (~2x size, console warnings) into dist/. Since
    // this test overwrites dist/ in place, that would leave a non-canonical
    // dev bundle on disk for anyone who loads the unpacked extension after
    // running the suite. Pin NODE_ENV so the shipped artifact stays prod.
    execFileSync("pnpm", ["run", "build"], {
      cwd: pkgRoot,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });

    for (const f of [
      "manifest.json",
      "devtools.html",
      "panel.html",
      "background.js",
      "contentBridge.js",
      "devtools.js",
    ]) {
      expect(existsSync(dist(f)), `${f} missing from dist`).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(dist("manifest.json"), "utf8"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.devtools_page).toBe("devtools.html");
    expect(manifest.background.service_worker).toBe("background.js");
  }, 120_000);
});

function dist(p: string): string {
  return `${pkgRoot}dist/${p}`;
}
