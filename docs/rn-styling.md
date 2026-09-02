# React Native Styling

The web clients ban inline `style={{…}}` and put static styling in co-located
`*.module.css` files. This doc states the native equivalent and why it is not
CSS.

## There is no CSS on native

React Native has no CSS engine: styles are plain JS objects resolved to
native view properties (Yoga for layout). CSS Modules therefore cannot exist
on iOS/Android. Expo's Metro *does* support `.css` and CSS Modules — **web
target only**; on native those imports resolve to empty objects. Any "CSS in
RN" library is an abstraction that compiles down to the same style objects.

## The doctrine

- **Static styling** lives in a `StyleSheet.create` block co-located in the
  component file (69 files do this today) — the `.module.css` analogue.
- **Theme-dependent styling** goes through `useThemedStyles`
  (`src/ui/theme/useThemedStyles.ts`, 56 consumers), never through inline
  conditionals on theme values.
- **Runtime-computed values** (a measured height, an animation progress) use
  the array-form dynamic member: `style={[styles.chart, { height }]}`. This
  is the sanctioned runtime channel — the analogue of the web ban's
  CSS-custom-property exemption. Reanimated styles (`useAnimatedStyle`
  results) pass as array members the same way.
- **Bare `style={{…}}` is banned** by the same ESLint selector as on web
  (`eslint.config.mjs`, RN block) — the fix is one of the three bullets
  above, or the sanctioned
  `// eslint-disable-next-line no-restricted-syntax -- <reason>`.

## Alternatives considered (2026-09-01) and deferred

| option | what it is | why deferred |
|---|---|---|
| Sibling `X.styles.ts` files | move each `StyleSheet.create` to a sibling module, mirroring `.module.css` co-location | cosmetic symmetry only; 69-file churn with no behavioural gain — icebox |
| react-native-unistyles | C++ shadow-tree styling, themes/breakpoints | new native dep for a solved problem — icebox |
| react-strict-dom | Meta's StyleX-like `css.create`, one API for web+native | young; would compete with the established `.module.css` setup on web — icebox |
| NativeWind / Tamagui / styled-components | utility- or DSL-driven styling | different design language than the token/skin system |

Deferred ≠ rejected: the first three are recorded in
[`IDEAS.md`](IDEAS.md) and can graduate later.
