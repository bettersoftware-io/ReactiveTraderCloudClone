import { execFile } from "node:child_process";
import { pid } from "node:process";
import { promisify } from "node:util";

import { describeDeviceInUse, findRunnersOnDevice } from "./deviceInUse.ts";
import type { Platform } from "./platform.ts";

const exec = promisify(execFile);

/**
 * Throws when another visual run is already driving `deviceId`. Called before
 * a runner changes anything on the device, so a refused run leaves the other
 * one untouched.
 *
 * A `ps` that cannot be read is not a refusal: not knowing is not a finding,
 * and the run goes ahead as it did before this check existed.
 */
export async function refuseDeviceInUse(
  deviceId: string,
  platform: Platform,
): Promise<void> {
  let processList: string;

  try {
    ({ stdout: processList } = await exec("ps", ["-Ao", "pid=,command="], {
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch {
    return;
  }

  const runners = findRunnersOnDevice(processList, {
    deviceId,
    platform,
    ownPid: pid,
  });

  if (runners.length > 0) {
    throw new Error(describeDeviceInUse(deviceId, runners));
  }
}
