/**
 * The pixel tier's motion-settling pass: what the goldens are a photograph OF.
 *
 * WHY THIS REPLACES `animations: "disabled"`. Playwright's option settles every
 * animation for us, and for entrances, flashes and fades its rule is exactly
 * right — jump to the end state. But it has ONE rule for finite animations
 * (`finish()`), and this app has a family where the end state is the wrong
 * picture: a progress bar drawn as a SINGLE mount-time keyframe over the whole
 * window, fast-forwarded to "now" by a NEGATIVE `animation-delay` (P1 in
 * `docs/performance.md`; the FX tile's `rfqDrain` and credit's `barDrain`).
 * There, the animation's time 0 IS the state the fixture describes and its end
 * is an EMPTY bar — so every countdown golden ever committed showed a drained
 * bar for a fixture that says "7000 ms of 10 000 remaining". Worse, the
 * fast-forward is a seek race against a compositor-owned animation: when the
 * seek missed, the stability loop accepted the visually-static RUNNING bar and
 * captured it full, which is one red cell per post-merge run.
 *
 * So the specs capture with `animations: "allow"` and call this first. It
 * mirrors Playwright's pass (playwright-core's `disableAnimations` block —
 * skip effect-less and `playbackRate === 0` animations, `cancel()` the
 * infinite ones so the element shows its base style, `finish()` everything
 * else, transitions included) and diverges on exactly one class: an effect
 * whose target is marked `data-motion="fast-forwarded"` is PAUSED at
 * `currentTime = 0`. With delay −d over duration D that is progress d/D — the
 * mount frame, i.e. `scaleX = remaining / total`. Every other golden stays
 * byte-identical to the `animations: "disabled"` era, which is the property
 * §5a of the change verified before any golden was regenerated.
 *
 * THE STANDING LISTENERS ARE NOT OPTIONAL — they are half of what Playwright's
 * option does, and the half that is easy to miss. `toHaveScreenshot` retries
 * until two consecutive captures agree, and Playwright keeps re-settling on
 * `animationstart`/`transitionrun` for the whole of that window, so a keyframe
 * that begins on a later mount or a transition kicked off by a style change is
 * settled before it can reach film. A one-shot sweep at readiness left those
 * running: measured here, 27 goldens outside the countdown family went red
 * with pixel counts that CLIMBED across retries (jarvis/overlay-chat
 * 918 → 3208 → 7362) and a failing set that moved between runs. Subscribing
 * the same two events made the same tier green.
 *
 * MUST stay self-contained — Playwright serialises this function's source and
 * evaluates it in the browser, so it cannot close over anything at module
 * scope (no imports, no outer consts). The nested declaration below is for
 * that reason, not by accident. Same constraint, same reason, as
 * `collectFreezeViolations` in `freezeContract.ts`.
 */
export function settleAnimationsForCapture(): void {
  function settleEveryAnimation(): void {
    for (const animation of document.getAnimations()) {
      const effect = animation.effect;

      // Playwright skips both of these, so we do too: an effect-less animation
      // paints nothing, and a zero playback rate is already held still.
      if (effect === null || animation.playbackRate === 0) {
        continue;
      }

      // Infinite (`iterations: Infinity` ⇒ non-finite `endTime`) has no end to
      // finish to. Cancelling drops the element to its base style —
      // Playwright's rule, and the state those goldens already hold. A
      // cancelled animation leaves `getAnimations()`, so a later re-settle
      // does not see it again.
      if (!Number.isFinite(effect.getComputedTiming().endTime)) {
        animation.cancel();
        continue;
      }

      const target = effect instanceof KeyframeEffect ? effect.target : null;

      // Idempotent, which matters because the listeners below re-run this:
      // pausing an already-paused animation and re-seeking it to 0 is a no-op,
      // as is finishing an already-finished one.
      if (target?.getAttribute("data-motion") === "fast-forwarded") {
        animation.pause();
        animation.currentTime = 0;
        continue;
      }

      animation.finish();
    }
  }

  settleEveryAnimation();
  // Left subscribed on purpose — the page is discarded after the capture, so
  // there is nothing to clean up, and the capture window is exactly what these
  // need to cover. Playwright removes its own copies only because it hands the
  // page back to the test afterwards.
  document.addEventListener("animationstart", settleEveryAnimation);
  document.addEventListener("transitionrun", settleEveryAnimation);
}
