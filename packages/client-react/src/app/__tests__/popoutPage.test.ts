import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Dockview's pop-out machinery loads `/popout.html` in the child window,
// waits for `load`, appends its own container to the body and copies every
// parent stylesheet across (popoutWindow.js). Without a real file at that
// path the dev server's SPA fallback boots the ENTIRE app inside the child
// (its own header under dockview's container) and the deployed site 404s —
// so the page must exist as a genuine root-level build input. Vercel needs
// no config change: routing is filesystem-first, so a real dist/popout.html
// wins over the SPA rewrite. (Paths via cwd: vitest runs from the package
// root, and this transform's import.meta.url is not a file: URL.)
describe("the pop-out target page", () => {
  it("popout.html is a real empty-body page and a build input", () => {
    const page = readFileSync(join(process.cwd(), "popout.html"), "utf8");
    expect(page).toContain("<body></body>");

    const config = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
    expect(config).toContain("popout.html");
  });
});
