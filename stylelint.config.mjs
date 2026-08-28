/**
 * Stylelint — the CSS counterpart to the ESLint/Biome split.
 *
 * Biome is the SOLE CSS formatter and owns all CSS *validity* rules it supports
 * (unknown property/unit/pseudo, duplicate properties/font-names, empty blocks,
 * shorthand overrides, invalid @import position, important-in-keyframe, …).
 *
 * To honor "separate concerns, don't duplicate them", this config does NOT
 * extend stylelint-config-standard (which would re-introduce formatting and
 * validity rules that fight Biome). Instead it enables ONLY the capabilities
 * Biome lacks, in three groups:
 *   1. validity checks with no Biome equivalent,
 *   2. naming-convention policy (CSS Modules class names + design-token names),
 *   3. design-token enforcement for text colour.
 *
 * @type {import('stylelint').Config}
 */
export default {
  plugins: ["stylelint-declaration-strict-value"],
  rules: {
    // ── 1. Validity Biome cannot check ──────────────────────────────────────
    "color-no-invalid-hex": true, // #1a2z / wrong digit count
    "no-duplicate-selectors": true, // same selector block twice across a file
    "no-invalid-double-slash-comments": true, // `// …` silently breaks CSS
    "no-irregular-whitespace": true, // stray non-breaking / zero-width spaces
    "declaration-block-no-duplicate-custom-properties": true, // `--x` twice in a block
    "font-family-no-missing-generic-family-keyword": true, // no fallback family
    "function-linear-gradient-no-nonstandard-direction": true, // gradient that no-ops
    "string-no-newline": true, // unescaped newline in a string

    // ── 2. Naming policy (Biome has no naming rules) ────────────────────────
    // CSS Modules class names become JS identifiers → camelCase.
    "selector-class-pattern": [
      "^[a-z][a-zA-Z0-9]*$",
      {
        message:
          "CSS Module class names must be camelCase (they become JS identifiers)",
        resolveNestedSelectors: true,
      },
    ],
    // Design tokens (--bg-primary, --accent-positive, …) are kebab-case.
    "custom-property-pattern": [
      "^[a-z][a-z0-9]*(-[a-z0-9]+)*$",
      { message: "Custom properties must be kebab-case" },
    ],

    // ── 3. Design-token enforcement (Biome cannot do this) ──────────────────
    // Text colour must come from a theme token, never a raw literal. Scoped to
    // colour/fill/stroke only: background tints stay literal for now because
    // tokenizing them would make currently theme-independent tints theme-aware
    // (a rendering change, not a lint fix). var()/keywords pass.
    "scale-unlimited/declaration-strict-value": [
      ["color", "fill", "stroke"],
      {
        ignoreValues: [
          "transparent",
          "currentColor",
          "currentcolor",
          "inherit",
          "initial",
          "unset",
        ],
        disableFix: true,
      },
    ],
  },
  overrides: [
    {
      // dockview-hud.css is never processed as a CSS Module — it ships raw
      // (like the rest of @rtc/layout-dockview's styles export) and every
      // class it names is a literal: dockview's own theme convention
      // (`dockview-theme-abyss`, `-light`, …: kebab-case `dockview-theme-<name>`),
      // dockview's own chrome classes it restyles (`dv-groupview`, `dv-tab`,
      // `dv-sash`, …: kebab-case `dv-<name>`), and the mount points this
      // package's renderers hand the clients (`rtc-dock-tab`, `rtc-dock-actions`,
      // `rtc-dock-panel-content`: kebab-case `rtc-dock-<name>`). The
      // JS-identifier camelCase rule above is a CSS Modules concern and
      // doesn't apply to this file.
      files: ["packages/layout-dockview/src/styles/dockview-hud.css"],
      rules: {
        "selector-class-pattern": [
          "^(dockview-theme|dv|rtc-dock)-[a-z0-9-]+$",
          {
            message:
              "dockview-hud.css class names are literals in three kebab-case families — dockview's theme classes (dockview-theme-<name>), dockview's own chrome classes (dv-<name>), and this package's mount points (rtc-dock-<name>) — not the CSS Modules camelCase rule.",
          },
        ],
      },
    },
  ],
};
