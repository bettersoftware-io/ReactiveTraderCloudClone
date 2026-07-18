# @rtc/motion-core

Framework-free, **zero-runtime-dependency** view-layer motion math. Pure
functions and constants shared by both web clients' animation shells
(`@rtc/client-react` and `@rtc/client-solid`) so the *logic* is written once
and only the imperative DOM shell (`getBoundingClientRect` / `Element.animate`
/ `useLayoutEffect`-or-equivalent / directives) differs per framework.

No DOM, no RxJS, no React. See
[ADR-005](../../docs/adr/ADR-005-ui-logic-placement.md) for why animation math
lives here rather than behind the ViewModel.

## Exports

- `flipDeltas` — FLIP invert-phase deltas for a keyed grid.
- `computeRankDirections`, `sameOrder`, `coalesceOrder` — watchlist rank-glide math.
- Easing/duration constants (`FLIP_*`, `EXIT_*`, `GLIDE_*`, `HIGHLIGHT_*`, `FALLBACK_ROW_HEIGHT`).
- `REDUCED_MOTION_QUERY` — the shared `prefers-reduced-motion` media query string.
