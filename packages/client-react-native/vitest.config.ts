import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#/": `${path.resolve(__dirname, "src")}/`,
    },
  },
  test: {
    environment: "node",
    // Root-level `*.test.ts` too, so the package-root config (`app.config.ts`)
    // can be characterized next to itself.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "*.test.ts"],
    // `tests/visual/owl/` stays excluded even though the owl TEST is gone (the
    // dep was removed — see BAKEOFF.md §owl): the directory still holds
    // `owl.config.json`, kept as documentation of the not-viable tier, and the
    // exclusion keeps that folder outside the runner for good.
    exclude: [...configDefaults.exclude, "tests/visual/owl/**"],
  },
});
