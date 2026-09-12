/** The one rejection the kernel treats as normal: a loop ended because its
 * signal aborted. `spawn` swallows it; anything else is a real error. It
 * lives in its own file because `rtc/class-filename-match` requires a class
 * to name its file. */
export class AbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}
