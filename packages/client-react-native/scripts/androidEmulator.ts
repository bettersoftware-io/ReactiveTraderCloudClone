/** The pure half of the Android scripts: reading what `adb` and `emulator`
 * print. Kept free of processes and the file system so it can be tested. */

/** Serials of running emulators in `adb devices` output — `emulator-5554` and
 * friends, in the `device` state. A device still `offline`, or a physical
 * phone, is not one: the script would otherwise skip starting an emulator and
 * then have nothing to install into. */
export function listRunningEmulators(adbDevicesOutput: string): string[] {
  return adbDevicesOutput
    .split("\n")
    .map((line) => {
      return line.trim().split(/\s+/);
    })
    .filter(([serial, state]) => {
      return serial?.startsWith("emulator-") === true && state === "device";
    })
    .map(([serial]) => {
      return serial ?? "";
    });
}

/** Virtual device names in `emulator -list-avds` output. The emulator mixes
 * log lines into that output (`INFO | …`); a name is a single bare token. */
export function listVirtualDevices(listAvdsOutput: string): string[] {
  return listAvdsOutput
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return /^[A-Za-z0-9._-]+$/.test(line);
    });
}

/** Which virtual device to start: the one asked for, or the first there is.
 * `null` when there is none to start, or the one asked for does not exist —
 * starting a different device from the one named would be a surprise. */
export function chooseVirtualDevice(
  available: readonly string[],
  preferred: string | undefined,
): string | null {
  if (preferred !== undefined && preferred !== "") {
    return available.includes(preferred) ? preferred : null;
  }

  return available[0] ?? null;
}

/** Whether the build of the app installed on a device is a debug build, read
 * from `adb shell dumpsys package <id>`: `true` for the dev build, `false` for
 * a release build such as the EAS preview APK, `null` when the app is not
 * installed. The two are signed with different keys under one application id,
 * so Android refuses to install either over the other. */
export function readInstalledBuildKind(
  dumpsysOutput: string,
): "debug" | "release" | null {
  const flags = /^\s*flags=\[([^\]]*)\]/m.exec(dumpsysOutput);

  if (flags === null) {
    return null;
  }

  return (flags[1] ?? "").split(/\s+/).includes("DEBUGGABLE")
    ? "debug"
    : "release";
}

/** The port to forward into the emulator when the app is pointed at a server
 * on this machine, or `null` when it is not. Inside the emulator `localhost`
 * is the emulator itself, so `ws://localhost:4000` reaches nothing until
 * `adb reverse` maps that port back to the Mac. */
export function readLocalServerPort(
  serverUrl: string | undefined,
): number | null {
  if (serverUrl === undefined || serverUrl === "") {
    return null;
  }

  let url: URL;

  try {
    url = new URL(serverUrl);
  } catch {
    return null;
  }

  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return null;
  }

  if (url.port !== "") {
    return Number(url.port);
  }

  return url.protocol === "wss:" || url.protocol === "https:" ? 443 : 80;
}
