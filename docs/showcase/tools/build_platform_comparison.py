#!/usr/bin/env python3
"""Build the RN iOS-vs-Android comparison as one self-contained HTML file.

Every RN visual scenario has a committed Maestro golden on each platform, taken
by the same flow from the same static scene. This page puts each pair side by
side. It reads the two golden trees and `scenarioIds.ts` directly, so it shows
exactly what is pinned and cannot list a scenario the harness does not have.

It is not a diff: the two devices differ in size, pixel density and system
chrome, so a pixel comparison between them would measure the devices.

    python3 docs/showcase/tools/build_platform_comparison.py <repo> <commit>

Re-run it after either golden set is re-pinned.
"""
import base64, datetime, html, re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(sys.argv[1])
COMMIT = sys.argv[2]
# The page states its own build date, so it cannot go on naming an old one.
TODAY = datetime.date.today().isoformat()
VISUAL = ROOT / "packages/client-react-native/tests/visual"
SETS = {
    "ios": VISUAL / "__screenshots__/ios-iphone17-26/maestro",
    "android": VISUAL / "__screenshots__/android-pixel10a-37/maestro",
}
OUT = ROOT / "docs/showcase/rn-ios-android-comparison.html"
THUMB_W = 210   # display width of one shot
ENC_W = 480     # encoded above display size, so a zoomed shot stays legible
WEBP_Q = "80"

# Reading order: the app's own, from launch to the modules.
GROUPS = [
    ("boot", "Boot", "The splash scenes, each frozen on one frame."),
    ("shell", "Shell", "Sign-in, the HUD chrome, the dock and the sheets over it."),
    ("lock", "Lock", "The hold-to-unlock ring."),
    ("rates", "Rates", "The spot tile grid and the trade ticket."),
    ("credit", "Credit", "RFQ tiles, a new RFQ and the sell-side ticket."),
    ("equities", "Equities", "Markets, the trade view and the orders blotter."),
    ("analytics", "Analytics", "P&L chart, pair P&L bars, net-exposure bubbles."),
    ("blotter", "Blotter", "Filter chips, the fills summary and six trade rows."),
]

DIFFERENCES = [
    ("System chrome",
     "iOS keeps its status bar, with the clock pinned to 09:41 by the simulator. On Android the top 142 rows are "
     "painted black in every golden, because that bar does not reproduce between boots, and the gesture pill sits "
     "at the bottom."),
    ("Room on screen",
     "The Pixel 10a is 411 × 923 dp; the iPhone 17 is 402 × 874 pt. The same layout therefore gets more room on "
     "Android: the ninth rates tile is whole there and cut by the status strip on iOS, and the analytics cards "
     "leave more empty space below them."),
    ("Native controls",
     "The sign-in screen's Simulator-mode switch is the platform's own: the green iOS switch on one side, the "
     "Material one on the other. It is the one control in these scenes the app does not draw itself."),
    ("Glyph icons",
     "Icons drawn as text glyphs (the theme toggle in the header, the module glyph in the dock) come out smaller "
     "on Android, where the fallback font that supplies them differs."),
    ("Boot scenes",
     "The splash scenes are drawn on a full-screen canvas, so their composition follows the screen's proportions: "
     "compare the panels in boot/layers and boot/laser."),
    ("Glow under cards",
     "Card shadows are drawn by each platform. The cyan glow under a card reads brighter and tighter on Android "
     "than on iOS."),
]


def scenario_ids() -> list[str]:
    source = (VISUAL / "scenarioIds.ts").read_text()
    return re.findall(r'^  "([a-z0-9-]+/[a-z0-9-]+)",$', source, flags=re.M)


def thumb(path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".webp") as tmp:
        subprocess.run(["magick", str(path), "-resize", f"{ENC_W}x", "-strip", "-quality", WEBP_Q, tmp.name], check=True)
        return "data:image/webp;base64," + base64.b64encode(Path(tmp.name).read_bytes()).decode()


def shot(sid: str, platform: str, label: str) -> str:
    alt = html.escape(f"{sid} on {label}")
    return (f'<figure><img src="{thumb(SETS[platform] / f"{sid}.png")}" alt="{alt}" loading="lazy" '
            f'width="{THUMB_W}"><figcaption>{label}</figcaption></figure>')


def pair(sid: str) -> str:
    return (f'<article class="pair" id="{sid.replace("/", "-")}"><code>{sid}</code>'
            f'<div class="shots">{shot(sid, "ios", "iOS")}{shot(sid, "android", "Android")}</div></article>')


def sheet(prefix: str, title: str, note: str, ids: list[str]) -> str:
    mine = [sid for sid in ids if sid.startswith(prefix + "/")]
    return f'''<section class="sheet" id="{prefix}">
  <header><h2>{html.escape(title)}</h2><code>{len(mine)} scenario{"" if len(mine) == 1 else "s"}</code></header>
  <p class="note">{html.escape(note)}</p>
  <div class="pairs">{"".join(pair(sid) for sid in mine)}</div>
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
code, figcaption, .eyebrow, dt { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.bench { border-bottom: 1px solid var(--line); padding-bottom: 28px; position: relative; }
.eyebrow { margin: 0 0 14px; padding-right: 84px; font-size: 11.5px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--accent); }
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
dl { margin: 14px 0 0; display: grid; grid-template-columns: minmax(0, 11rem) minmax(0, 1fr); gap: 10px 20px; max-width: 96ch; }
dt { font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); padding-top: 3px; }
dd { margin: 0; color: var(--ink-dim); }
.pairs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 22px 18px; }
.pair > code { display: block; margin-bottom: 8px; font-size: 12px; color: var(--ink-dim); }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
figure { margin: 0; min-width: 0; }
figure img { display: block; width: 100%; height: auto; border-radius: 12px; background: var(--shot-bg); border: 1px solid var(--line); }
figcaption { margin-top: 6px; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); text-align: center; }
.foot { margin-top: 48px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--ink-dim); font-size: 13.5px; max-width: 86ch; }
@media (max-width: 560px) { dl { grid-template-columns: minmax(0, 1fr); gap: 2px 0; } dd { margin-bottom: 10px; } }
"""

ids = scenario_ids()
grouped = [sid for prefix, _, _ in GROUPS for sid in ids if sid.startswith(prefix + "/")]
if sorted(grouped) != sorted(ids):
    sys.exit(f"scenario ids outside every group: {sorted(set(ids) - set(grouped))}")

sheets = "\n".join(sheet(prefix, title, note, ids) for prefix, title, note in GROUPS)
links = '<a href="#differences">What differs</a>' + "".join(
    f'<a href="#{prefix}">{html.escape(title)}</a>' for prefix, title, _ in GROUPS)
differences = "".join(f"<dt>{html.escape(name)}</dt><dd>{html.escape(text)}</dd>" for name, text in DIFFERENCES)

OUT.write_text(f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>React Native — iOS beside Android</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<header class="bench">
  <button class="toggle" id="toggle" type="button">Theme</button>
  <p class="eyebrow">Showcase · built {TODAY} · @rtc/client-react-native</p>
  <h1>One React Native client, on iOS and on Android</h1>
  <p class="lede">All {len(ids)} visual scenarios, each as its committed golden on both platforms: an iPhone 17 simulator (iOS 26.5) on the left, a Pixel 10a emulator (Android API 37) on the right. One codebase, one set of Maestro flows, one static scene per scenario. The pairs are for looking at, not for diffing: the two devices differ in size, density and system chrome, so a pixel comparison between them would measure the devices.</p>
  <nav>{links}</nav>
</header>
<section class="sheet" id="differences">
  <header><h2>What differs</h2><code>read by eye from these pairs</code></header>
  <p class="note">The layout, type, colours and data are the same on both. These are the places where the platform shows through.</p>
  <dl>{differences}</dl>
</section>
{sheets}
<p class="foot"><strong>How this was made.</strong> Both columns are the goldens the Maestro visual tier asserts against, read from <code>tests/visual/__screenshots__/ios-iphone17-26/maestro</code> and <code>…/android-pixel10a-37/maestro</code> at <code>{COMMIT}</code>, reduced to {ENC_W}px WebP (q{WEBP_Q}) and inlined so the page is one file. The scenario list is read from <code>tests/visual/scenarioIds.ts</code>. Each scenario pins one skin and mode, the same on both platforms. Regenerate with <code>docs/showcase/tools/build_platform_comparison.py</code> after either set is re-pinned. Authoritative notes: <code>packages/client-react-native/tests/visual/BAKEOFF.md</code>, "The Android leg".</p>
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
print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB), pairs={len(ids)}")
