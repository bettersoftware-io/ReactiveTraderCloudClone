import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import solid from "eslint-plugin-solid";
import tseslint from "typescript-eslint";

import { classFilenameMatch } from "./eslint-rules/class-filename-match.mjs";
import { componentNewspaper } from "./eslint-rules/component-newspaper.mjs";
import { nameFunctionsByEffect } from "./eslint-rules/name-functions-by-effect.mjs";
import { newspaperOrder } from "./eslint-rules/newspaper-order.mjs";
import { noRenderFunctions } from "./eslint-rules/no-render-functions.mjs";

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
    "no-render-functions": noRenderFunctions,
    "name-functions-by-effect": nameFunctionsByEffect,
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
      // Design-handoff prototypes are self-contained artifacts, not app code —
      // excluded from lint (matches biome.jsonc `!docs/design` + knip's ignore).
      "docs/design/**",
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
        // Multiline variable declarations (e.g. a run of `const x =
        // createMemo(() => {…})`) are VariableDeclarations, not block-like, so
        // the rules above miss them — they pack together with no separator.
        // Require one blank line between adjacent multiline declarations so
        // each stands as its own paragraph. The "no MORE than one" half is
        // handled by Biome's formatter, which collapses blank-line runs to one.
        {
          blankLine: "always",
          prev: ["multiline-const", "multiline-let", "multiline-var"],
          next: ["multiline-const", "multiline-let", "multiline-var"],
        },
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
      "packages/client-solid/src/**/*.tsx",
      "packages/devtools-app/src/**/*.tsx",
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
    // `devtools-app` has run the compiler since day one too — it joins here so
    // it gets the same diagnostics.
    files: [
      "packages/client-react/src/**/*.{ts,tsx}",
      "packages/devtools-app/src/**/*.{ts,tsx}",
    ],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },
  {
    // Provisional exception (see docs/adr/ADR-003). The StrictMode
    // build-once-ref seam must read a stable, never-reassigned ref during
    // render; no lint-clean rewrite preserves single construction without
    // leaking RxJS subscriptions. `react-hooks/refs` is scoped off for these
    // three files ONLY — it stays active everywhere else (it caught
    // FxBlotter). `InspectorApp.tsx` holds a `LiveHistory` instance for the
    // same documented reason: a build-once ref read during render.
    files: [
      "packages/client-react/src/ui/viewModel/useMachine.ts",
      "packages/client-react/src/AppRoot.tsx",
      "packages/devtools-app/src/InspectorApp.tsx",
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
    // Manual memoization is banned — the React Compiler memoizes at build time
    // (ADR-003). Scoped to the packages that actually run the compiler.
    //
    // `devtools-extension` belongs here because `@rtc/devtools-app` exports
    // `./src/index.ts` — raw source — so the extension's own Vite build
    // compiles the inspector's components rather than consuming a prebuilt
    // bundle. Its config therefore enables the compiler too; without that the
    // extension would ship the same de-memoized source unoptimized.
    //
    // `client-prototype` is deliberately OUT of scope: it is an abandoned port
    // of the design prototype, kept for reference, and is not worth churning.
    // Test harnesses are also out of scope (never Babel-transformed, so their
    // stable identities are real).
    //
    // `no-restricted-imports` rather than `no-restricted-syntax`: flat config
    // REPLACES a rule's options across matching blocks, which is why the shared
    // `restrictedSyntax` array has to be re-spread everywhere it appears. This
    // rule is used nowhere else, so a new block carries no such coupling.
    // Caveat: it cannot see `React.useMemo` via a namespace import — verified
    // that no such import exists in these packages (named imports only).
    files: [
      "packages/client-react/src/**/*.{ts,tsx}",
      "packages/client-react-native/src/**/*.{ts,tsx}",
      "packages/client-react-native/app/**/*.{ts,tsx}",
      "packages/devtools-app/src/**/*.{ts,tsx}",
      "packages/devtools-extension/src/**/*.{ts,tsx}",
    ],
    // Test files are OUT of scope: they never go through the Babel transform,
    // so nothing auto-memoizes them and their stable identities are real.
    // `client-react` keeps tests outside `src/`, but `devtools-app` keeps them
    // in `src/__tests__/` — without this the glob catches them and contradicts
    // the deliberate non-goal stated in the comment above.
    ignores: ["**/__tests__/**", "**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useMemo", "useCallback", "memo"],
              message:
                "Manual memoization is banned — the React Compiler memoizes (ADR-003). Write the plain value, or a function declaration for a callback. For a build-once INSTANCE (not a cache), use the useRef + `if (current === null)` idiom.",
            },
          ],
        },
      ],
    },
  },
  {
    // The ONE exception to the memo ban. `useHoldToUnlock`'s two `useMemo`s
    // carry semantics, not caching: they hold the `Gesture.LongPress()`
    // identity stable so its native handler is not reattached every render.
    // The compiler cannot supply that identity here — `runOnJS(fireComplete)()`
    // closes over a ref (a bail), and even ref-free the memo would key on
    // `onComplete`, which churns because `LockScreen` bails on the ViewModel
    // seam. Full reasoning in the hook's header comment. A clean-architecture
    // fix is tracked in docs/STATUS.md.
    files: [
      "packages/client-react-native/src/ui/shell/lock/useHoldToUnlock.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // `react-bindings` is banned too, but for a DIFFERENT reason than the block
    // above — state it honestly rather than reusing that message. This package
    // is built by `tsc` (`tsc --build && tsc-alias`), never by Babel, so the
    // React Compiler does not and cannot run over it: nothing here is
    // auto-memoized, and nothing will be.
    //
    // The ban is therefore "this seam stays memo-free by design", not "the
    // compiler covers it". It holds today at zero call sites. The package is
    // three thin files bridging React to RxJS; a `useMemo` appearing here is a
    // signal the logic belongs in `client-core` (an RxJS machine) or in
    // `@rtc/motion-core` (a pure function) — see ADR-005's decision tree —
    // rather than being cached at the binding layer.
    files: ["packages/react-bindings/src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useMemo", "useCallback", "memo"],
              message:
                "Manual memoization is banned in react-bindings. This package is tsc-built, so the React Compiler never runs here and cannot replace a memo — which is the point: the bridge stays memo-free by design. If you need memoization, the logic likely belongs in an RxJS machine (client-core) or a pure function (@rtc/motion-core) instead — see ADR-005.",
            },
          ],
        },
      ],
    },
  },
  {
    // Newspaper order for test files: type/helper/vi.mock/jest.mock declarations
    // must sit BELOW the describe/it blocks. Custom autofixable rule in
    // eslint-rules/. Scoped to test files only (contract specs included —
    // reordering is behaviour-preserving; both vi.mock and jest.mock are hoisted
    // above imports by their runners). class/enum/vi.doMock/jest.doMock/vi.hoisted
    // stay put.
    files: ["**/*.{spec,test}.{ts,tsx}"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/newspaper-order": "error" },
  },
  {
    // JSX belongs in components: `render*`-named functions must not return JSX
    // (write a standalone component instead). Applies to every .tsx in the
    // repo; RTL-style helpers returning a render(...) CALL and anonymous
    // arrows in render-prop position stay legal by construction (see the
    // rule's header comment).
    files: ["**/*.tsx"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/no-render-functions": "error" },
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
    // Carve-out: e2e page objects use a framework-prefixed class name
    // (PlaywrightBlotterTable) inside a subject-named file that mirrors the
    // shared contracts/<Subject>.ts. The playwright/ <-> contracts/ filename
    // parallelism is deliberate, so the filename matches the contract, not the
    // class. A systematic convention across the directory (not a one-off), so
    // it is scoped off the rule rather than disabled per file.
    files: ["tests/browser/page-objects/playwright/**/*.ts"],
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
      "packages/client-solid/src/**/*.tsx",
      "packages/devtools-app/src/**/*.tsx",
    ],
    ignores: ["**/*.{test,spec}.tsx"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/component-newspaper": "error" },
  },
  {
    // A function's own name must state its EFFECT — what it does, to what —
    // never the occasion that triggers it. Slots are exempt BY SHAPE:
    // function-typed PROPERTY-syntax members, JSX attributes, `vi.fn()` spies
    // and uninitialised slot captures are legal by construction, so there is
    // nothing to keep in sync. A function-valued member written in METHOD
    // syntax is treated as a command and IS flagged — a prop slot must be
    // declared in property syntax (`onX: (d) => void`, not `onX(d): void`).
    //
    // See docs/superpowers/specs/2026-07-26-name-functions-by-effect-design.md.
    files: ["**/*.{ts,tsx}"],
    plugins: { rtc: rtcPlugin },
    rules: { "rtc/name-functions-by-effect": "error" },
  },
  {
    // eslint-plugin-solid's recommended rules — Solid's JSX has different
    // reactivity semantics than React's (no re-render on prop/state change;
    // props are getters backed by a proxy), so it needs its own lint pass
    // (no-destructure, reactivity, jsx-uses-vars, …) rather than reusing the
    // react-hooks block above. Scoped to the two Solid packages only.
    files: [
      "packages/client-solid/**/*.{ts,tsx}",
      "packages/solid-bindings/**/*.{ts,tsx}",
    ],
    ...solid.configs["flat/recommended"],
  },
  prettier,
);
