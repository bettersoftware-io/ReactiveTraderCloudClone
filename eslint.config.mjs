import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
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
        // Ban anonymous inline object types in USAGE positions — extract each
        // to a named interface/type alias. DEFINITION positions stay legal:
        // `type X = { ... }`, discriminated-union members (`| { ... }`),
        // `interface` bodies, and object types nested inside a named type's
        // property. Functions' return types are also enforced here because
        // Biome's useExplicitType permits inline-object returns; this is the
        // one rule that forbids them. (Each selector is split out so the
        // message names the offending position.)
        {
          selector:
            ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSMethodSignature, TSFunctionType, TSConstructorType) > .returnType TSTypeLiteral",
          message:
            "Inline object return type — extract to a named interface/type alias.",
        },
        {
          selector:
            ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction, TSMethodSignature, TSFunctionType, TSConstructorType) > .params TSTypeLiteral",
          message:
            "Inline object parameter type — extract to a named interface/type alias.",
        },
        {
          selector: "VariableDeclarator > .id > TSTypeAnnotation TSTypeLiteral",
          message:
            "Inline object variable type — extract to a named interface/type alias.",
        },
        {
          selector: "PropertyDefinition > .typeAnnotation TSTypeLiteral",
          message:
            "Inline object property type — extract to a named interface/type alias.",
        },
        {
          selector:
            ":matches(TSAsExpression, TSSatisfiesExpression) > TSTypeLiteral",
          message:
            "Inline object type in a cast — extract to a named interface/type alias.",
        },
        {
          selector: "TSTypeParameterInstantiation > TSTypeLiteral",
          message:
            "Inline object as a type argument — extract to a named interface/type alias.",
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
  {
    // React Compiler / Rules-of-React diagnostics, scoped to the app source the
    // compiler actually compiles (src — not tests, which never go through the
    // Babel transform). The `recommended-latest` preset bundles rules-of-hooks,
    // the compiler's purity/immutability/set-state checks, and exhaustive-deps;
    // these guard against writing components the compiler would silently bail
    // out on, now that manual memoization has been removed in favour of it.
    files: ["packages/client-react/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },
  {
    // Provisional exception (see docs/adr/ADR-003). The StrictMode
    // build-once-ref seam must read a stable, never-reassigned ref during
    // render; no lint-clean rewrite preserves single construction without
    // leaking RxJS subscriptions. `react-hooks/refs` is scoped off for these
    // two files ONLY — it stays active everywhere else (it caught FxBlotter).
    files: [
      "packages/client-react/src/ui/hooks/useMachine.ts",
      "packages/client-react/src/AppRoot.tsx",
    ],
    rules: { "react-hooks/refs": "off" },
  },
  prettier,
);
