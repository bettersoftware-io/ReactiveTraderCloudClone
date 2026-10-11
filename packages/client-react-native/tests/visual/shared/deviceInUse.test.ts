import { expect, test } from "vitest";

import { describeDeviceInUse, findRunnersOnDevice } from "./deviceInUse";

test("a free device has no other runner", () => {
  const processes = createProcessList([100, "/sbin/launchd"]);

  expect(
    findRunnersOnDevice(processes, {
      deviceId: SIMULATOR,
      platform: "ios",
      ownPid: 500,
    }),
  ).toStrictEqual([]);
});

test("Maestro on the same device is reported", () => {
  const processes = createProcessList([
    300,
    `java -classpath x maestro.cli.AppKt --udid ${SIMULATOR} test flows`,
  ]);

  const runners = findRunnersOnDevice(processes, {
    deviceId: SIMULATOR,
    platform: "ios",
    ownPid: 500,
  });

  expect(runners).toHaveLength(1);
  expect(runners[0]).toContain("pid 300");
  expect(runners[0]).toContain("maestro.cli.AppKt");
});

// The simulator and the emulator are separate devices: one session on each is
// how a run on both platforms is done at all.
test("Maestro on the other device is not", () => {
  const processes = createProcessList([
    300,
    `java -classpath x maestro.cli.AppKt --udid ${EMULATOR} test flows`,
  ]);

  expect(
    findRunnersOnDevice(processes, {
      deviceId: SIMULATOR,
      platform: "ios",
      ownPid: 500,
    }),
  ).toStrictEqual([]);
});

test("the simctl tier counts as a run on the simulator", () => {
  const processes = createProcessList([
    300,
    "node tests/visual/simctl/run.ts blotter/seeded",
  ]);

  expect(
    findRunnersOnDevice(processes, {
      deviceId: SIMULATOR,
      platform: "ios",
      ownPid: 500,
    }),
  ).toHaveLength(1);
});

test("the simctl tier is no obstacle to a run on the emulator", () => {
  const processes = createProcessList([
    300,
    "node tests/visual/simctl/run.ts blotter/seeded",
  ]);

  expect(
    findRunnersOnDevice(processes, {
      deviceId: EMULATOR,
      platform: "android",
      ownPid: 500,
    }),
  ).toStrictEqual([]);
});

// Started through pnpm, the runner sits under a shell whose command line
// carries the same script path. Reporting either would refuse every run.
test("this runner and the shell that started it are not reported", () => {
  const processes = createProcessList(
    [400, "pnpm --filter @rtc/client-react-native test:rn:visual:simctl"],
    [450, "sh -c node tests/visual/simctl/run.ts"],
    [500, "node tests/visual/simctl/run.ts"],
  );

  expect(
    findRunnersOnDevice(processes, {
      deviceId: SIMULATOR,
      platform: "ios",
      ownPid: 500,
    }),
  ).toStrictEqual([]);
});

test("a second runner beside this one is still reported", () => {
  const processes = createProcessList(
    [450, "sh -c node tests/visual/simctl/run.ts"],
    [500, "node tests/visual/simctl/run.ts"],
    [700, "node tests/visual/simctl/run.ts shell/login"],
  );

  const runners = findRunnersOnDevice(processes, {
    deviceId: SIMULATOR,
    platform: "ios",
    ownPid: 500,
  });

  expect(runners).toHaveLength(1);
  expect(runners[0]).toContain("pid 700");
});

// The text of the script's path is not the script running: a shell that is
// about to start it, or a search for it, has the same words on its line.
test("a command that only mentions a runner is not one", () => {
  const processes = createProcessList(
    [300, "/bin/zsh -c cd pkg && node tests/visual/simctl/run.ts"],
    [301, "grep -r tests/visual/simctl/run.ts ."],
    [302, `/bin/zsh -c echo maestro.cli.AppKt --udid ${SIMULATOR}`],
  );

  expect(
    findRunnersOnDevice(processes, {
      deviceId: SIMULATOR,
      platform: "ios",
      ownPid: 500,
    }),
  ).toStrictEqual([]);
});

test("node and java are recognised by name, whatever their path", () => {
  const processes = createProcessList(
    [300, "/opt/homebrew/bin/node --flag tests/visual/simctl/run.ts"],
    [
      301,
      `/opt/jdk/bin/java -classpath x maestro.cli.AppKt --udid ${SIMULATOR} test`,
    ],
  );

  expect(
    findRunnersOnDevice(processes, {
      deviceId: SIMULATOR,
      platform: "ios",
      ownPid: 500,
    }),
  ).toHaveLength(2);
});

// A device id inside a longer word is another device.
test("a device id is matched as a whole argument", () => {
  const processes = createProcessList([
    300,
    "java maestro.cli.AppKt --udid emulator-55540 test flows",
  ]);

  expect(
    findRunnersOnDevice(processes, {
      deviceId: EMULATOR,
      platform: "android",
      ownPid: 500,
    }),
  ).toStrictEqual([]);
});

test("the refusal names the device and each run on it", () => {
  const message = describeDeviceInUse(EMULATOR, [
    "pid 300: java maestro.cli.AppKt",
  ]);

  expect(message).toContain(EMULATOR);
  expect(message).toContain("pid 300: java maestro.cli.AppKt");
});

type ProcessTuple = readonly [pid: number, command: string];

/** `ps -Ao pid=,command=` output, right-aligned as `ps` prints it. */
function createProcessList(...rows: ProcessTuple[]): string {
  return rows
    .map(([pid, command]) => {
      return `${String(pid).padStart(5)} ${command}`;
    })
    .join("\n");
}

const SIMULATOR = "D9160A63-FB61-46FC-8693-666F3AC11BAB";

const EMULATOR = "emulator-5554";
