import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("../../", import.meta.url));
const dist = (p: string): string => `${pkgRoot}dist/${p}`;

describe("extension build", () => {
  it("produces a loadable unpacked MV3 bundle", () => {
    execFileSync("pnpm", ["run", "build"], { cwd: pkgRoot, stdio: "inherit" });

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
