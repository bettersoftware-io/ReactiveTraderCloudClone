import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#/": `${path.resolve(__dirname, "src")}/`,
      // Page-object modules for the co-located specs (page-object-isolation
      // plan, Wave C) live under tests/pages/, not src/ — mirrors the "#/"
      // alias above and the parallel jest/tsconfig entries. No `.test.ts`
      // spec imports one yet, but the alias must exist before the first one
      // does (a missing entry here fails silently under vitest's resolver,
      // not loudly).
      "#tests/": `${path.resolve(__dirname, "tests")}/`,
      // expo-router's `app/` tree (RootLayout/AppGroupLayout pages, wave C
      // batch-3 fix round) — mirrors the "#/" alias above and the parallel
      // jest/tsconfig/package.json entries. No `.test.ts` spec imports one
      // yet, but the alias must exist before the first one does, per
      // `#tests/`'s own precedent comment above.
      "#app/": `${path.resolve(__dirname, "app")}/`,
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
    // The `.ts` half of this package's two-tier coverage split. This is the
    // only package in the repo running two test runners, so it has two coverage
    // numbers rather than one: vitest owns `*.test.ts` (above), jest owns
    // `*.test.tsx` because those component suites need the react-native runtime
    // `jest-expo` bootstraps. Neither tier alone is "RN's coverage" and the two
    // are NOT addable — different providers disagree on what a statement is.
    // Read README-COVERAGE.md before quoting either number.
    coverage: {
      provider: "v8",
      // Count every source file, not just the ones a test imports, so wholly
      // untested modules surface at 0% instead of vanishing from the
      // denominator — the repo-wide convention (see packages/domain).
      //
      // NOTE this denominator is the WHOLE package, `.tsx` included, while this
      // tier runs only `.test.ts`. Deliberate: the number answers "how much of
      // client-react-native does vitest alone reach", and refuses to flatter
      // itself by shrinking the denominator to the half it happens to test.
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "reports/unit/coverage",
    },
    server: {
      deps: {
        // async-storage v3 dropped its CommonJS build: `exports["."].default`
        // now points straight at `lib/module/index.js`, whose relative imports
        // carry no file extension (`from "./createAsyncStorage"`) even though
        // the package declares no `"type": "module"`. Vitest externalizes
        // node_modules by default and hands them to Node, whose ESM resolver
        // requires the extension — so the import throws before any test runs,
        // taking down every file that reaches the two adapters transitively.
        // Inlining routes it through Vite's resolver instead, which fills the
        // extension in. v2 needed none of this: it shipped `lib/commonjs/` as
        // `main`, and extensionless requires are legal in CJS.
        inline: ["@react-native-async-storage/async-storage"],
      },
    },
  },
});
