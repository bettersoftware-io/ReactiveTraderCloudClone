import { beforeEach, expect, jest, test } from "@jest/globals";
import { renderHook, waitFor } from "@testing-library/react-native";
import { Gyroscope } from "expo-sensors";

import { useGyroDrift } from "#/ui/shell/boot/useGyroDrift";

const mockedAddListener = jest.mocked(Gyroscope.addListener);
const mockedIsAvailableAsync = jest.mocked(Gyroscope.isAvailableAsync);

beforeEach(() => {
  jest.clearAllMocks();
  mockedIsAvailableAsync.mockResolvedValue(false);
});

test("does not subscribe while disabled", async () => {
  await renderHook(() => {
    return useGyroDrift(false);
  });

  expect(mockedIsAvailableAsync).not.toHaveBeenCalled();
  expect(mockedAddListener).not.toHaveBeenCalled();
});

test("subscribes once enabled and the gyroscope is available", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);

  await renderHook(() => {
    return useGyroDrift(true);
  });

  await waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });
});

test("removes the listener on unmount", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);
  const remove = jest.fn();
  mockedAddListener.mockReturnValue({
    remove,
  } as ReturnType<typeof Gyroscope.addListener>);

  const { unmount } = await renderHook(() => {
    return useGyroDrift(true);
  });
  await waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });

  await unmount();

  // Effect cleanup on unmount is not guaranteed synchronous under RNTL/React
  // 19 (see useMachine's queueMicrotask dispose note) — await it too.
  await waitFor(() => {
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

test("an emitted sample moves the shared value off centre", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);

  const { result } = await renderHook(() => {
    return useGyroDrift(true);
  });
  await waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });

  expect(result.current.value).toEqual({ mx: 0, my: 0 });

  const listener = mockedAddListener.mock.calls[0]?.[0];
  listener?.({ x: 1, y: 1, z: 0, timestamp: 0 });

  expect(result.current.value).not.toEqual({ mx: 0, my: 0 });
});

test("stays within -1..1 under a long run of large samples", async () => {
  mockedIsAvailableAsync.mockResolvedValue(true);

  const { result } = await renderHook(() => {
    return useGyroDrift(true);
  });
  await waitFor(() => {
    expect(mockedAddListener).toHaveBeenCalledTimes(1);
  });

  const listener = mockedAddListener.mock.calls[0]?.[0];

  for (let i = 0; i < 500; i++) {
    listener?.({ x: 1000, y: -1000, z: 0, timestamp: i });
  }

  expect(result.current.value.mx).toBeGreaterThanOrEqual(-1);
  expect(result.current.value.mx).toBeLessThanOrEqual(1);
  expect(result.current.value.my).toBeGreaterThanOrEqual(-1);
  expect(result.current.value.my).toBeLessThanOrEqual(1);
});

test("an unavailable gyroscope leaves the value centred and never throws", async () => {
  mockedIsAvailableAsync.mockResolvedValue(false);

  const { result } = await renderHook(() => {
    return useGyroDrift(true);
  });

  await waitFor(() => {
    expect(mockedIsAvailableAsync).toHaveBeenCalled();
  });

  expect(mockedAddListener).not.toHaveBeenCalled();
  expect(result.current.value).toEqual({ mx: 0, my: 0 });
});
