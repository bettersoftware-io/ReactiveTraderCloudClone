/**
 * Design tokens for dark and light themes.
 * Applied as CSS custom properties on :root via ThemeProvider.
 *
 * The token store is keyed by ThemeSkin × ThemeMode and covers all four skins:
 *   classic  — pre-redesign blue palette (neutral on aurora / blur / glow)
 *   holo     — Iron Man / Minority Report cyan HUD (glass panels, aurora FX)
 *   terminal — Bloomberg-grade pro terminal (solid, amber-on-charcoal)
 *   neon     — high-contrast cyberpunk (magenta / cyan, aurora FX)
 *
 * Dark values for holo / terminal / neon are mapped 1-to-1 from
 * docs/design/v1/dev-handoff/theme-tokens.css.  Light variants are derived:
 * backgrounds lifted toward white/light-grey, text inverted to dark, accents
 * kept from the skin family, aurora-opacity reduced.
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
};

// ---------------------------------------------------------------------------
// Holo — Iron Man / Minority Report cyan HUD (glass, aurora, blur=14px)
// Dark values mapped 1-to-1 from theme-tokens.css [data-theme="holo"].
// Light: lifted backgrounds, inverted text, same cyan accent, aurora-opacity 0.25.
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
};

const holoLight: ThemeTokens = {
  "--bg-primary": "#e8f9fd",
  "--bg-secondary": "#cdf1f9",
  "--bg-header": "#ffffff",
  "--bg-footer": "#ffffff",
  "--bg-tile": "rgba(200,240,250,0.7)",
  "--bg-overlay": "rgba(0,6,10,0.4)",
  "--bg-brand-primary": "#00b4cc",

  "--text-primary": "#002a35",
  "--text-secondary": "rgba(0,60,80,0.7)",
  "--text-muted": "rgba(0,60,80,0.45)",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#00c985",
  "--accent-negative": "#e8304a",
  "--accent-aware": "#cc8800",
  "--accent-primary": "#00b4cc",
  "--accent-2": "#00cc9e",

  "--border-primary": "rgba(0,180,204,0.3)",
  "--border-subtle": "rgba(0,180,204,0.15)",
  "--border-strong": "rgba(0,180,204,0.65)",

  "--status-connected": "#00c985",
  "--status-connecting": "#cc8800",
  "--status-disconnected": "#e8304a",
  "--status-error": "#e8304a",

  "--panel": "rgba(200,240,250,0.7)",
  "--panel-head": "rgba(0,180,204,0.08)",
  "--panel-blur": "14px",
  "--glow": "0 0 14px rgba(0,180,204,0.25)",
  "--grid": "rgba(0,180,204,0.06)",
  "--chip": "rgba(0,180,204,0.14)",

  "--aurora-a": "rgba(0,180,204,0.2)",
  "--aurora-b": "rgba(0,204,158,0.18)",
  "--aurora-opacity": "0.25",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
};

// ---------------------------------------------------------------------------
// Terminal — Bloomberg-grade pro terminal (flat/solid, amber-on-charcoal)
// Dark values mapped 1-to-1 from theme-tokens.css [data-theme="terminal"].
// Light: lifted charcoal → light-grey backgrounds, dark text, amber accent retained.
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
};

const terminalLight: ThemeTokens = {
  "--bg-primary": "#f4f5f7",
  "--bg-secondary": "#eaecef",
  "--bg-header": "#ffffff",
  "--bg-footer": "#ffffff",
  "--bg-tile": "#ffffff",
  "--bg-overlay": "rgba(10,12,16,0.35)",
  "--bg-brand-primary": "#b37a00",

  "--text-primary": "#12151c",
  "--text-secondary": "#3e4452",
  "--text-muted": "#6b7280",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#1fa856",
  "--accent-negative": "#d93a33",
  "--accent-aware": "#b37a00",
  "--accent-primary": "#b37a00",
  "--accent-2": "#2e6db5",

  "--border-primary": "#c8cdd6",
  "--border-subtle": "#e2e5ea",
  "--border-strong": "#9098a8",

  "--status-connected": "#1fa856",
  "--status-connecting": "#b37a00",
  "--status-disconnected": "#d93a33",
  "--status-error": "#d93a33",

  "--panel": "#ffffff",
  "--panel-head": "#f0f2f5",
  "--panel-blur": "0",
  "--glow": "none",
  "--grid": "rgba(0,0,0,0.04)",
  "--chip": "rgba(179,122,0,0.12)",

  "--aurora-a": "rgba(179,122,0,0.08)",
  "--aurora-b": "rgba(46,109,181,0.07)",
  "--aurora-opacity": "0.12",

  "--font-display": "'IBM Plex Sans', sans-serif",
  "--font-mono": "'IBM Plex Mono', monospace",
};

// ---------------------------------------------------------------------------
// Neon — high-contrast cyberpunk (magenta / cyan, aurora FX, blur=12px)
// Dark values mapped 1-to-1 from theme-tokens.css [data-theme="neon"].
// Light: lifted backgrounds toward white/lavender, dark text, magenta accent retained.
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
};

const neonLight: ThemeTokens = {
  "--bg-primary": "#faf0fe",
  "--bg-secondary": "#f3e0fc",
  "--bg-header": "#ffffff",
  "--bg-footer": "#ffffff",
  "--bg-tile": "rgba(240,210,255,0.65)",
  "--bg-overlay": "rgba(7,2,16,0.35)",
  "--bg-brand-primary": "#c800a0",

  "--text-primary": "#1a0030",
  "--text-secondary": "rgba(80,10,120,0.75)",
  "--text-muted": "rgba(80,10,120,0.5)",
  "--text-on-accent": "#ffffff",

  "--accent-positive": "#00c97e",
  "--accent-negative": "#e8304a",
  "--accent-aware": "#cc8800",
  "--accent-primary": "#c800a0",
  "--accent-2": "#00b8cc",

  "--border-primary": "rgba(200,0,160,0.3)",
  "--border-subtle": "rgba(200,0,160,0.15)",
  "--border-strong": "rgba(200,0,160,0.65)",

  "--status-connected": "#00c97e",
  "--status-connecting": "#cc8800",
  "--status-disconnected": "#e8304a",
  "--status-error": "#e8304a",

  "--panel": "rgba(240,210,255,0.65)",
  "--panel-head": "rgba(200,0,160,0.08)",
  "--panel-blur": "12px",
  "--glow": "0 0 16px rgba(200,0,160,0.3)",
  "--grid": "rgba(200,0,160,0.06)",
  "--chip": "rgba(200,0,160,0.12)",

  "--aurora-a": "rgba(200,0,160,0.2)",
  "--aurora-b": "rgba(0,184,204,0.18)",
  "--aurora-opacity": "0.25",

  "--font-display": "'Chakra Petch', sans-serif",
  "--font-mono": "'JetBrains Mono', monospace",
};

// ---------------------------------------------------------------------------
// Skin × Mode token store
// ---------------------------------------------------------------------------

export const themeTokens: Record<ThemeSkin, Record<ThemeMode, ThemeTokens>> = {
  classic: { dark: darkTokens, light: lightTokens },
  holo: { dark: holoDark, light: holoLight },
  terminal: { dark: terminalDark, light: terminalLight },
  neon: { dark: neonDark, light: neonLight },
};
