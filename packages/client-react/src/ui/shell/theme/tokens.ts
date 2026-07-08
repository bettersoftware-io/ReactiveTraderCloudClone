/**
 * Design tokens for dark and light themes.
 * Applied as CSS custom properties on :root via ThemeProvider.
 *
 * The token store is keyed by ThemeSkin × ThemeMode and covers six skins:
 *   classic  — pre-redesign blue palette (neutral on aurora / blur / glow)
 *   holo     — Iron Man / Minority Report cyan HUD (glass panels, aurora FX)
 *   holo3d   — Holo with physical depth (gradient panels, layered panel/tile shadows)
 *   terminal — Bloomberg-grade pro terminal (solid, amber-on-charcoal)
 *   terminal3d — Terminal with physical depth (gradient panels, layered panel/tile shadows)
 *   neon     — high-contrast cyberpunk (magenta / cyan, aurora FX)
 *
 * Dark values for holo / terminal / neon are mapped 1-to-1 from
 * docs/design/v1/dev-handoff/theme-tokens.css.  Light variants for holo /
 * terminal / neon are mapped 1-to-1 from the v2 prototype's `themesLight`
 * table (docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html)
 * — verbatim, not derived. Classic (both modes) stays the pre-redesign
 * palette, neutral on the aurora/blur/glow/tile/panel-shadow keys.
 */

import type { ThemeMode, ThemeSkin } from "@rtc/domain";

export interface ThemeTokens {
  // Backgrounds
  "--bg-primary": string;
  "--bg-secondary": string;
  "--bg-header": string;
  "--bg-footer": string;
  "--bg-tile": string;
  "--bg-overlay": string;
  /** Brand-primary background used for the new-row flash animation keyframe midpoint. */
  "--bg-brand-primary": string;

  // Text
  "--text-primary": string;
  "--text-secondary": string;
  "--text-muted": string;
  // Text painted on a coloured accent/status fill — stays light in both themes.
  "--text-on-accent": string;

  // Accents
  "--accent-positive": string;
  "--accent-negative": string;
  "--accent-aware": string;
  "--accent-primary": string;
  /** Secondary accent (accent2 in the design CSS). */
  "--accent-2": string;

  // Borders
  "--border-primary": string;
  "--border-subtle": string;
  /**
   * General-purpose border — full strength, same value as --border-primary
   * per skin (the prototype has a single border strength; a previous
   * half-strength value here washed out every panel/ladder rule).
   */
  "--border": string;
  /** Active / selected border. */
  "--border-strong": string;

  // Status
  "--status-connected": string;
  "--status-connecting": string;
  "--status-disconnected": string;
  // Error-message fill. Kept theme-independent to preserve the exact prior
  // rendering (was a hardcoded #d32f2f fallback on an undefined token); unify
  // with --accent-negative later if a theme-aware error colour is wanted.
  "--status-error": string;

  // Panel / HUD chrome
  /** Glass panel fill (translucent for holo/neon; solid for terminal/classic). */
  "--panel": string;
  /** Panel header strip fill. */
  "--panel-head": string;
  /** backdrop-filter blur radius — "0" for solid skins, "14px" for holo, "12px" for neon. */
  "--panel-blur": string;
  /** box-shadow used on active/glowing elements — "none" for solid skins. */
  "--glow": string;
  /** Faint HUD grid line colour. */
  "--grid": string;
  /** Chip / pill background. */
  "--chip": string;

  // Aurora animated background
  /** First aurora gradient stop (from accent). */
  "--aurora-a": string;
  /** Second aurora gradient stop (from accent-2). */
  "--aurora-b": string;
  /** Opacity multiplier for the ambient animated aurora background. */
  "--aurora-opacity": string;

  // Typography
  /** Display font family (headings, nav, labels). */
  "--font-display": string;
  /** Mono font family (numbers, data, telemetry). */
  "--font-mono": string;
  /** Display font for wordmark / KPI headlines — Orbitron in all redesign skins. */
  "--font-logo": string;

  // v2 tile / panel surfaces
  /** Tile surface fill — a gradient in every non-classic skin (PROTO `tile`). */
  "--tile": string;
  /** Layered tile shadow incl. inset top highlight (PROTO `tileShadow`); "none" for classic. */
  "--tile-shadow": string;
  /** Panel-level shadow (PROTO `panelShadow`); "none" for flat skins — 3d skins will fill this. */
  "--panel-shadow": string;
}

// ---------------------------------------------------------------------------
// Classic — today's pre-redesign blue palette kept as the base.
// The 13 new keys are filled with neutral values: no aurora, no blur, no glow.
// ---------------------------------------------------------------------------

/**
 * Classic dark — the full 35-key surface: today's 22 pre-redesign values plus
 * the 13 new keys filled with neutral values (no aurora, no blur, no glow).
 * Classic-skin dark token cell; also the pre-redesign default appearance.
 */
const darkTokens: ThemeTokens = {
  "--bg-primary": "#111827",
  "--bg-secondary": "#1f2937",
  "--bg-header": "#0f172a",
  "--bg-footer": "#0f172a",
  "--bg-tile": "#1e293b",
  "--bg-overlay": "rgba(0, 0, 0, 0.75)",
  "--bg-brand-primary": "#3b82f6",

  "--text-primary": "#f1f5f9",
  "--text-secondary": "#94a3b8",
  "--text-muted": "#64748b",
  "--text-on-accent": "#fff",

  "--accent-positive": "#22c55e",
  "--accent-negative": "#ef4444",
  "--accent-aware": "#f59e0b",
  "--accent-primary": "#3b82f6",
  "--accent-2": "#60a5fa",

  "--border-primary": "#334155",
  "--border-subtle": "#1e293b",
  "--border": "#334155",
  "--border-strong": "#475569",

  "--status-connected": "#22c55e",
  "--status-connecting": "#f59e0b",
  "--status-disconnected": "#ef4444",
  "--status-error": "#d32f2f",

  "--panel": "var(--bg-tile)",
  "--panel-head": "var(--bg-secondary)",
  "--panel-blur": "0",
  "--glow": "none",
  "--grid": "rgba(148,163,184,0.06)",
  "--chip": "rgba(59,130,246,0.12)",

  "--aurora-a": "transparent",
  "--aurora-b": "transparent",
  "--aurora-opacity": "0",

  "--font-display": "system-ui, sans-serif",
  "--font-mono": "ui-monospace, monospace",
  "--font-logo": "system-ui, sans-serif",

  "--tile": "var(--bg-tile)",
  "--tile-shadow": "none",
  "--panel-shadow": "none",
};

/**
 * Classic light — the full 35-key surface: today's 22 pre-redesign values plus
 * the 13 neutral new keys.
 * Classic-skin light token cell; also the pre-redesign default appearance.
 */
const lightTokens: ThemeTokens = {
  "--bg-primary": "#f8fafc",
  "--bg-secondary": "#f1f5f9",
  "--bg-header": "#ffffff",
  "--bg-footer": "#ffffff",
  "--bg-tile": "#ffffff",
  "--bg-overlay": "rgba(0, 0, 0, 0.5)",
  "--bg-brand-primary": "#2563eb",

  "--text-primary": "#0f172a",
  "--text-secondary": "#475569",
  "--text-muted": "#94a3b8",
  "--text-on-accent": "#fff",

  "--accent-positive": "#16a34a",
  "--accent-negative": "#dc2626",
  "--accent-aware": "#d97706",
  "--accent-primary": "#2563eb",
  "--accent-2": "#60a5fa",

  "--border-primary": "#e2e8f0",
  "--border-subtle": "#f1f5f9",
  "--border": "#e2e8f0",
  "--border-strong": "#475569",

  "--status-connected": "#16a34a",
  "--status-connecting": "#d97706",
  "--status-disconnected": "#dc2626",
  "--status-error": "#d32f2f",

  "--panel": "var(--bg-tile)",
  "--panel-head": "var(--bg-secondary)",
  "--panel-blur": "0",
  "--glow": "none",
  "--grid": "rgba(148,163,184,0.06)",
  "--chip": "rgba(59,130,246,0.12)",

  "--aurora-a": "transparent",
  "--aurora-b": "transparent",
  "--aurora-opacity": "0",

  "--font-display": "system-ui, sans-serif",
  "--font-mono": "ui-monospace, monospace",
  "--font-logo": "system-ui, sans-serif",

  "--tile": "var(--bg-tile)",
  "--tile-shadow": "none",
  "--panel-shadow": "none",
};

// ---------------------------------------------------------------------------
// Holo — Iron Man / Minority Report cyan HUD (glass, aurora, blur=14px)
// Dark values mapped 1-to-1 from theme-tokens.css [data-theme="holo"].
// Light: PROTO `themesLight.holo` verbatim — cyan accent, aurora-opacity 0.12.
// ---------------------------------------------------------------------------

const holoDark: ThemeTokens = {
  "--bg-primary": "#00060a",
  "--bg-secondary": "#02121d",
  "--bg-header": "#02121d",
  "--bg-footer": "#02121d",
  "--bg-tile": "rgba(6,26,38,0.5)",
  "--bg-overlay": "rgba(0,6,10,0.78)",
  "--bg-brand-primary": "#00e5ff",

  "--text-primary": "#d6f7ff",
  "--text-secondary": "rgba(150,210,228,0.62)",
  "--text-muted": "rgba(120,190,210,0.42)",
  "--text-on-accent": "#00060a",

  "--accent-positive": "#2bffb3",
  "--accent-negative": "#ff5d73",
  "--accent-aware": "#ffb000",
  "--accent-primary": "#00e5ff",
  "--accent-2": "#19ffd0",

  "--border-primary": "rgba(0,224,255,0.26)",
  "--border-subtle": "rgba(0,224,255,0.12)",
  "--border": "rgba(0,224,255,0.26)",
  "--border-strong": "rgba(0,224,255,0.6)",

  "--status-connected": "#2bffb3",
  "--status-connecting": "#ffb000",
  "--status-disconnected": "#ff5d73",
  "--status-error": "#ff5d73",

  "--panel": "rgba(6,26,38,0.5)",
  "--panel-head": "rgba(0,224,255,0.06)",
  "--panel-blur": "14px",
  "--glow": "0 0 16px rgba(0,224,255,0.3)",
  "--grid": "rgba(0,224,255,0.05)",
  "--chip": "rgba(0,224,255,0.12)",

  "--aurora-a": "rgba(0,224,255,0.35)",
  "--aurora-b": "rgba(25,255,208,0.3)",
  "--aurora-opacity": "0.6",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile":
    "linear-gradient(158deg, rgba(15,43,58,0.92) 0%, rgba(9,28,40,0.86) 100%)",
  "--tile-shadow":
    "0 5px 16px -7px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
  "--panel-shadow": "none",
};

/**
 * Holo light — v2 from PROTO `themesLight.holo` (Task 2 brief), with two
 * deliberate readability deviations (parity round-2 item 2, user decision):
 * `--panel` alpha raised 0.62 → 0.82 and `--panel-head` made an opaque light
 * surface (the old rgba(0,150,179,0.07) tint composited over white) so panel
 * heads and the footer read clearly over the ambient backdrop. Everything
 * else comes straight from the prototype's light theme table.
 */
const holoLight: ThemeTokens = {
  "--bg-primary": "#e7eff3",
  "--bg-secondary": "#f6fbfd",
  "--bg-header": "#f6fbfd",
  "--bg-footer": "#f6fbfd",
  "--bg-tile": "rgba(200,240,250,0.7)",
  "--bg-overlay": "rgba(0,6,10,0.4)",
  "--bg-brand-primary": "#0096b3",

  "--text-primary": "#0a2330",
  "--text-secondary": "rgba(22,72,92,0.72)",
  "--text-muted": "rgba(45,95,115,0.5)",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#0a9e63",
  "--accent-negative": "#d63d52",
  "--accent-aware": "#cc8800",
  "--accent-primary": "#0096b3",
  "--accent-2": "#0ab39a",

  "--border-primary": "rgba(0,150,179,0.26)",
  "--border-subtle": "rgba(0,180,204,0.15)",
  "--border": "rgba(0,150,179,0.26)",
  "--border-strong": "rgba(0,135,165,0.58)",

  "--status-connected": "#0a9e63",
  "--status-connecting": "#cc8800",
  "--status-disconnected": "#d63d52",
  "--status-error": "#d63d52",

  "--panel": "rgba(255,255,255,0.82)",
  "--panel-head": "#edf8fa",
  "--panel-blur": "14px",
  "--glow": "0 0 14px rgba(0,150,179,0.2)",
  "--grid": "rgba(0,150,179,0.06)",
  "--chip": "rgba(0,150,179,0.12)",

  "--aurora-a": "rgba(0,180,204,0.2)",
  "--aurora-b": "rgba(0,204,158,0.18)",
  "--aurora-opacity": "0.12",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile": "linear-gradient(158deg, #ffffff 0%, #edf6f9 100%)",
  "--tile-shadow":
    "0 5px 14px -7px rgba(20,60,80,0.22), 0 1px 2px rgba(20,60,80,0.1), inset 0 1px 0 rgba(255,255,255,0.85)",
  "--panel-shadow": "none",
};

// ---------------------------------------------------------------------------
// Holo 3D — the holo palette with physical depth: gradient panel/chip fills
// and layered panel/tile shadows. PROTO `themes.holo3d` (L772) dark and
// `themesLight.holo3d` (L779) light, verbatim; derived keys (overlay from the
// dark bg, subtle border, aurora stops, blur, on-accent, aware) follow the
// flat holo entries' derivations.
// ---------------------------------------------------------------------------

const holo3dDark: ThemeTokens = {
  "--bg-primary": "#00080e",
  "--bg-secondary": "#04161f",
  "--bg-header": "#04161f",
  "--bg-footer": "#04161f",
  // holo's flat sibling's solid --bg-tile — a gradient can't fill
  // --bg-tile's color positions.
  "--bg-tile": "rgba(6,26,38,0.5)",
  "--bg-overlay": "rgba(0,8,14,0.78)",
  "--bg-brand-primary": "#00e5ff",

  "--text-primary": "#dcf8ff",
  "--text-secondary": "rgba(150,210,228,0.64)",
  "--text-muted": "rgba(120,190,210,0.44)",
  "--text-on-accent": "#00080e",

  "--accent-positive": "#2bffb3",
  "--accent-negative": "#ff5d73",
  "--accent-aware": "#ffb000",
  "--accent-primary": "#00e5ff",
  "--accent-2": "#19ffd0",

  "--border-primary": "rgba(0,224,255,0.30)",
  "--border-subtle": "rgba(0,224,255,0.12)",
  "--border": "rgba(0,224,255,0.30)",
  "--border-strong": "rgba(0,224,255,0.66)",

  "--status-connected": "#2bffb3",
  "--status-connecting": "#ffb000",
  "--status-disconnected": "#ff5d73",
  "--status-error": "#ff5d73",

  "--panel":
    "linear-gradient(157deg, rgba(13,44,60,0.66) 0%, rgba(6,22,33,0.52) 54%, rgba(3,14,22,0.5) 100%)",
  "--panel-head":
    "linear-gradient(180deg, rgba(0,224,255,0.13) 0%, rgba(0,224,255,0.02) 100%)",
  "--panel-blur": "14px",
  "--glow": "0 0 16px rgba(0,224,255,0.32)",
  "--grid": "rgba(0,224,255,0.05)",
  "--chip":
    "linear-gradient(180deg, rgba(0,224,255,0.18), rgba(0,224,255,0.07))",

  "--aurora-a": "rgba(0,224,255,0.35)",
  "--aurora-b": "rgba(25,255,208,0.3)",
  "--aurora-opacity": "0.5",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile":
    "linear-gradient(157deg, rgba(18,52,68,0.95) 0%, rgba(10,30,43,0.88) 100%)",
  "--tile-shadow":
    "0 8px 20px -10px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.07)",
  "--panel-shadow":
    "0 14px 38px -12px rgba(0,0,0,0.72), 0 3px 10px -3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(0,224,255,0.04)",
};

/**
 * Holo 3D light — PROTO `themesLight.holo3d` (L779); derived keys follow
 * holoLight (overlay = holo3d dark bg at 0.4, white on-accent, amber aware,
 * aurora from the light accents at holoLight's opacities). Same readability
 * deviations as holoLight (parity round-2 item 2, user decision): `--panel`
 * gradient alphas raised 0.84/0.74 → 0.98/0.94 and `--panel-head` stops made
 * opaque (the old tints composited over white).
 */
const holo3dLight: ThemeTokens = {
  "--bg-primary": "#e3edf2",
  "--bg-secondary": "#f3f9fc",
  "--bg-header": "#f3f9fc",
  "--bg-footer": "#f3f9fc",
  // holo's flat sibling's solid --bg-tile — a gradient can't fill
  // --bg-tile's color positions.
  "--bg-tile": "rgba(200,240,250,0.7)",
  "--bg-overlay": "rgba(0,8,14,0.4)",
  "--bg-brand-primary": "#0096b3",

  "--text-primary": "#0a2330",
  "--text-secondary": "rgba(22,72,92,0.74)",
  "--text-muted": "rgba(45,95,115,0.52)",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#0a9e63",
  "--accent-negative": "#d63d52",
  "--accent-aware": "#cc8800",
  "--accent-primary": "#0096b3",
  "--accent-2": "#0ab39a",

  "--border-primary": "rgba(0,150,179,0.3)",
  "--border-subtle": "rgba(0,180,204,0.15)",
  "--border": "rgba(0,150,179,0.3)",
  "--border-strong": "rgba(0,135,165,0.6)",

  "--status-connected": "#0a9e63",
  "--status-connecting": "#cc8800",
  "--status-disconnected": "#d63d52",
  "--status-error": "#d63d52",

  "--panel":
    "linear-gradient(157deg, rgba(255,255,255,0.98) 0%, rgba(231,243,248,0.94) 100%)",
  "--panel-head": "linear-gradient(180deg, #e0f2f6 0%, #fafdfd 100%)",
  "--panel-blur": "14px",
  "--glow": "0 0 14px rgba(0,150,179,0.22)",
  "--grid": "rgba(0,150,179,0.06)",
  "--chip":
    "linear-gradient(180deg, rgba(0,150,179,0.16), rgba(0,150,179,0.05))",

  "--aurora-a": "rgba(0,180,204,0.2)",
  "--aurora-b": "rgba(0,204,158,0.18)",
  "--aurora-opacity": "0.12",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile": "linear-gradient(157deg, #ffffff 0%, #e9f4f7 100%)",
  "--tile-shadow":
    "0 8px 18px -10px rgba(20,60,80,0.24), inset 0 1px 0 rgba(255,255,255,0.9)",
  "--panel-shadow":
    "0 14px 34px -12px rgba(20,60,80,0.26), 0 3px 8px -3px rgba(20,60,80,0.15), inset 0 1px 0 rgba(255,255,255,0.95)",
};

// ---------------------------------------------------------------------------
// Terminal — Bloomberg-grade pro terminal (flat/solid, amber-on-charcoal)
// Dark values mapped 1-to-1 from theme-tokens.css [data-theme="terminal"].
// Light: PROTO `themesLight.terminal` verbatim — light-grey backgrounds, dark text, amber accent.
// ---------------------------------------------------------------------------

const terminalDark: ThemeTokens = {
  "--bg-primary": "#0a0c10",
  "--bg-secondary": "#0e1116",
  "--bg-header": "#0e1116",
  "--bg-footer": "#0e1116",
  "--bg-tile": "#13161c",
  "--bg-overlay": "rgba(10,12,16,0.8)",
  "--bg-brand-primary": "#ffb000",

  "--text-primary": "#e8ebf1",
  "--text-secondary": "#8b93a1",
  "--text-muted": "#59616e",
  "--text-on-accent": "#0a0c10",

  "--accent-positive": "#37d27e",
  "--accent-negative": "#ff5b52",
  "--accent-aware": "#ffb000",
  "--accent-primary": "#ffb000",
  "--accent-2": "#4a9eff",

  "--border-primary": "#262b34",
  "--border-subtle": "#1a1e25",
  "--border": "#262b34",
  "--border-strong": "#3a4351",

  "--status-connected": "#37d27e",
  "--status-connecting": "#ffb000",
  "--status-disconnected": "#ff5b52",
  "--status-error": "#ff5b52",

  "--panel": "#13161c",
  "--panel-head": "#171b22",
  "--panel-blur": "0",
  "--glow": "none",
  "--grid": "rgba(255,255,255,0.022)",
  "--chip": "rgba(255,176,0,0.14)",

  "--aurora-a": "rgba(255,176,0,0.15)",
  "--aurora-b": "rgba(74,158,255,0.12)",
  "--aurora-opacity": "0.22",

  "--font-display": "'IBM Plex Sans', sans-serif",
  "--font-mono": "'IBM Plex Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile": "linear-gradient(180deg, #1b2029 0%, #15191f 100%)",
  "--tile-shadow":
    "0 3px 10px -4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
  "--panel-shadow": "none",
};

/**
 * Terminal light — v2 verbatim from PROTO `themesLight.terminal` (Task 2
 * brief), not derived.
 */
const terminalLight: ThemeTokens = {
  "--bg-primary": "#eef0f3",
  "--bg-secondary": "#fafbfc",
  "--bg-header": "#fafbfc",
  "--bg-footer": "#fafbfc",
  "--bg-tile": "#ffffff",
  "--bg-overlay": "rgba(10,12,16,0.35)",
  "--bg-brand-primary": "#b67700",

  "--text-primary": "#1a1f27",
  "--text-secondary": "#5b6470",
  "--text-muted": "#8b93a1",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#1f8a52",
  "--accent-negative": "#cf4339",
  "--accent-aware": "#b37a00",
  "--accent-primary": "#b67700",
  "--accent-2": "#2f6fd0",

  "--border-primary": "#d4d8de",
  "--border-subtle": "#e2e5ea",
  "--border": "#d4d8de",
  "--border-strong": "#a8b0bb",

  "--status-connected": "#1f8a52",
  "--status-connecting": "#b37a00",
  "--status-disconnected": "#cf4339",
  "--status-error": "#cf4339",

  "--panel": "#ffffff",
  "--panel-head": "#eef1f4",
  "--panel-blur": "0",
  "--glow": "none",
  "--grid": "rgba(0,0,0,0.03)",
  "--chip": "rgba(182,119,0,0.13)",

  "--aurora-a": "rgba(179,122,0,0.08)",
  "--aurora-b": "rgba(46,109,181,0.07)",
  "--aurora-opacity": "0.07",

  "--font-display": "'IBM Plex Sans', sans-serif",
  "--font-mono": "'IBM Plex Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile": "linear-gradient(180deg, #ffffff 0%, #f4f6f8 100%)",
  "--tile-shadow":
    "0 3px 9px -4px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
  "--panel-shadow": "none",
};

// ---------------------------------------------------------------------------
// Terminal 3D — the terminal palette with physical depth: gradient panel/chip
// fills and layered panel/tile shadows. PROTO `themes.terminal3d` (L774) dark
// and `themesLight.terminal3d` (L781) light, verbatim; derived keys follow the
// flat terminal entries' derivations.
// ---------------------------------------------------------------------------

const terminal3dDark: ThemeTokens = {
  "--bg-primary": "#090b0f",
  "--bg-secondary": "#0d1015",
  "--bg-header": "#0d1015",
  "--bg-footer": "#0d1015",
  // terminal's flat sibling's solid --bg-tile — a gradient can't fill
  // --bg-tile's color positions.
  "--bg-tile": "#13161c",
  "--bg-overlay": "rgba(9,11,15,0.8)",
  "--bg-brand-primary": "#ffb000",

  "--text-primary": "#e8ebf1",
  "--text-secondary": "#8b93a1",
  "--text-muted": "#59616e",
  "--text-on-accent": "#090b0f",

  "--accent-positive": "#37d27e",
  "--accent-negative": "#ff5b52",
  "--accent-aware": "#ffb000",
  "--accent-primary": "#ffb000",
  "--accent-2": "#4a9eff",

  "--border-primary": "#2a303a",
  "--border-subtle": "#1a1e25",
  "--border": "#2a303a",
  "--border-strong": "#414b5a",

  "--status-connected": "#37d27e",
  "--status-connecting": "#ffb000",
  "--status-disconnected": "#ff5b52",
  "--status-error": "#ff5b52",

  "--panel": "linear-gradient(160deg, #181c24 0%, #11141a 100%)",
  "--panel-head": "linear-gradient(180deg, #1c212a 0%, #14181e 100%)",
  "--panel-blur": "0",
  "--glow": "none",
  "--grid": "rgba(255,255,255,0.02)",
  "--chip":
    "linear-gradient(180deg, rgba(255,176,0,0.18), rgba(255,176,0,0.07))",

  "--aurora-a": "rgba(255,176,0,0.15)",
  "--aurora-b": "rgba(74,158,255,0.12)",
  "--aurora-opacity": "0.16",

  "--font-display": "'IBM Plex Sans', sans-serif",
  "--font-mono": "'IBM Plex Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile": "linear-gradient(180deg, #1f2530 0%, #161b22 100%)",
  "--tile-shadow":
    "0 5px 16px -7px rgba(0,0,0,0.72), 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
  "--panel-shadow":
    "0 14px 38px -12px rgba(0,0,0,0.8), 0 3px 10px -3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
};

/**
 * Terminal 3D light — PROTO `themesLight.terminal3d` (L781) verbatim; derived
 * keys follow terminalLight (overlay = terminal3d dark bg at 0.35, white
 * on-accent, `#b37a00` aware/connecting, aurora at terminalLight's opacities).
 */
const terminal3dLight: ThemeTokens = {
  "--bg-primary": "#e9ecef",
  "--bg-secondary": "#f6f7f9",
  "--bg-header": "#f6f7f9",
  "--bg-footer": "#f6f7f9",
  // terminal's flat sibling's solid --bg-tile — a gradient can't fill
  // --bg-tile's color positions.
  "--bg-tile": "#ffffff",
  "--bg-overlay": "rgba(9,11,15,0.35)",
  "--bg-brand-primary": "#b67700",

  "--text-primary": "#1a1f27",
  "--text-secondary": "#5b6470",
  "--text-muted": "#8b93a1",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#1f8a52",
  "--accent-negative": "#cf4339",
  "--accent-aware": "#b37a00",
  "--accent-primary": "#b67700",
  "--accent-2": "#2f6fd0",

  "--border-primary": "#d2d6dc",
  "--border-subtle": "#e2e5ea",
  "--border": "#d2d6dc",
  "--border-strong": "#a8b0bb",

  "--status-connected": "#1f8a52",
  "--status-connecting": "#b37a00",
  "--status-disconnected": "#cf4339",
  "--status-error": "#cf4339",

  "--panel": "linear-gradient(160deg, #ffffff 0%, #eef0f3 100%)",
  "--panel-head": "linear-gradient(180deg, #f2f4f6 0%, #e8ebef 100%)",
  "--panel-blur": "0",
  "--glow": "none",
  "--grid": "rgba(0,0,0,0.03)",
  "--chip":
    "linear-gradient(180deg, rgba(182,119,0,0.16), rgba(182,119,0,0.06))",

  "--aurora-a": "rgba(179,122,0,0.08)",
  "--aurora-b": "rgba(46,109,181,0.07)",
  "--aurora-opacity": "0.06",

  "--font-display": "'IBM Plex Sans', sans-serif",
  "--font-mono": "'IBM Plex Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile": "linear-gradient(180deg, #ffffff 0%, #edf0f3 100%)",
  "--tile-shadow":
    "0 5px 14px -7px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
  "--panel-shadow":
    "0 14px 34px -12px rgba(0,0,0,0.2), 0 3px 8px -3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.95)",
};

// ---------------------------------------------------------------------------
// Neon — high-contrast cyberpunk (magenta / cyan, aurora FX, blur=12px)
// Dark values mapped 1-to-1 from theme-tokens.css [data-theme="neon"].
// Light: PROTO `themesLight.neon` verbatim — white/lavender backgrounds, dark text, magenta accent.
// ---------------------------------------------------------------------------

const neonDark: ThemeTokens = {
  "--bg-primary": "#070210",
  "--bg-secondary": "#12041f",
  "--bg-header": "#12041f",
  "--bg-footer": "#12041f",
  "--bg-tile": "rgba(28,6,46,0.52)",
  "--bg-overlay": "rgba(7,2,16,0.8)",
  "--bg-brand-primary": "#ff2bd6",

  "--text-primary": "#f7e9ff",
  "--text-secondary": "rgba(214,160,235,0.7)",
  "--text-muted": "rgba(180,120,210,0.45)",
  "--text-on-accent": "#070210",

  "--accent-positive": "#00ffa3",
  "--accent-negative": "#ff3864",
  "--accent-aware": "#ffb000",
  "--accent-primary": "#ff2bd6",
  "--accent-2": "#00f0ff",

  "--border-primary": "rgba(255,43,214,0.36)",
  "--border-subtle": "rgba(255,43,214,0.18)",
  "--border": "rgba(255,43,214,0.36)",
  "--border-strong": "rgba(255,43,214,0.72)",

  "--status-connected": "#00ffa3",
  "--status-connecting": "#ffb000",
  "--status-disconnected": "#ff3864",
  "--status-error": "#ff3864",

  "--panel": "rgba(28,6,46,0.52)",
  "--panel-head": "rgba(255,43,214,0.08)",
  "--panel-blur": "12px",
  "--glow": "0 0 18px rgba(255,43,214,0.4)",
  "--grid": "rgba(255,43,214,0.07)",
  "--chip": "rgba(255,43,214,0.14)",

  "--aurora-a": "rgba(255,43,214,0.4)",
  "--aurora-b": "rgba(0,240,255,0.3)",
  "--aurora-opacity": "0.7",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile":
    "linear-gradient(158deg, rgba(42,11,64,0.9) 0%, rgba(26,7,42,0.84) 100%)",
  "--tile-shadow":
    "0 5px 16px -7px rgba(0,0,0,0.62), 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
  "--panel-shadow": "none",
};

/**
 * Neon light — v2 from PROTO `themesLight.neon` (Task 2 brief), with the same
 * readability deviations as holoLight (parity round-2 item 2, user decision):
 * `--panel` alpha raised 0.62 → 0.82 and `--panel-head` made an opaque light
 * surface (the old rgba(200,0,160,0.07) tint composited over white).
 */
const neonLight: ThemeTokens = {
  "--bg-primary": "#f4ebf3",
  "--bg-secondary": "#fdf6fb",
  "--bg-header": "#fdf6fb",
  "--bg-footer": "#fdf6fb",
  "--bg-tile": "rgba(240,210,255,0.65)",
  "--bg-overlay": "rgba(7,2,16,0.35)",
  "--bg-brand-primary": "#c800a0",

  "--text-primary": "#2a0a26",
  "--text-secondary": "rgba(95,32,85,0.72)",
  "--text-muted": "rgba(125,62,115,0.5)",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#0a9e63",
  "--accent-negative": "#d63d52",
  "--accent-aware": "#cc8800",
  "--accent-primary": "#c800a0",
  "--accent-2": "#0093b3",

  "--border-primary": "rgba(200,0,160,0.28)",
  "--border-subtle": "rgba(200,0,160,0.15)",
  "--border": "rgba(200,0,160,0.28)",
  "--border-strong": "rgba(190,0,150,0.58)",

  "--status-connected": "#0a9e63",
  "--status-connecting": "#cc8800",
  "--status-disconnected": "#d63d52",
  "--status-error": "#d63d52",

  "--panel": "rgba(255,255,255,0.82)",
  "--panel-head": "#fbedf8",
  "--panel-blur": "12px",
  "--glow": "0 0 14px rgba(200,0,160,0.2)",
  "--grid": "rgba(200,0,160,0.06)",
  "--chip": "rgba(200,0,160,0.12)",

  "--aurora-a": "rgba(200,0,160,0.2)",
  "--aurora-b": "rgba(0,184,204,0.18)",
  "--aurora-opacity": "0.12",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
  "--font-logo": "'Orbitron', sans-serif",

  "--tile": "linear-gradient(158deg, #ffffff 0%, #f7ecf5 100%)",
  "--tile-shadow":
    "0 5px 14px -7px rgba(80,20,70,0.24), 0 1px 2px rgba(80,20,70,0.1), inset 0 1px 0 rgba(255,255,255,0.85)",
  "--panel-shadow": "none",
};

// ---------------------------------------------------------------------------
// Skin × Mode token store
// ---------------------------------------------------------------------------

export const themeTokens: Record<ThemeSkin, Record<ThemeMode, ThemeTokens>> = {
  classic: { dark: darkTokens, light: lightTokens },
  holo: { dark: holoDark, light: holoLight },
  holo3d: { dark: holo3dDark, light: holo3dLight },
  terminal: { dark: terminalDark, light: terminalLight },
  terminal3d: { dark: terminal3dDark, light: terminal3dLight },
  neon: { dark: neonDark, light: neonLight },
};
