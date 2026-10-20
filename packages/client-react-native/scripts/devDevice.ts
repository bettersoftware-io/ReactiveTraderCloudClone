/** Which device a `dev:*` run builds for — the pure half, kept free of
 * processes and the file system so it can be tested. By default the device the
 * visual goldens are shot on (`tests/visual/shared/devicePin.ts`), so the dev
 * client a developer installs is also the one the visual runners need;
 * `--device` chooses any other. */

/** Whether the arguments for `expo run:ios` already name a device (`--device
 * X`, `--device=X`, `-d X`, or a bare `--device`, which makes Expo ask). */
export function hasDeviceArgument(args: readonly string[]): boolean {
  return args.some((arg) => {
    return arg === "--device" || arg === "-d" || arg.startsWith("--device=");
  });
}

/** Splits `--device <name>` (or `--device=<name>`) off the arguments. `device`
 * is `undefined` when none is given. */
export function takeDeviceArgument(args: readonly string[]): DeviceArgument {
  const rest: string[] = [];
  let device: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";

    if (arg === "--device" || arg === "-d") {
      device = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--device=")) {
      device = arg.slice("--device=".length);
    } else {
      rest.push(arg);
    }
  }

  return { device, rest };
}

/**
 * The emulator a `dev:android` run uses: the AVD asked for, else the pinned
 * one, else one already running, else the first that exists. `serial` is the
 * running emulator's, or `null` when the AVD must be started. `null` overall
 * when the AVD asked for does not exist, or none exists at all.
 */
export function chooseDevEmulator(
  options: DevEmulatorOptions,
): DevEmulator | null {
  const { requested, pinned, running, available } = options;
  const avd = requested ?? pinned ?? running[0]?.avd ?? available[0] ?? null;

  if (avd === null || !available.includes(avd)) {
    return null;
  }

  const serial =
    running.find((emulator) => {
      return emulator.avd === avd;
    })?.serial ?? null;

  return { avd, serial };
}

export interface DeviceArgument {
  readonly device: string | undefined;
  readonly rest: string[];
}

export interface RunningEmulator {
  readonly serial: string;
  readonly avd: string;
}

export interface DevEmulatorOptions {
  /** `--device` or `RTC_ANDROID_AVD`. */
  readonly requested: string | undefined;
  /** The AVD matching the visual goldens' pin, `null` when none does. */
  readonly pinned: string | null;
  readonly running: readonly RunningEmulator[];
  /** Every AVD on this machine (`emulator -list-avds`). */
  readonly available: readonly string[];
}

export interface DevEmulator {
  readonly avd: string;
  readonly serial: string | null;
}
