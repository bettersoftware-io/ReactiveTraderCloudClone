import type { Platform } from "./platform.ts";

/**
 * Who else is driving a device a visual run is about to use.
 *
 * Two runners on one device do not fail cleanly. Each cold-starts the app for
 * every scenario, so each kills the other's: flows report "app crashed or
 * stopped", waits time out on the home screen, and a shot that does get taken
 * can show the OTHER run's scenario — which then reads as a pixel failure of
 * up to 25% (measured 2026-10-06, two sessions on one simulator). Nothing in
 * either run's output names the other.
 */

/** A row of `ps -Ao pid=,command=`. */
interface ProcessRow {
  readonly pid: number;
  readonly command: string;
}

interface DeviceUse {
  /** The simulator UDID or Android serial this run will drive. */
  readonly deviceId: string;
  readonly platform: Platform;
  /** This runner's own pid, which is never reported. */
  readonly ownPid: number;
}

/** Maestro on a device: its CLI names the device it drives. */
const MAESTRO_CLI = "maestro.cli.AppKt";

/** The simctl tier. It has no Android side, so it is always the simulator. */
const SIMCTL_RUNNER = "tests/visual/simctl/run.ts";

/**
 * The processes already driving `deviceId`, as `pid <n>: <command>` lines.
 * Empty when the device is free.
 */
export function findRunnersOnDevice(
  processList: string,
  { deviceId, platform, ownPid }: DeviceUse,
): string[] {
  return parseProcessList(processList)
    .filter((row) => {
      return (
        row.pid !== ownPid && drivesDevice(row.command, deviceId, platform)
      );
    })
    .map((row) => {
      return `pid ${row.pid}: ${row.command.slice(0, COMMAND_PREVIEW)}`;
    });
}

/** The error a runner throws when {@link findRunnersOnDevice} finds any. */
export function describeDeviceInUse(
  deviceId: string,
  runners: readonly string[],
): string {
  return (
    `${deviceId} is already being driven by another visual run:\n` +
    runners
      .map((runner) => {
        return `  ${runner}`;
      })
      .join("\n") +
    "\nTwo runs on one device kill each other's app and shoot each other's " +
    "screens. Wait for that run to finish, or use the other device."
  );
}

/**
 * Whether `command` IS a run on the device, judged by its program and its
 * arguments. A command line that merely contains the script's path does not
 * count: a shell running `… && node tests/visual/simctl/run.ts`, or a `grep`
 * for it, carries the same text (the first version of this check refused a
 * run on account of the shell that had started it).
 */
function drivesDevice(
  command: string,
  deviceId: string,
  platform: Platform,
): boolean {
  const [program = "", ...args] = command.trim().split(/\s+/);
  const name = program.slice(program.lastIndexOf("/") + 1);

  if (name === "java" && args.includes(MAESTRO_CLI)) {
    return args.includes(deviceId);
  }

  return (
    platform === "ios" &&
    name === "node" &&
    args.some((arg) => {
      return arg.endsWith(SIMCTL_RUNNER);
    })
  );
}

function parseProcessList(processList: string): ProcessRow[] {
  const rows: ProcessRow[] = [];

  for (const line of processList.split("\n")) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);

    if (match !== null) {
      rows.push({ pid: Number(match[1]), command: match[2] ?? "" });
    }
  }

  return rows;
}

/** Enough of a command line to recognise it; a Maestro one runs to kilobytes. */
const COMMAND_PREVIEW = 160;
