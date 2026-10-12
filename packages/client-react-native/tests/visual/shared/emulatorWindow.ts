/**
 * Whether the Android emulator on this machine was started with a window.
 *
 * It matters on macOS, and it is easy to miss. A windowed emulator is a GUI
 * app, so once its window is covered App Nap moves it to the throttled
 * background class: the process drops to priority 4 and the guest runs 6–8
 * times slower (measured 2026-10-06 — a flow went from 8 s to 50 s, runs from
 * 4 minutes to over 20). Launches then time out, Android reports the app as
 * not responding, and a shot can land on a frame that is still settling. None
 * of it names its cause: the host looks busy, not throttled. `emulator
 * -no-window` runs a plain process that App Nap never touches, and renders the
 * same pixels.
 */

/** The names the emulator's process has: `…-headless` when started with
 * `-no-window`. */
const EMULATOR_PROCESS = /(?:^|\/)qemu-system-[\w-]+$/;

/** True when `ps -Ao comm` output lists an emulator that has a window. */
export function hasWindowedEmulator(processNames: string): boolean {
  return processNames.split("\n").some((line) => {
    const name = line.trim();

    return EMULATOR_PROCESS.test(name) && !name.endsWith("-headless");
  });
}

export const WINDOWED_EMULATOR_WARNING: string =
  "warning: the Android emulator has a window. On macOS it is throttled once " +
  "that window is covered (6-8x slower), which shows up as launch timeouts " +
  "and unsettled frames. Start it with `emulator -avd <name> -no-snapshot " +
  "-no-window`.";
