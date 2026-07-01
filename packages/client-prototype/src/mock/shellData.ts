import type { Language, Notif, Skin, StatusItem, User } from "#/mock/types";

export const user: User = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  id: "TRD-0042",
};

export const languages: Language[] = [
  { code: "EN", label: "English" },
  { code: "中文", label: "中文 (简体)" },
  { code: "日本", label: "日本語" },
  { code: "DE", label: "Deutsch" },
  { code: "FR", label: "Français" },
  { code: "ES", label: "Español" },
];

export const notifSeed: Notif[] = [
  {
    t: "09:46",
    tag: "LIMIT",
    msg: "EURUSD position at 80% of desk limit",
    color: "var(--accent)",
  },
  {
    t: "09:41",
    tag: "NEWS",
    msg: "ECB rate decision in 25 minutes",
    color: "var(--accent2)",
  },
  {
    t: "09:38",
    tag: "SETTLE",
    msg: "2 trades settle today · value 25-Jun",
    color: "var(--buy)",
  },
];

// Static representative values for P1; live wiring arrives with Admin metrics (P5).
export const statusItems: StatusItem[] = [
  { label: "LAT", value: "42ms", color: "var(--text)" },
  { label: "TPUT", value: "1.2k/s", color: "var(--text)" },
  { label: "FPS", value: "60", color: "var(--text)" },
  { label: "MEM", value: "284MB", color: "var(--text)" },
  { label: "POS", value: "2", color: "var(--text)" },
  { label: "P&L", value: "+$17,120", color: "var(--buy)" },
  { label: "SES", value: "1280", color: "var(--text)" },
];

export const themeNames: Record<Skin, string> = {
  holo: "Holo HUD",
  holo3d: "Holo HUD 3D",
  terminal: "Terminal",
  terminal3d: "Terminal 3D",
  neon: "Neon Grid",
};
