import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

import { classFilenameMatch } from "./eslint-rules/class-filename-match.mjs";
import { componentNewspaper } from "./eslint-rules/component-newspaper.mjs";
import { newspaperOrder } from "./eslint-rules/newspaper-order.mjs";

// Structural `no-restricted-syntax` bans shared between the repo-wide block and
// the client-`src` block (which appends the inline-style ban). Flat config
// REPLACES — does not merge — a rule's options across matching blocks, so the
// scoped block must re-list these via the spread or it would silently disable
// them for client `src`.
//
// Ban anonymous inline object types in USAGE positions — extract each to a
// named interface/type alias. DEFINITION positions stay legal: `type X = {...}`,
// discriminated-union members (`| { ... }`), `interface` bodies, and object
// types nested inside a named type's property. Functions' return types are also
// enforced here because Biome's useExplicitType permits inline-object returns;
// this is the one rule that forbids them. (Each selector is split out so the
// message names the offending position.)
const restrictedSyntax = [
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
    selector: ":matches(TSAsExpression, TSSatisfiesExpression) > TSTypeLiteral",
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
      "VariableDeclarator[init.callee.name='useViewModel'][id.type='Identifier']",
    message: "Destructure the hooks you need: const { useX } = useViewModel().",
  },
  {
    // Ban chained access off useViewModel() — `useViewModel().useX()` reaches into
    // the bundle inline. Destructure first, then call:
    //   const { useX } = useViewModel();  useX(args)
    selector: "MemberExpression[object.callee.name='useViewModel']",
    message:
      "Don't chain off useViewModel(). Destructure first: const { useX } = useViewModel(); then call useX().",
  },
];

// Ban inline `style={{…}}` object literals — with or without an `as
// CSSProperties` cast (the cast wraps the object in a TSAsExpression, so it is
// no longer a direct child of the JSX expression container). `style={variable}`
// / `style={fn()}` are NOT matched (literal objects only — the original CSS-
// Modules-migration grep gate's reach). Scoped to client `src` below.
const inlineStyleProp = {
  selector:
    "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression, JSXAttribute[name.name='style'] > JSXExpressionContainer > TSAsExpression > ObjectExpression",
  message:
    "Inline style={{…}} is banned — move static styling to a co-located *.module.css. Only runtime-computed values (CSS custom properties) are exempt; if genuinely needed, add: // eslint-disable-next-line no-restricted-syntax -- <reason>.",
};

// Both custom rules ship under the `rtc` plugin namespace. A single shared
// plugin object lets two config blocks reference it (newspaper-order stays
// test-file-scoped; class-filename-match applies to all ts/tsx) without
// "Cannot redefine plugin" — flat config accepts the same object reference in
// multiple blocks.
const rtcPlugin = {
  rules: {
    "newspaper-order": newspaperOrder,
    "class-filename-match": classFilenameMatch,
    "component-newspaper": componentNewspaper,
  },
};

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
      "no-restricted-syntax": ["error", ...restrictedSyntax],
      "max-classes-per-file": ["error", 1],
    },
  },
  {
    // Inline style={{…}} ban — production UI only. The test harness
    // (tests/ui/visual/*) uses inline styles as framework-neutral layout
    // scaffolding (e.g. the panel-width wrapper) and is intentionally out of
    // scope. Re-lists `restrictedSyntax` via the spread because flat config
    // REPLACES (does not merge) a rule's options across matching blocks — a
    // bare `[inlineStyleProp]` here would disable the type bans for client src.
    files: [
      "packages/client-react/src/**/*.tsx",
      "packages/client-prototype/src/**/*.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...restrictedSyntax, inlineStyleProp],
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
      "packages/client-react/src/ui/viewModel/useMachine.ts",
      "packages/client-react/src/AppRoot.tsx",
    ],
    rules: { "react-hooks/refs": "off" },
  },
  {
    // Same React hook-correctness rules for React Native — parity with the web
    // client. RN does NOT run the React Compiler (its pipeline is
    // babel-preset-expo), so the preset's compiler-oriented rules are advisory
    // here, but they pass clean and the core rules (rules-of-hooks,
    // exhaustive-deps, purity, set-state) guard RN components just the same.
    files: [
      "packages/client-react-native/src/**/*.{ts,tsx}",
      "packages/client-react-native/app/**/*.{ts,tsx}",
    ],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      // `react-hooks/refs` fights two legitimate RN idioms that read `.current`
      // during render by design: the ADR-003 build-once-ref VM seam (see
      // src/app/AppRoot.tsx) and `useRef(new Animated.Value(x)).current`, the
      // canonical way to hold a stable animated value across renders. Off for
      // RN (stays on for the web client, where it caught FxBlotter).
      "react-hooks/refs": "off",
    },
  },
  {
    // Newspaper order for test files: type/helper/vi.mock declarations must sit
    // BELOW the describe/it blocks. Custom autofixable rule in eslint-rules/.
    // Scoped to test files only (contract specs included — reordering is
    // behaviour-preserving). class/enum/vi.doMock/vi.hoisted stay put.
    files: ["**/*.{spec,test}.{ts,tsx}"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/newspaper-order": "error" },
  },
  {
    // One class per file: a top-level class must live in a file named after it
    // (filename's first dot-segment === class name). Applies to ALL ts/tsx;
    // fires only when a top-level class exists, so non-class modules are
    // untouched. Sanctioned exceptions use a per-line eslint-disable.
    files: ["**/*.{ts,tsx}"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/class-filename-match": "error" },
  },
  {
    // Carve-out: e2e page objects use framework-prefixed class names
    // (CypressBlotterTable / PlaywrightBlotterTable) inside subject-named files
    // that mirror the shared contracts/<Subject>.ts. The cypress/ <-> playwright/
    // <-> contracts/ filename parallelism is deliberate, so the filename matches
    // the contract, not the class. A systematic convention across 20 files (not a
    // one-off), so it is scoped off the rule rather than disabled per file.
    files: [
      "tests/browser/page-objects/cypress/**/*.ts",
      "tests/browser/page-objects/playwright/**/*.ts",
    ],
    rules: { "rtc/class-filename-match": "off" },
  },
  {
    // Carve-out: cucumber World classes live in `world.ts` by framework
    // convention (setWorldConstructor) — one World per flavor directory. The
    // filename is the cucumber idiom, not the class name.
    files: ["**/world.ts"],
    rules: { "rtc/class-filename-match": "off" },
  },
  {
    // One component per .tsx file: the exported component is the newspaper lede
    // (private subcomponents/helpers/types below it) and the filename matches it.
    // Scoped to client-react + client-react-native source; test .tsx are excluded
    // (they may define throwaway components and are governed by rtc/newspaper-order
    // instead). RN's app/** route files are out of scope (not under src/): Expo
    // Router discovers screens by filename (index.tsx, credit.tsx, _layout.tsx),
    // which can't match the component name.
    files: [
      "packages/client-react/src/**/*.tsx",
      "packages/client-react-native/src/**/*.tsx",
    ],
    ignores: ["**/*.{test,spec}.tsx"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/component-newspaper": "error" },
  },
  prettier,
);
