import { beforeEach, expect, jest, test } from "@jest/globals";
import { Gyroscope } from "expo-sensors";

import { useGyroDriftPage } from "#tests/pages/UseGyroDriftPage";

const mockedAddListener = jest.mocked(Gyroscope.addListener);
const mockedIsAvailableAsync = jest.mocked(Gyroscope.isAvailableAsync);

beforeEach(() => {
  jest.clearAllMocks();
  mockedIsAvailableAsync.mockResolvedValue(false);
});

test("does not subscribe while disabled", async () => {
  const page = useGyroDriftPage();
  await page.mount(false);

  expect(mockedIsAvailableAsync).not.toHaveBeenCalled();
  expect(mockedAddListener).not.toHaveBeenCalled();
});

test("subscribes once enabled and the gyroscope is available", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);

  const page = useGyroDriftPage();
  await page.mount(true);

  await page.waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });
});

test("removes the listener on unmount", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);
  const remove = jest.fn();
  mockedAddListener.mockReturnValue({
    remove,
  } as ReturnType<typeof Gyroscope.addListener>);

  const page = useGyroDriftPage();
  await page.mount(true);
  await page.waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });

  await page.unmount();

  // Effect cleanup on unmount is not guaranteed synchronous under RNTL/React
  // 19 (see useMachine's queueMicrotask dispose note) — await it too.
  await page.waitFor(() => {
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

test("an emitted sample moves the shared value off centre", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);

  const page = useGyroDriftPage();
  await page.mount(true);
  await page.waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });

  expect(page.value.value).toEqual({ mx: 0, my: 0 });

  const listener = mockedAddListener.mock.calls[0]?.[0];
  listener?.({ x: 1, y: 1, z: 0, timestamp: 0 });

  expect(page.value.value).not.toEqual({ mx: 0, my: 0 });
});

test("stays within -1..1 under a long run of large samples", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);

  const page = useGyroDriftPage();
  await page.mount(true);
  await page.waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });

  const listener = mockedAddListener.mock.calls[0]?.[0];

  for (let i = 0; i < 500; i++) {
    listener?.({ x: 1000, y: -1000, z: 0, timestamp: i });
  }

  expect(page.value.value.mx).toBeGreaterThanOrEqual(-1);
  expect(page.value.value.mx).toBeLessThanOrEqual(1);
  expect(page.value.value.my).toBeGreaterThanOrEqual(-1);
  expect(page.value.value.my).toBeLessThanOrEqual(1);
});

test("an unavailable gyroscope leaves the value centred and never throws", async () => {
  mockedIsAvailableAsync.mockResolvedValue(false);

  const page = useGyroDriftPage();
  await page.mount(true);

  await page.waitFor(() => {
    expect(mockedIsAvailableAsync).toHaveBeenCalled();
  });

  expect(mockedAddListener).not.toHaveBeenCalled();
  expect(page.value.value).toEqual({ mx: 0, my: 0 });
});
