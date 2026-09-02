#!/usr/bin/env python3
"""Build the RN-vs-prototype comparison report as one self-contained HTML file.

Reads the committed simctl goldens (app column) and the frozen prototype
reference shots (prototype column), makes 300px 256-colour PNG thumbnails via
ImageMagick, inlines them as data URIs, and writes docs/showcase/<out>.html.
"""
import base64, html, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(sys.argv[1])
OUT = ROOT / "docs/showcase/rn-prototype-fidelity-comparison.html"
APP = ROOT / "packages/client-react-native/tests/visual/__screenshots__/ios-iphone17-26/simctl"
REF = ROOT / "docs/design/mobile/v1/reference-shots"
COMMIT = sys.argv[2]
# The goldens as they were when this page was first built (2026-08-29,
# commit 89c694adc — before the fidelity pass touched a module), extracted
# with `git show 89c694adc:<path>` into a scratch dir.
BEFORE = Path(sys.argv[3])
BEFORE_COMMIT = "89c694adc"
# Optional overrides for a preview build outside the repo: an APP golden dir
# and an output path (argv[4], argv[5]).
if len(sys.argv) > 4:
    APP = Path(sys.argv[4])
if len(sys.argv) > 5:
    OUT = Path(sys.argv[5])
THUMB_W = 300   # display width (img width attr)
ENC_W = 900     # encoded width — 3x the display width, so the shots stay crisp zoomed
WEBP_Q = "85"   # full-colour lossy WebP; the old 256-colour PNG dithered every gradient

def before_figure(sid: str) -> str:
    src = BEFORE / f"{sid}.png"
    if src.exists():
        return f'<figure><img src="{thumb(src)}" alt="{html.escape(sid)} — before" loading="lazy" width="{THUMB_W}"><figcaption>Before · {BEFORE_COMMIT}</figcaption></figure>'
    return f'<figure><div class="absent">no golden at {BEFORE_COMMIT}<br><small>surface built during the pass</small></div><figcaption>Before · {BEFORE_COMMIT}</figcaption></figure>'

def thumb(path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".webp") as tmp:
        subprocess.run(["magick", str(path), "-resize", f"{ENC_W}x", "-strip", "-quality", WEBP_Q, tmp.name], check=True)
        return "data:image/webp;base64," + base64.b64encode(Path(tmp.name).read_bytes()).decode()

# verdict: close | moderate | far
MODULES = [
    ("lock/hold", "close", "Hold-to-unlock", [
        "Rebuilt to the design's stack (2026-08-30): accent glow, the 58px hex emblem with its dashed orbit, <code>SESSION LOCKED</code> in Orbitron, an <code>id · desk</code> line, the 112px ring with the <code>⌖</code> crosshair, <code>AUTHENTICATING…</code> beneath it while an unlock is in flight.",
        "The one addition the design lacks is the password field between the desk line and the ring — the ring here submits real credentials, so the field stays; it wears the tile idiom (1px border, radius 9, tracked mono placeholder). The design's line ends in a clock; the app's ends at the desk.",
        "Deliberately unframed on both sides — the design's lock has no chrome either.",
    ], None),
    ("credit/rfq-tiles", "close", "RFQ tiles", [
        "Rebuilt to the design (2026-08-30): the real desk names, five per card, uppercase; <code>◂ BEST</code> / <code>◂ WON</code> after the winning dealer; prices without <code>$</code>, the best in accent; subtitle <code>BUY · 5.0M USD · #101</code>; LIVE / DONE / ALL as outlined pills; every ACCEPT chip-tinted with the best one an accent gradient.",
        "What remains is data: the app's instruments are the domain's <code>Acme 5.5% 2030</code> where the design seeds tickers, and the domain spells <code>JP MORGAN</code> where the design has <code>J.P. MORGAN</code>.",
    ], None),
    ("equities/markets", "close", "Movers board", [
        "Rebuilt to the design (2026-08-30): the <code>MOVERS</code> heading and the whole <code>SECTORS</code> block are gone, <code>RANK BY</code> is the design's 8px tracked label with pill chips (solid accent when active), sparklines widened to the design's 64px.",
        "What remains is data: the fake's perfect sine sparklines and the domain simulator's six-symbol roster against the design's eight; a selected-row highlight the design has no equivalent of.",
    ], None),
    ("analytics/dashboard", "close", "P&amp;L · pair P&amp;L · net exposure", [
        "Rebuilt to the design (2026-08-30): <code>+$29,672</code> / <code>+420.0K</code> / <code>Δ +4.2K / 12S</code> formatting via RN-local formatters (the shared domain helpers still feed the web), the delta chip coloured by sign on the design's <code>panel-head</code> tint, seven pair rows and seven exposure bubbles over a 48-point tick history.",
        "Follow-up landed the same day: bubbles now take the design's own ramp (<code>30 + share · 44</code> px, so 30–74 px) instead of the web formula the domain hands the app, and the card sits fully above the fold. Residuals round (2026-08-31, #645): the diameter now rounds to a whole pixel before halving, as the design's <code>Math.round</code> does — every bubble had sat a sub-pixel off.",
    ], None),
    ("shell/appearance", "close", "Appearance sheet", [
        "Rebuilt to the design (2026-08-30): a translucent, blurred sheet at 80% with the Rates grid showing through, <code>APPEARANCE</code> and the <code>☾ DARK · ☀ LIGHT</code> pill on one row, tile-style skin cards with the design's 16-8-8 swatches and mono labels, a real 44×26 switch on the Ambient row, Replay Boot as a tracked mono outline.",
        "The app keeps four controls the design lacks — an <code>AUTO</code> mode cell, the Aurora / Rays picker, the Off / Calm / Freeze ladder and SIGN OUT — dressed in the same row idiom below the design's own rows. That is why the sheet stands taller than the design's ~55%: product surface, not drift.",
    ], None),
    ("credit/sell-side", "close", "Sell-side ticket", [
        "Stepper, SUBMIT BID, the <code>INCOMING RFQ</code> header with countdown and progress rail all land.",
        "Subtitle prints a raw <code>2,000,000</code> and no client where the design abbreviates <code>3.0M USD · ADAPTIVE ASSET MGMT</code>; the CTA is flat cyan vs the design's cyan→green gradient; the app adds a <code>PASS</code> link and omits the design's <code>YOUR QUOTES</code> heading beneath the card.",
    ], None),
    ("rates/grid", "close", "Spot tile grid", [
        "Filter chips, the 2-column tile grid, big-figure / pip typography, spread pill and bid / ask footer all match. Residuals round (2026-08-31, #630): the chip label was the app's last faux-bold — <code>fontWeight: 600</code> on the single-file mono face — and now takes the face's real 600 cut.",
        "Tile cards are a flatter, darker fill than the design's cyan-tinted glass; the app's fixture seeds nine pairs (the design shows eight). Cosmetic.",
    ], None),
    ("equities/trade", "close", "Trade view", [
        "Phase 2 (2026-08-29): the DEPTH ladder and the three mono headings are gone. The screen is now the design's stack — symbol chips, one instrument card (symbol with <code>name · exchange</code> inline, price + pct in the change colour, the candle chart inside the card over faint 32px rules), the ticket (<code>SELL</code> / <code>BUY</code> outlined toggles, boxed <code>MKT | LMT</code>, <code>100 · 500 · 1K · 5K</code> chips, a <code>LIMIT PX</code> stepper seeded from the last price, a full-width <code>BUY 500 AAPL · @ 191.90</code> CTA), and POSITIONS beneath in Phase 1's cards.",
        "The design's CTA is a vertical gradient of the side colour; the app's is flat. The fixture pins <code>BUY · LMT · 500</code>; production starts at qty 0 / MKT with no chip lit (a client-core default, left as is).",
    ], None),
    ("equities/blotter", "close", "Orders + positions blotters", [
        "Phase 1 (2026-08-29): the six-column table with the mid-word status wrap (<code>PARTIALL/YFILLED</code>) and the Orders/Positions toggle are gone. ORDERS and POSITIONS now stack on one scroll as the design's bordered card rows — symbol over a <code>BUY LMT</code> side+type sub-label, qty, price, a boxed status pill (filled → positive, open → amber, cancelled/rejected → negative); positions print signed qty, <code>@avg</code> and a compacted <code>+1.3K</code> P&L coloured by sign.",
        "The web-ported desk-P&L gauge and per-row sparklines were removed — the mobile design has neither. The fixture seeds five orders spanning every status to the design's three, so the app column runs longer.",
    ], None),
    ("blotter/seeded", "close", "FX blotter", [
        "Filter chips, fills summary (<code>6 FILLS · 3B/3S</code>), 4-column header, row anatomy and status pills match.",
        "The app prints a <em>date</em> under each pill (<code>2026-07-22</code>) where the design prints a <em>time</em> (<code>18:09:14</code>); the design's sample has 17 rows to the fixture's six.",
    ], None),
    ("rates/ticket", "close", "Spot trade ticket (bottom sheet)", [
        "New scenario (2026-08-30): the real <code>TradeTicketSheet</code> over the live Rates grid. Restyled to the design: 16px pair label, <code>SPOT · T+2 · hh:mm:ss</code>, the bordered NOTIONAL card with ± steppers beside the label, outlined size chips, a 999-radius spread pill.",
        "Three reduced-motion fixes fell out of making it capturable — the sheet presents without animation and with a static backdrop when shell motion is off. Residuals round (2026-08-31, #641): the SELL / BUY pads now wear the design's own recipe — border at 55% and fill at 12% of the side's accent, radius 13, SELL left- and BUY right-aligned with the label top-outward and the bottom-aligned price row 5px below; press glow in the side accent.",
    ], None),
    ("credit/new-rfq", "close", "New RFQ form", [
        "New scenario (2026-08-30), pre-filled through a new <code>initialSelection</code> seam. Restyled: mono-uppercase <code>BUY</code> / <code>SELL</code> tinted per side, chips on the chip token, the gradient <code>⟟ BROADCAST RFQ</code> with its glow, and the sans <code>New RFQ</code> heading the design never had removed.",
        "Footnote reads <code>120S WINDOW</code> from the domain's real RFQ expiry, not the prototype's <code>45S</code>. The credit fake carries two bonds where the design seeds six equities — data, not layout.",
    ], None),
    ("shell/dock-open", "close", "Radial dock, fanned open", [
        "New scenario (2026-08-30) through a <code>DockOpenContext</code> seam (null in production). Restyled: the design's overlay tint under the blur (measured to within a few rgb points of the shot), single-line satellite labels, <code>borderPrimary</code> rings with the glow halo on the active one.",
        "Residuals round (2026-08-31, #642): the dock measures from the TRUE bottom as the design does — FAB at 26pt, satellites at 78pt, no safe-area inset added (the design's <code>safeBot</code> band is the status strip's own inset padding) — and the FAB now paints beneath the open scrim, dimmed exactly as the reference shot shows. Thirteen goldens moved with it: nine module scenarios mount the chrome.",
    ], None),
]

BOOT = [
    ("boot/core", "Core sync — global mesh"), ("boot/laser", "Laser"), ("boot/docking", "Docking"),
    ("boot/hologram", "Hologram"), ("boot/geo", "Geo"), ("boot/layers", "Layers"),
    ("boot/jarvis", "Jarvis"), ("boot/topo", "Topo — volatility terrain"),
]
BOOT_NOTES = [
    "Scene compositions match one for one — the eight canvases are ports of the eight prototype scenes, and each pair shows the same geometry at a comparable instant.",
    "<strong>The boot chrome now matches (2026-08-30):</strong> the design's bottom block — Orbitron wordmark, one mono line <code>MOBILE OS // SEQ n/8 · SCENE NAME</code>, a 2px single-hue rail, a <code>▸ boot log</code> line — and <code>SKIP ▸</code> as the bordered mono pill pinned bottom-right. The <code>60%</code> readout and the two old subtitle lines are gone.",
    "The scene's top telemetry now carries a safe-area inset, so on the device it clears the dynamic island the prototype's bezel never drew.",
    "Each app frame is one pinned instant (<code>elapsedSec = 2.52</code>); the prototype shot is whichever instant the corpus captured. Timing differences are not drift.",
]

PROTO_ONLY = [
    # All three prototype-only surfaces gained app scenarios on 2026-08-30 — see their pairs above.
]
APP_ONLY = [
    ("boot/static", "Reduced-motion boot", "The boot sequence with the canvas gated off (power-saver Freeze / reduce motion): the hex emblem stands in for the scene under the same chrome — no prototype equivalent."),
    ("shell/chrome", "The HUD frame, empty body", "The isolated chrome witness: header, banner, status strip, collapsed dock. <code>SIM</code> badge by design (the harness is a static fake)."),
    ("shell/connection-banner", "Disconnected banner (classic / light)", "The one light-mode scenario, and the only one pinned DISCONNECTED — it exists for the Reconnect affordance. Residuals round (2026-08-31, #644): its <code>LIVE</code> badge is a weighted label on the classic skin, which used to fall back to the platform sans; <code>weightedFont</code>'s cut-less arm now keeps the platform mono, so classic's weighted and unweighted labels finally share a face."),
    ("shell/login", "Sign-in (restyled 2026-08-31, #646)", "The pre-session sibling of <code>lock/hold</code>, and a surface the design never drew. It wore the pre-redesign form until the residuals round — Title-case sans labels, an ad-hoc hex, a plain text button — and now takes the lock screen's design-derived idiom exactly: the hex emblem, the Orbitron wordmark over a tracked-mono line, bordered mono inputs with uppercase placeholders, <code>AUTHENTICATE ▸</code> as the boot chrome's bordered pill. New scenario, so it has no before-golden."),
]

CROSS = [
    ("Typography", "Fixed 2026-08-30: the three remaining face/case misses (Orbitron wordmark, the strip's MODULE value, the connection banner) — and a harness fix behind them: the visual host used to paint first-commit text before the bundled fonts loaded, so every earlier golden showed the system face where the device shows the bundled one. All goldens re-pinned."),
    ("Status strip clock", "Frozen at <code>09:47:03</code> in the app column (a harness pin); the prototype shows a live time. Not drift."),
    ("Status bar and dynamic island", "Real in the app column (pinned to 09:41, full bars, charged); absent in the prototype, whose bezel draws them outside the captured element. Not drift."),
]

VERDICT_LABEL = {"close": "Close", "moderate": "Moderate", "far": "Far from design"}

def pair_card(sid, verdict, title, notes, aside, ranked=None):
    a = thumb(APP / f"{sid}.png"); p = thumb(REF / f"{sid}.png"); b = before_figure(sid)
    rank = f'<span class="rank">{ranked:02d}</span>' if ranked else ""
    li = f'<ul class="notes">{"".join(f"<li>{n}</li>" for n in notes)}</ul>' if notes else ""
    extra = f'<p class="aside">{aside}</p>' if aside else ""
    return f'''<article class="card v-{verdict}" id="{sid.replace('/', '-')}">
  <header class="card-head">{rank}<div><h3><code>{sid}</code></h3><p class="sub">{title}</p></div><span class="chip">{VERDICT_LABEL[verdict]}</span></header>
  <div class="pair three">
    {b}
    <figure><img src="{a}" alt="{html.escape(sid)} — app" loading="lazy" width="{THUMB_W}"><figcaption>App · {COMMIT}</figcaption></figure>
    <figure><img src="{p}" alt="{html.escape(sid)} — prototype" loading="lazy" width="{THUMB_W}"><figcaption>Prototype · corpus</figcaption></figure>
  </div>
  {li}{extra}
</article>'''

def single_card(sid, title, note, which):
    src = thumb((REF if which == "Prototype" else APP) / f"{sid}.png")
    before = before_figure(sid) if which == "App" else ""
    cap = f"App · {COMMIT}" if which == "App" else which
    cols = "two" if before else "one"
    return f'''<article class="card single" id="{sid.replace('/', '-')}">
  <header class="card-head"><div><h3><code>{sid}</code></h3><p class="sub">{title}</p></div><span class="chip chip-dim">{which} only</span></header>
  <div class="pair {cols}">{before}<figure><img src="{src}" alt="{html.escape(sid)} — {which.lower()}" loading="lazy" width="{THUMB_W}"><figcaption>{cap}</figcaption></figure></div>
  <p class="notes-p">{note}</p>
</article>'''

tally = {"close": 0, "moderate": 0, "far": 0}
module_cards = []
for i, (sid, v, title, notes, aside) in enumerate(MODULES, 1):
    tally[v] += 1
    module_cards.append(pair_card(sid, v, title, notes, aside, ranked=i))
boot_cards = [pair_card(sid, "close", title, [], None) for sid, title in BOOT]
tally["close"] += len(BOOT)
proto_cards = [single_card(s, t, n, "Prototype") for s, t, n in PROTO_ONLY]
app_cards = [single_card(s, t, n, "App") for s, t, n in APP_ONLY]
cross_rows = "".join(f"<div class='xrow'><dt>{k}</dt><dd>{v}</dd></div>" for k, v in CROSS)
boot_notes = "".join(f"<li>{n}</li>" for n in BOOT_NOTES)

CSS = """
:root {
  --ground: #eef2f1; --surface: #ffffff; --raised: #f7faf9;
  --ink: #0e1513; --ink-dim: #576762; --ink-faint: #849690;
  --line: #d5dedb; --line-soft: #e6ecea;
  --accent: #00775a; --close: #1a7f5a; --moderate: #8a5d00; --far: #a8323e;
  --shot-bg: #0b0f0e;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #090d0c; --surface: #111817; --raised: #161f1d;
    --ink: #e4ede9; --ink-dim: #8ba099; --ink-faint: #5d706a;
    --line: #222d2a; --line-soft: #1a2321;
    --accent: #4fdcae; --close: #4fdcae; --moderate: #e2bd63; --far: #f07d8a;
    --shot-bg: #000000;
  }
}
:root[data-theme="dark"] {
  --ground: #090d0c; --surface: #111817; --raised: #161f1d;
  --ink: #e4ede9; --ink-dim: #8ba099; --ink-faint: #5d706a;
  --line: #222d2a; --line-soft: #1a2321;
  --accent: #4fdcae; --close: #4fdcae; --moderate: #e2bd63; --far: #f07d8a;
  --shot-bg: #000000;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 15px/1.55 "Avenir Next", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 56px 24px 80px; }
code, .mono, .chip, .rank, dd.num { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
code { font-size: 0.92em; }
.bench { border-bottom: 1px solid var(--line); padding-bottom: 32px; position: relative; }
.eyebrow { margin: 0 0 14px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 0 0 14px; font-size: clamp(28px, 4.2vw, 42px); line-height: 1.08; letter-spacing: -0.021em; font-weight: 600; text-wrap: balance; }
h2 { margin: 56px 0 6px; font-size: 22px; letter-spacing: -0.012em; font-weight: 600; }
h2 + p { margin: 0 0 8px; color: var(--ink-dim); max-width: 78ch; }
.lede { margin: 0; max-width: 70ch; color: var(--ink-dim); font-size: 16px; }
.lede code { color: var(--ink); }
.readout { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 20px; margin: 30px 0 0; padding: 0; }
.readout > div { border-left: 2px solid var(--accent); padding-left: 14px; }
.readout > div.c { border-color: var(--close); } .readout > div.m { border-color: var(--moderate); } .readout > div.f { border-color: var(--far); }
.readout dt { font-size: 11.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 6px; }
.readout dd { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.readout .of { font-size: 15px; color: var(--ink-dim); font-weight: 400; }
.toggle { position: absolute; top: 0; right: 0; background: var(--surface); color: var(--ink-dim); border: 1px solid var(--line); border-radius: 3px; padding: 6px 10px; font: 12px ui-monospace, Menlo, monospace; cursor: pointer; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(940px, 1fr)); gap: 20px; margin-top: 22px; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 3px; padding: 16px; display: flex; flex-direction: column; gap: 12px; border-top: 3px solid var(--line); }
.card.v-close { border-top-color: var(--close); } .card.v-moderate { border-top-color: var(--moderate); } .card.v-far { border-top-color: var(--far); }
.card-head { display: flex; align-items: flex-start; gap: 12px; }
.card-head > div { flex: 1; min-width: 0; }
.card-head h3 { margin: 0; font-size: 15px; font-weight: 600; }
.card-head h3 code { font-size: 14px; }
.sub { margin: 2px 0 0; color: var(--ink-dim); font-size: 13px; }
.rank { font-size: 12px; color: var(--ink-faint); padding-top: 2px; }
.chip { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 2px; border: 1px solid currentColor; white-space: nowrap; }
.v-close .chip { color: var(--close); } .v-moderate .chip { color: var(--moderate); } .v-far .chip { color: var(--far); }
.chip-dim { color: var(--ink-faint); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 640px; }
.pair.three { grid-template-columns: 1fr 1fr 1fr; max-width: 960px; }
.pair.two { grid-template-columns: 1fr 1fr; max-width: 640px; }
.pair.one { grid-template-columns: 1fr; justify-items: center; }
.absent { width: 100%; max-width: 300px; aspect-ratio: 1206 / 2622; border: 1px dashed var(--line); border-radius: 3px; background: var(--raised); color: var(--ink-faint); display: flex; align-items: center; justify-content: center; text-align: center; font: 12px ui-monospace, Menlo, monospace; padding: 12px; box-sizing: border-box; }
figure { margin: 0; display: flex; flex-direction: column; gap: 6px; align-items: center; }
figure img { width: 100%; max-width: 300px; height: auto; border-radius: 3px; background: var(--shot-bg); border: 1px solid var(--line-soft); display: block; }
figcaption { font: 11px ui-monospace, Menlo, monospace; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-faint); }
.notes { margin: 0; padding-left: 18px; color: var(--ink); font-size: 13.5px; }
.notes li { margin: 4px 0; } .notes li + li { border-top: 1px solid var(--line-soft); padding-top: 4px; }
.notes-p { margin: 0; font-size: 13.5px; }
.aside { margin: 0; font-size: 13px; color: var(--ink-dim); border-left: 2px solid var(--line); padding-left: 10px; }
.legend { display: flex; gap: 18px; flex-wrap: wrap; margin: 18px 0 0; font-size: 13px; color: var(--ink-dim); }
.legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.legend .lc::before { background: var(--close); } .legend .lm::before { background: var(--moderate); } .legend .lf::before { background: var(--far); }
.section-notes { margin: 8px 0 0; padding-left: 18px; max-width: 86ch; color: var(--ink); font-size: 14px; }
.section-notes li { margin: 6px 0; }
.xgrid { margin: 18px 0 0; display: grid; gap: 0; border: 1px solid var(--line); border-radius: 3px; background: var(--surface); }
.xrow { display: grid; grid-template-columns: 220px 1fr; gap: 16px; padding: 12px 16px; border-top: 1px solid var(--line-soft); font-size: 13.5px; }
.xrow:first-child { border-top: 0; }
.xrow dt { margin: 0; font-weight: 600; } .xrow dd { margin: 0; color: var(--ink); }
@media (max-width: 600px) { .xrow { grid-template-columns: 1fr; gap: 4px; } }
footer { margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--line); color: var(--ink-dim); font-size: 13.5px; max-width: 86ch; }
footer code { color: var(--ink); }
"""

JS = """
(function(){var r=document.documentElement,b=document.getElementById('theme');function cur(){return r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
function paint(){b.textContent=cur()==='dark'?'☀ light':'☾ dark';}
b.addEventListener('click',function(){r.setAttribute('data-theme',cur()==='dark'?'light':'dark');paint();});paint();})();
"""

n_pairs = len(MODULES) + len(BOOT)
page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>React Native vs the mobile-v1 prototype</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<header class="bench">
  <button id="theme" class="toggle" type="button" aria-label="Toggle theme">theme</button>
  <p class="eyebrow">Showcase · first built 2026-08-29 · refreshed 2026-08-31 · @rtc/client-react-native vs docs/design/mobile/v1</p>
  <h1>How far the React Native client sits from the mobile-v1 prototype, screen by screen</h1>
  <p class="lede">Three columns per surface. <strong>Before</strong> — the committed <code>simctl</code> golden at <code>{BEFORE_COMMIT}</code> (2026-08-29), the morning this page was first built and before the fidelity pass touched a single module. <strong>App</strong> — the golden at <code>{COMMIT}</code>, after the pass and its residuals round. <strong>Prototype</strong> — the frozen reference shot from the deviation corpus. All three are 1206×2622, the iPhone 17 logical viewport; the app frames are rendered in the real HUD chrome over a static fake ViewModel with motion frozen. The prototype cannot change, so a difference is never a failure — it is a measure of how far the app sat from the design, and how far it moved. Verdicts are an eyeball, not a pixel metric: a pixel diff between two different renderers of different sample data measures nothing.</p>
  <dl class="readout">
    <div><dt>Paired</dt><dd>{n_pairs}</dd></div>
    <div class="c"><dt>Close</dt><dd>{tally['close']}<span class="of"> / {n_pairs}</span></dd></div>
    <div class="m"><dt>Moderate</dt><dd>{tally['moderate']}</dd></div>
    <div class="f"><dt>Far</dt><dd>{tally['far']}</dd></div>
    <div><dt>Prototype only</dt><dd>{len(PROTO_ONLY)}</dd></div>
    <div><dt>App only</dt><dd>{len(APP_ONLY)}</dd></div>
  </dl>
  <p class="legend"><span class="lc">Close — the same screen; cosmetic or data-sample differences</span><span class="lm">Moderate — the same layout with named deviations to work</span><span class="lf">Far — a different design for the surface</span></p>
</header>

<h2>Module screens</h2>
<p>Every module surface the pass worked, in the order it took them (the rank is the original worst-first order, kept so the cards stay addressable). Each card names what moved and what still differs; deliberate additions are called out as such so they are not mistaken for drift.</p>
<div class="grid">{''.join(module_cards)}</div>

<h2>Cross-cutting</h2>
<p>Differences that appear in every framed pair rather than in one module — and two that look like drift but are not.</p>
<dl class="xgrid">{cross_rows}</dl>

<h2>Boot scenes</h2>
<p>All eight scene ports against their prototype originals — the real <code>BootSequence</code> in the app columns, pinned at 60% of the ramp; the Before column still shows the pre-pass chrome. The scenes are close; the chrome around them is the deviation, named once below because it is the same in every pair.</p>
<ul class="section-notes">{boot_notes}</ul>
<div class="grid">{''.join(boot_cards)}</div>

<h2>Prototype only</h2>
<p>Surfaces the design specifies and no app golden witnesses yet. Design reference, not drift.</p>
<div class="grid">{''.join(proto_cards)}</div>

<h2>App only</h2>
<p>Surfaces the app has that the design never drew. A corpus that only looked for missing app surfaces would never surface this direction.</p>
<div class="grid">{''.join(app_cards)}</div>

<footer>
  <p><strong>How this was made.</strong> A Claude Code session composed each app golden beside its prototype shot with ImageMagick, read every pair, and wrote the verdicts and notes by hand; the thumbnails here are 900px WebP (q85) reductions of the committed PNGs — full colour, so gradients stay smooth — inlined at 3× display density so the page is one file. It is a companion, not a source of truth: the generated pair table is <code>docs/design/mobile/v1/reference-shots/DRIFT.md</code> (<code>pnpm prototype-shots:drift</code>), the pending work is the "RN prototype-fidelity pass" entry in <code>docs/STATUS.md</code>, and the finding that the comparison had been measuring the harness rather than the app is <code>T48</code> in <code>docs/rn-open-items.md</code>. Regenerate with the committed builder (<code>python3 docs/showcase/tools/build_report.py &lt;repo&gt; &lt;commit&gt; &lt;before-goldens-dir&gt;</code>; the before-goldens dir is rebuilt with <code>git show 89c694adc:&lt;golden path&gt;</code> per file) against a newer golden set after each round lands; the Before column is fixed at <code>89c694adc</code> by construction. The verdicts are the part that has to be re-read, not re-run. Until 2026-08-31 the readout double-counted the eight boot scenes as Moderate after their cards had been re-verdicted Close — a hard-coded tally line, now derived from the cards.</p>
</footer>
</div>
<script>{JS}</script>
</body>
</html>
"""
OUT.write_text(page)
print(f"wrote {OUT} ({OUT.stat().st_size/1e6:.2f} MB), pairs={n_pairs}, tally={tally}")
