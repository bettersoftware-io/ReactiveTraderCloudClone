import tseslint from "typescript-eslint";

import base from "./eslint.config.mjs";

export default tseslint.config(
  // Files that are NOT covered by a standard tsconfig.json discoverable by projectService:
  //   - .remember/ is a scratch directory outside the project
  //   - packages/*/tests/ files belong to per-tier tsconfigs (tsconfig.ui-contract.json,
  //     tsconfig.ui-visual.json) which projectService won't auto-discover (they aren't
  //     named tsconfig.json).
  //   - vitest.config.ts / vite.config.ts files live under tsconfig.node.json.
  // root tests/ IS covered: tests/tsconfig.json exists and is named tsconfig.json, so
  // projectService auto-discovers it and includes browser/, presenter/, fullstack/, scripts/.
  // The AST tier (eslint.config.mjs) still covers ALL files including the ignored ones above.
  {
    ignores: [
      ".remember/**",
      "packages/*/tests/**",
      "packages/*/vitest*.config.ts",
      "packages/*/vite.config.ts",
      // *.golden.test.ts files in src/ are excluded from tsconfig.json (they
      // run under separate vitest node environments). projectService cannot find
      // them, so skip the typed pass for these files too.
      "packages/**/*.golden.test.ts",
    ],
  },
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
);
