# Changelog — since v1 (yesterday's download)

Everything in v1 is still here; this lists what was **added or changed** since then.
The headline additions are **two new themes**, a **dark/light mode toggle**, and a layer
of **event-driven motion** (glides, flashes, smooth panel transitions).

## Themes
- **5 themes now (was 3).** Added **Holo HUD 3D** and **Terminal 3D** — depth variants of
  Holo and Terminal: gradient panel fills, layered drop-shadows with an inner top
  highlight (raised-glass feel), and gradient header strips / chips. Same accent
  identity, just more dimensional.
- **Dark / Light mode toggle** (new ☀/☾ button in the header, left of the theme picker).
  It is **orthogonal to the theme**: every one of the 5 themes now has a full dark **and**
  light palette, and the toggle flips between them while keeping the theme's identity.
  Dark remains the default.

## Depth / legibility
- **Raised tiles & cards.** Live Rates tiles and RFQ cards now sit on a distinct elevated
  surface (subtle gradient + soft drop-shadow + top highlight) in **every** theme — they
  no longer blend into the background (previously they were filled with the page bg color).

## Motion & feedback (all event-driven — nothing animates idly)
- **Isotope-style glide in Live Rates.** Changing the currency filter physically slides
  the surviving tiles from their old grid positions to their new ones (FLIP via the Web
  Animations API), while entering tiles fade-and-scale in.
- **Watchlist glides.** The FX Watchlist glides its rows on filter change. The Equities
  watchlist became a live **"top movers" board**: a sort toggle (A–Z / % CHG / Price) and
  rows that re-rank and physically slide as prices move, with a green/red edge-glow on the
  rows that moved.
- **RFQ panel glide.** RFQ cards now glide to their new positions when the set reorders
  (new RFQ arrives, one is accepted/expires, or the Live/Closed/All filter changes) — the
  same FLIP engine as Live Rates. Cards also fade-and-scale on enter and exit.
- **RFQ ACCEPT emphasis.** When a dealer quote arrives, its ACCEPT button pops in with a
  glow flare; the best quote's button keeps a gentle ongoing pulse to draw the eye.
- **Blotter row flash.** Every newly added blotter row (FX / Credit / Equities) briefly
  flashes on insert (green for buy/up, red for sell/reject) — and now fires on **every**
  insert, not just the first.
- **Smooth panel maximize/restore.** Maximizing or restoring a dock panel now animates
  (~0.34s): the growing panel eases open while its sibling eases to a strip; splitter drags
  stay crisp (transitions suppressed mid-drag).

## Notes for the developer
- The FLIP glides (tiles, watchlist, RFQs) are driven from `componentDidUpdate` using the
  Web Animations API so they survive the runtime's frequent re-renders. In the real React
  app, reach for a FLIP helper (e.g. a small hook, or `framer-motion`'s layout animations)
  rather than manual measurement.
- The Equities watchlist's "always re-ranking" liveliness comes from ranking on a % change
  measured against a fast-tracking baseline so values stay clustered and cross often —
  underlying price volatility stays realistic. Wire ranking to the real % change field.
- Theme tokens grew two members used by the depth themes: `panelShadow` and `tileShadow`
  (box-shadows), plus `tile` (the elevated card surface, can be a gradient). Light mode is
  a parallel token set per theme — see `themesLight` in the source.
