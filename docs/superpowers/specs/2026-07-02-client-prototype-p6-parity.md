# Client-Prototype P6 — Parity Pass (Design Spec)

**Date:** 2026-07-02
**Package:** `@rtc/client-prototype`
**Phase:** P6 (final) of the client-prototype workstream
**Master spec:** `docs/superpowers/specs/2026-06-30-client-prototype-design.md` §6 — *"P6 — Parity pass: side-by-side review vs the standalone HTML; close visual/behavior gaps; final compliance sweep."*

---

## 1. Purpose

Close every catalogued and freshly-audited visual/behavior gap between the built React
port and the canonical design prototype, then run a final compliance sweep. P6 is
**purely corrective** — no new features, no new screens. All five feature screens (FX,
Credit, Equities, Admin) plus the global chrome already ship; this phase makes them match
the canonical target.

**Canonical target (the authority for every "should be"):**
- `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` (markup + inline styles + logic class)
- `docs/design/v2/dev-handoff/prototype/source/support.js` (runtime + component logic)
- `docs/design/v2/dev-handoff/theme-tokens.css`, `HANDOFF.md`

## 2. Scope

**In scope:** the 22 divergences catalogued in §5 below, grouped into three change
layers. **Out of scope:** anything not in §5 — no new screens, no architecture changes
beyond the App.tsx overlay rework, no production concerns (services/persistence/auth).

### Decisions (locked with the user during brainstorming)

| Decision | Choice |
|---|---|
| Font loading | **Google Fonts `<link>`** (verbatim from canonical `<helmet>`) — faithful, zero new deps |
| Double head-bar | **Include the fix** — collapse to one combined bar via a `Panel` head-contract change |
| Reboot/Sign-Out state | **Include the overlay rework** — persistent `AppShell`, Boot/Lock as overlays |
| Theme persistence | **Keep + document** — the port's `localStorage` skin/mode persistence stays as an intentional improvement |
| Active-tab header pill | **Apply globally** — pill treatment on all single-panel header labels (folded into the head-contract change) |

## 3. Fidelity notes — accepted-as-is deviations (documented, NOT fixed)

These are deliberate; a reviewer must **not** flag them as gaps:

1. **Theme persistence** (`ThemeProvider` `rt_skin`/`rt_mode` localStorage) — kept as an
   improvement over canonical (which always boots holo/dark).
2. **Fixed lock-screen session ID** (`LockScreen.tsx` `SESSION_ID = "RT-7F3A2"`) — canonical
   randomizes per load; the port fixes it for test stability.
3. **Rajdhani** appears only as a mock preference-option *label* in `prefs.ts`; canonical
   never loads it either, so it is intentionally excluded from the font `<link>`.
4. Pre-existing P2–P5 deviations remain accepted: FX stable per-symbol vol, live-only PnL,
   JPY pip-block decimal; Equities stable vol + render-overlay last candle + 400ms flash
   ticker; Admin seeded-once latency jitter + synthetic `EVENT_POOL` + static service health;
   Credit self-contained duplicated formatters + outer-head region labels + no-maximize form.

## 4. Architecture — three change layers

### Layer 1 — Shared infrastructure (one change, every screen benefits)

**1a. Display fonts.** Copy the canonical `<helmet>` block into `packages/client-prototype/index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet">
```
Every `font-family` already referenced in tokens/CSS then resolves to the real face instead
of a system fallback. No token or component change required.

**1b. `useFlip` motion tuning** (`src/motion/useFlip.ts`).
- `DEFAULT_DUR_MS` **480 → 440**.
- Add a **~0.5px move-threshold**: in `playGlide`, a node whose `|dx| < 0.5 && |dy| < 0.5`
  is skipped (no `element.animate` call), suppressing sub-pixel jitter glides. Canonical
  applies the same guard.

**1c. `Panel` head-contract rework** (`src/layout/Panel.tsx` + `.module.css`) — the single
shared-API change, and the invasive item.
- **Maximize glyph** `⤢/⤡` → **`⛶/⧉`** (`⛶` expand, `⧉` restore) — matches canonical `mxBtn`.
- **New inline slot** `headControls?: ReactNode` — rendered right-aligned inside the *same*
  38px head bar, between the label and the maximize button. Feature panels move their
  tab/pill/count rows into this slot and delete their own second `.head` bar.
- **Active-tab pill label** — the head label gets the canonical `tabActive` treatment:
  lit `background: var(--panel)`, `border-bottom: 2px solid var(--accent)`, `padding: 9px 14px`,
  `font-size: 11px`, `letter-spacing: 0.06em`. This delivers the global pill decision and,
  once consumers collapse their bars, yields canonical's single-bar chrome.
- Backward-compatible: `headControls` is optional; single-panel screens (Admin) that pass
  only a label get the pill treatment automatically with no second bar to remove.

### Layer 2 — Shell lifecycle (`src/shell/`, `App.tsx`)

**2a. Overlay Boot/Lock over a persistent `AppShell`.** Today `App.tsx` conditionally
renders `<BootSequence>` / `<LockScreen>` *instead of* `<AppShell>`, unmounting it and
discarding all per-screen `useState` (tile notionals, filters, panel layout, splits).
Rework so `<AppShell>` stays mounted and Boot/Lock render as `position: fixed` high-z
overlays on top. Reboot and Sign-Out→re-auth then preserve all screen state.

**2b. Boot wordmark + subtitle + glitch.** Add above the boot canvas: an Orbitron 900
`REACTIVE TRADER` wordmark (`letter-spacing: 0.42em`, `bootGlitch 2.4s infinite`) and a
`TACTICAL TRADING OPERATING SYSTEM · v4.0` subtitle. Add the `bootGlitch` keyframes.

**2c. Boot→app fade-out** (`bootFading`). On reaching 100%, wait ~130ms, then run a 0.72s
`opacity 1→0, scale 1→1.05, blur 0→7px` transition on the boot overlay before it unmounts
(~930ms total) instead of an instant cut.

**2d. `appReveal` entrance.** Apply the already-defined `@keyframes appReveal`
(`global.css`) — `appReveal .8s cubic-bezier(.22,.61,.36,1) both` — to `.shell` so the app
animates in.

### Layer 3 — Per-screen behavior fixes

**FX** (`src/fx/`):
- `Math.abs()` on the down-move pip display (`RateTile`/`WatchlistView`) — drop the redundant `-`.
- `bookPulse` accent-ring glow (~1s) on a tile after a successful book (thread `tile.stage === "success"`).
- Blotter count renders **`N trades`**, not a bare number.
- Tile border strengthens to `var(--border-strong)` while any exec/RFQ/done overlay is active.
- Pip flash colored by the **triggering tick's** direction (`flash.dir`), not the daily move direction.
- ActivityView React key made collision-proof (append a per-event sequence/index so two
  identical same-second events cannot dup-warn).
- *Head controls* (Live Rates view tabs, Blotter/Activity tabs) fold into `Panel.headControls`; second bars removed.

**Credit** (`src/credit/`):
- Auto-exit `cardOut` fade for a live RFQ that resolves (accepted/cancelled/expired) while on
  the LIVE tab, during its ~380ms retain window.
- Tab-switch `cardIn` stagger cascade (index × ~45ms) when `now - tabChangedAt < 480`.
- LIVE pill count formats as **`LIVE (n)`** when n>0, bare **`LIVE`** when 0.
- Seeded closed-RFQ losing dealers get small deterministic price jitter (seeded RNG, not
  `Math.random`), not the identical accepted price.
- Drop the port-added open-state dropdown border highlight (`InstrumentSelect` `[data-open]`).
- *Head controls* (RFQs LIVE/CLOSED/ALL pills) fold into `Panel.headControls`; second bar removed.

**Equities** (`src/equities/`):
- Watchlist bespoke rank-glide: colored **highlight pulse** (green rose / red fell,
  inset box-shadow, ~820ms, keyframe offsets 0/0.3/1) + **bounce easing**
  `cubic-bezier(.34,1.28,.5,1)` + ~560ms glide — a watchlist-specific variant, not the
  generic `useFlip`.
- Watchlist `⊕` add-glyph `padding: 0 8px`.
- *Head controls* (Chart instrument tabs + timeframe pills, Orders/Positions tabs + count,
  Ticket, Watchlist controls) fold into `Panel.headControls`; second bars removed.

**Admin** (`src/admin/`):
- Service-health utilization bars get the neon `box-shadow: 0 0 8px <color>` glow (ONLINE
  buy / DEGRADED accent) that every other bar and dot on the screen already has.
- The "◈ Observability" label gets the pill treatment automatically from Layer 1c.

## 5. Audit provenance (the 22 findings)

Sourced from five parallel per-screen audits (shell/global, FX, Credit, Equities, Admin)
comparing the canonical source against each built folder, plus the pre-catalogued deferred
items. Severity: **VISIBLE** (obvious to any user), **SUBTLE** (side-by-side), **COSMETIC**.

- **Shared/known:** fonts [VISIBLE], FLIP timing [SUBTLE], maximize glyph [VISIBLE], double
  head-bar [VISIBLE].
- **Shell:** boot wordmark [VISIBLE], boot→app fade [VISIBLE], appReveal [VISIBLE],
  reboot/sign-out state loss [VISIBLE].
- **FX:** pip sign [VISIBLE], bookPulse [VISIBLE], "N trades" [VISIBLE], overlay border
  [SUBTLE], pip-flash direction [SUBTLE], ActivityView key [SUBTLE].
- **Credit:** auto-exit fade [VISIBLE], tab-switch stagger [VISIBLE], LIVE (n) format
  [VISIBLE], dealer-quote jitter [SUBTLE], dropdown border [COSMETIC].
- **Equities:** watchlist rank-glide [VISIBLE], `⊕` padding [COSMETIC].
- **Admin:** service-bar glow [SUBTLE], header pill (→ Layer 1c, global) [COSMETIC].

## 6. Global constraints (bind every task)

- **Self-contained package rules:** no `@rtc/domain`/`@rtc/shared`, no RxJS/machines, no
  ViewModel seam, no React Compiler. Full CSS Modules — zero inline `style={{}}` except the
  sanctioned named-const `--custom-property` escape hatch.
- **Render purity (StrictMode):** RNG frozen in a ref; seed via render-body ref-lazy-init
  (never in `useState`/`useMemo` initializers, both double-invoked); per-tick RNG inside a
  `setState` updater is the house pattern.
- **Lint conventions (the real config, not disables):** named `XxxProps` interfaces (no
  inline `TSTypeLiteral` params); `arrow-body-style: always`; module-level `function`
  declarations; `useExplicitType`; `useUniqueElementIds` (logical ids via a module const,
  never a literal). CSS `fill/stroke/color: none` fails `declaration-strict-value` → use
  `transparent`. `rtc/component-newspaper` is **not** enforced on client-prototype.
- **Per-task gate (all green before commit):** `typecheck` · `test` ·
  `eslint packages/client-prototype` · `stylelint "packages/client-prototype/src/**/*.css"` ·
  `biome ci packages/client-prototype`.
- **Repo-wide CI-only gates (final task + pre-ship):** `pnpm lint:dead` (knip — no dead
  exports; drop `export` on in-module-only types), `pnpm check:deps`, `pnpm check:versions`,
  `pnpm test:rules`.

## 7. Testing / verification

**jsdom smoke/unit** (where behavior is observable): pip sign, `N trades` label,
`LIVE (n)` formatting, ActivityView key uniqueness, FLIP 0.5px-threshold math, maximize
glyph text, font `<link>` present in `index.html`, and **screen state survives
reboot/sign-out** (genuinely testable via the persistent-AppShell rework).

**opus whole-branch review** — the net for jsdom-invisible paint/animation (fonts, glows,
`bookPulse`, `bootGlitch`, `appReveal`, `cardIn` stagger, watchlist highlight, service
glow). This has caught an invisible defect in P0/P4/P5; it is mandatory here given how many
P6 items are paint-only.

**One-time live browser side-by-side** — P6 *is* the visual parity gate (master spec §6).
After the fixes land, spin up the Vite dev server and screenshot each screen across a
couple of themes to eyeball fonts / boot / glows / motion against the standalone HTML. This
is phase-scoped verification only; the package deliberately has no permanent visual-golden
tier.

## 8. Execution & shipping

Subagent-driven (per-task implementer + two-stage review + final opus whole-branch review),
model-tiered (cheap for mechanical CSS/format transcription, standard for integration/motion,
opus for the final review). Then ship per the repo's five rules: worktree (already created)
→ push → PR → poll CI on `headSha` until green → merge with `--merge` on explicit user OK →
confirm ancestor → remove worktree.

## 9. Open questions

None blocking. Task decomposition granularity is finalized during planning (writing-plans);
the double-head-bar collapse may split into per-screen tasks after the shared `Panel`
contract change, each independently reviewable.
