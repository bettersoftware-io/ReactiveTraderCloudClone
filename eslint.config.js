import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "**/coverage/**",
      "**/reports/**",
      "**/__screenshots__/**",
      "**/.turbo/**",
      ".tooling/**",
    ],
  },
  {
    // Behavior-frozen contract specs are the framework-swap portability pillar:
    // they are pinned verbatim, so the definitional AST style rules (func-style
    // etc.) must not force edits to them. Whitespace/brace formatting is still
    // owned by Biome; only the AST tier is scoped out for these files.
    ignores: [
      "packages/client-react/tests/ui/contract/specs/**/*.contract.spec.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
      "arrow-body-style": ["error", "always"],
      "func-names": ["error", "always"],
      "lines-between-class-members": [
        "error",
        "always",
        { exceptAfterSingleLine: false },
      ],
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "function" },
        { blankLine: "always", prev: "function", next: "*" },
        { blankLine: "always", prev: "multiline-block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "multiline-block-like" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSMethodSignature) > .returnType TSTypeLiteral",
          message:
            "Inline object return type — extract to a named interface/type alias.",
        },
        {
          selector:
            "VariableDeclarator[init.callee.name='useHooks'][id.type='Identifier']",
          message:
            "Destructure the hooks you need: const { useX } = useHooks().",
        },
      ],
    },
  },
  prettier,
);
