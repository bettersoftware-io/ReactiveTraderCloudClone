/**
 * The pixel tier's OTHER settled-capture precondition: dockview's tab-strip
 * resize flash must be over before the shutter opens.
 *
 * WHAT THE TRANSIENT IS. Dockview wraps each group's tab strip in its own
 * `Scrollable`, which paints a 4 px scrollbar thumb
 * (`.dv-scrollable .dv-scrollbar-horizontal`, `rgba(255,255,255,0.25)`,
 * `border-radius: 2px`) whenever the strip is hovered, actually scrolling, OR
 * carrying `dv-scrollable-resizing`. That last class is the problem: dockview's
 * `Scrollable` adds it on EVERY ResizeObserver tick and clears it on a
 * `setTimeout(…, 500)` keyed to the last tick. So for half a second after the
 * dock lays out (mount, a StrictMode engine rebuild, a container resize) the
 * strip wears a scrollbar that no resting user ever sees — and whether a
 * screenshot contains it is decided by wall clock, not by the fixture.
 *
 * WHAT IT COST. `app/equities-instances-dockview` (the first scenario with
 * enough tabs to overflow a strip) shipped a golden set that was internally
 * INCONSISTENT: 3 of its 10 skins caught the flash and 7 did not, from one
 * generation run over one DOM. Solid then failed post-merge ~4 runs in 5 on
 * exactly the skin whose golden held the bar — 1766 px against a 100 px cap,
 * 17x over — because solid's capture usually lands AFTER the 500 ms window the
 * react golden was taken inside. Nothing about the product differed; only the
 * clock did. Same class of defect as the countdown bars in `holdMotion.ts` and
 * as #710 → #716: a golden that photographed a transient.
 *
 * WHY WAITING, NOT HIDING. The flash is real in-product behaviour after a panel
 * resize, so suppressing it with a repo-wide CSS override would be a UX
 * decision taken for a test's convenience. Waiting for it to clear needs no
 * product change and no wall-clock constant of our own: the ABSENCE of
 * `dv-scrollable-resizing` already means "≥ 500 ms since the last resize tick",
 * because dockview's own timer is what removes it. Hover and
 * `dv-scrollable-scrolling` are unreachable in a static capture, so the settled
 * state is the thumb at zero alpha in every skin.
 *
 * NOT VACUOUS — the distinction this predicate is built around. "No element
 * carries the resizing class" is true both when a dock has settled and when no
 * dock has mounted yet, and a wait that accepts the second reading photographs
 * an empty frame while congratulating itself. So the two cases are separated
 * STRUCTURALLY: the client's engine bridge renders the
 * `.dockview-theme-rtc` container before it mounts dockview into it, so a page
 * with that container but no `.dv-scrollable` inside it is NOT settled, it is
 * early, and the predicate keeps waiting. A page with no container at all is
 * the in-house engine, which has no dockview chrome to settle.
 *
 * MUST stay self-contained — Playwright serialises this function's source and
 * evaluates it in the browser (`page.waitForFunction`), so it cannot close over
 * anything at module scope. Same constraint, same reason, as
 * `settleAnimationsForCapture` in `holdMotion.ts` and `collectFreezeViolations`
 * in `freezeContract.ts`.
 */
export function dockTabStripsAreSettled(): boolean {
  // The container the client's DockviewLayoutEngine renders — present before
  // dockview itself mounts, which is what makes "early" distinguishable from
  // "settled" below.
  if (document.querySelectorAll(".dockview-theme-rtc").length === 0) {
    return true;
  }

  const strips = document.querySelectorAll(".dv-scrollable");

  // A mounted dock always has at least one tab strip, so none means dockview
  // has not laid out yet.
  if (strips.length === 0) {
    return false;
  }

  for (const strip of strips) {
    if (strip.classList.contains("dv-scrollable-resizing")) {
      return false;
    }
  }

  return true;
}
