import tseslint from "typescript-eslint";

import base from "./eslint.config.js";

export default tseslint.config(
  // Files that are NOT covered by any package's main tsconfig.json:
  //   - .remember/ is a scratch directory outside the project
  //   - packages/*/tests/ files belong to per-tier tsconfigs (tsconfig.ui-contract.json,
  //     tsconfig.ui-visual.json) which projectService won't auto-discover (they aren't
  //     named tsconfig.json). Scope the type-aware pass to src/ only for now.
  //   - tests/ at root belongs to tests/tsconfig.json but is also not auto-discovered.
  //   - vitest.config.ts / vite.config.ts files live under tsconfig.node.json.
  // The AST tier (eslint.config.js) still covers ALL of these files.
  {
    ignores: [
      ".remember/**",
      "packages/*/tests/**",
      "packages/*/vitest*.config.ts",
      "packages/*/vite.config.ts",
      "tests/**",
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
