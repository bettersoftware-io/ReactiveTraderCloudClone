import tseslint from "typescript-eslint";

import base from "./eslint.config.mjs";

export default tseslint.config(
  // The type-aware tier runs on EVERY ts/tsx file — no gaps. Coverage is backed
  // by tsconfig.eslint.json, a lint-only program that unions src + tests + config
  // files across all packages (see that file's header for why a single build
  // tsconfig can't). We use the classic `project` parser option rather than
  // `projectService: true` on purpose: projectService auto-discovers only files
  // literally named tsconfig.json (so it could never reach the per-tier configs
  // tsconfig.ui-contract.json / tsconfig.ui-visual.json / tsconfig.node.json),
  // whereas `project` points straight at the umbrella. A bonus property: under
  // `project`, any ts/tsx file NOT in the umbrella's include is a hard error, so
  // a future un-covered file fails the lint instead of silently slipping the
  // type-aware rules.
  //
  // The ONLY ignore is .remember/ — an untracked scratch/history directory
  // (Claude's memory buffer), not project source, so it is intentionally outside
  // the umbrella and skipped here.
  {
    ignores: [".remember/**"],
  },
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
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
