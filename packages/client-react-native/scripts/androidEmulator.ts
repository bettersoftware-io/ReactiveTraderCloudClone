/** The pure half of `runAndroidBuild.ts`: reading what `adb` and `emulator`
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
