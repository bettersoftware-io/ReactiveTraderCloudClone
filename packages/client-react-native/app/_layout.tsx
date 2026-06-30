import { Stack } from "expo-router";
import type { JSX } from "react";

export default function RootLayout(): JSX.Element {
  return <Stack screenOptions={{ headerTitle: "RTC Mobile" }} />;
}
