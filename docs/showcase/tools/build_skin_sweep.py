#!/usr/bin/env python3
"""Build the RN 12-skin sweep as one self-contained HTML file.

Every RN visual scenario pins ONE skin×mode, so the committed goldens cover two
of the twelve cells. This page is the other ten: a set of scenarios re-shot in
all 6 skins × dark/light with the harness's `--skin` flag, and laid out as one
contact sheet per screen.

    # 1. capture (simulator + Metro up, see packages/client-react-native/tests/visual/README.md)
    for skin in classic holo holo3d terminal terminal3d neon; do for mode in dark light; do
      tsx tests/visual/simctl/run.ts --scratch=<dir> --skin=$skin:$mode <scenario ids>
    done; done
    # 2. build
    python3 docs/showcase/tools/build_skin_sweep.py <repo> <commit> <dir>
"""
import base64, datetime, html, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(sys.argv[1])
COMMIT = sys.argv[2]
SHOTS = Path(sys.argv[3])
# The page states its own capture date, so it cannot go on naming an old one.
TODAY = datetime.date.today().isoformat()
OUT = ROOT / "docs/showcase/rn-skin-sweep.html"
THUMB_W = 190   # display width
ENC_W = 570     # encoded at 3x, so a zoomed shot stays legible
WEBP_Q = "80"

SKINS = ["classic", "holo", "holo3d", "terminal", "terminal3d", "neon"]
MODES = ["dark", "light"]
SCREENS = [
    ("rates/grid", "Rates", "The spot tile grid: filter chips, tiles, big-figure pips, spread pills."),
    ("rates/ticket", "Rates · trade ticket", "The bottom sheet over the grid: notional card, size chips, SELL / BUY pads."),
    ("credit/rfq-tiles", "Credit · RFQ tiles", "One live RFQ with its best quote and one accepted."),
    ("equities/trade", "Equities · trade", "Symbol chips, the instrument card with its candle chart, the order ticket."),
    ("analytics/dashboard", "Analytics", "P&L chart, pair P&L bars, net-exposure bubbles."),
    ("blotter/seeded", "Blotter", "Filter chips, the fills summary and six trade rows."),
    ("shell/login", "Sign-in", "The pre-session screen, outside the HUD chrome."),
]

def thumb(path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".webp") as tmp:
        subprocess.run(["magick", str(path), "-resize", f"{ENC_W}x", "-strip", "-quality", WEBP_Q, tmp.name], check=True)
        return "data:image/webp;base64," + base64.b64encode(Path(tmp.name).read_bytes()).decode()

def shot(sid: str, skin: str, mode: str) -> str:
    src = SHOTS / f"{sid.replace('/', '_')}@{skin}-{mode}.png"
    alt = html.escape(f"{sid} — {skin} {mode}")
    return f'<figure><img src="{thumb(src)}" alt="{alt}" loading="lazy" width="{THUMB_W}"><figcaption>{skin}</figcaption></figure>'

def sheet(sid: str, title: str, note: str) -> str:
    rows = "".join(
        f'<div class="row"><span class="mode">{mode}</span><div class="strip">{"".join(shot(sid, k, mode) for k in SKINS)}</div></div>'
        for mode in MODES
    )
    return f'''<section class="sheet" id="{sid.replace('/', '-')}">
  <header><h2>{html.escape(title)}</h2><code>{sid}</code></header>
  <p class="note">{html.escape(note)}</p>
  {rows}
</section>'''

CSS = """
:root {
  --ground: #eef2f1; --surface: #ffffff; --ink: #0e1513; --ink-dim: #576762; --ink-faint: #849690;
  --line: #d5dedb; --accent: #00775a; --shot-bg: #0b0f0e;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #090d0c; --surface: #111817; --ink: #e4ede9; --ink-dim: #8ba099; --ink-faint: #5d706a;
    --line: #222d2a; --accent: #4fdcae; --shot-bg: #000000;
  }
}
:root[data-theme="dark"] {
  --ground: #090d0c; --surface: #111817; --ink: #e4ede9; --ink-dim: #8ba099; --ink-faint: #5d706a;
  --line: #222d2a; --accent: #4fdcae; --shot-bg: #000000;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 15px/1.55 "Avenir Next", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1320px; margin: 0 auto; padding: 56px 16px 80px; }
code, .mono, .mode, figcaption, .eyebrow { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.bench { border-bottom: 1px solid var(--line); padding-bottom: 28px; position: relative; }
.eyebrow { margin: 0 0 14px; font-size: 11.5px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 0 0 14px; font-size: clamp(28px, 4.2vw, 42px); line-height: 1.08; letter-spacing: -0.021em; font-weight: 600; text-wrap: balance; max-width: 22ch; }
.lede { margin: 0; max-width: 72ch; color: var(--ink-dim); font-size: 16px; }
.lede code, .foot code { color: var(--ink); font-size: 0.92em; }
.toggle { position: absolute; top: 0; right: 0; font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-dim); cursor: pointer; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
nav a { font-size: 12.5px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); text-decoration: none; }
nav a:hover { border-color: var(--accent); color: var(--accent); }
.sheet { margin-top: 44px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px 20px 22px; }
.sheet header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
h2 { margin: 0; font-size: 20px; letter-spacing: -0.012em; font-weight: 600; }
.sheet header code { font-size: 12px; color: var(--ink-faint); }
.note { margin: 4px 0 14px; color: var(--ink-dim); max-width: 78ch; }
.row { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: center; margin-top: 12px; }
.mode { writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint); }
.strip { display: grid; grid-template-columns: repeat(6, minmax(150px, 1fr)); gap: 10px; overflow-x: auto; padding-bottom: 4px; }
figure { margin: 0; min-width: 0; }
figure img { display: block; width: 100%; height: auto; border-radius: 14px; background: var(--shot-bg); border: 1px solid var(--line); }
figcaption { margin-top: 6px; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-dim); text-align: center; }
.foot { margin-top: 48px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--ink-dim); font-size: 13.5px; max-width: 86ch; }
"""

sheets = "\n".join(sheet(*s) for s in SCREENS)
links = "".join(f'<a href="#{sid.replace("/", "-")}">{html.escape(title)}</a>' for sid, title, _ in SCREENS)
count = len(SCREENS) * len(SKINS) * len(MODES)

OUT.write_text(f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>React Native — twelve skins</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<header class="bench">
  <button class="toggle" id="toggle" type="button">Theme</button>
  <p class="eyebrow">Showcase · captured {TODAY} · @rtc/client-react-native</p>
  <h1>The React Native client in all twelve skins</h1>
  <p class="lede">Six skins, each in dark and light, across {len(SCREENS)} screens — {count} device captures. The committed goldens pin one skin×mode per scenario and so cover two of these twelve cells; this page is the look at the other ten that Phase 7's sign-off asked for. The skins were signed off on 2026-10-04 against the first capture of this page; it has been re-shot since, as the app changed. Each row reads <code>classic · holo · holo3d · terminal · terminal3d · neon</code>.</p>
  <nav>{links}</nav>
</header>
{sheets}
<p class="foot"><strong>How this was made.</strong> The same static, frozen scenarios the goldens use, re-shot on an iPhone 17 simulator (iOS 26.5) with <code>tests/visual/simctl/run.ts --scratch --skin=&lt;skin&gt;:&lt;mode&gt;</code> at <code>{COMMIT}</code>, then reduced to {ENC_W}px WebP (q{WEBP_Q}) and inlined so the page is one file. Nothing here is pinned or diffed: these captures are for a person to look at, and the runner refuses <code>--skin</code> without <code>--scratch</code>. Regenerate with <code>docs/showcase/tools/build_skin_sweep.py</code> (its docstring has both steps). Authoritative notes: Phase 7 in <code>docs/rn-open-items.md</code> §6 and the sweep section of <code>packages/client-react-native/tests/visual/README.md</code>.</p>
</div>
<script>
(function () {{
  var root = document.documentElement;
  document.getElementById("toggle").addEventListener("click", function () {{
    var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
  }});
}})();
</script>
</body>
</html>
''')
print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB), captures={count}")
