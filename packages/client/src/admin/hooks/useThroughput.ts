import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;
const MESSAGE_DISMISS_MS = 3_000;

const SERVER_HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL as string | undefined;

interface ThroughputState {
  value: number;
  loading: boolean;
  message: { text: string; isError: boolean } | null;
  setValue: (value: number) => void;
}

export function useThroughput(): ThroughputState {
  const [value, setLocalValue] = useState(100);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseUrl = SERVER_HTTP_URL ?? "http://localhost:4000";

  // Fetch initial throughput
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${baseUrl}/throughput`);
        const data = await resp.json() as { value: number };
        if (!cancelled) {
          setLocalValue(data.value);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [baseUrl]);

  const showMessage = useCallback((text: string, isError: boolean) => {
    setMessage({ text, isError });
    if (dismissRef.current) clearTimeout(dismissRef.current);
    dismissRef.current = setTimeout(() => setMessage(null), MESSAGE_DISMISS_MS);
  }, []);

  const setValue = useCallback(
    (newValue: number) => {
      setLocalValue(newValue);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const resp = await fetch(`${baseUrl}/throughput`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: newValue }),
          });
          if (!resp.ok) throw new Error("Server error");
          showMessage(`Throughput has been set to ${newValue}`, false);
        } catch {
          showMessage("Error setting throughput", true);
        }
      }, DEBOUNCE_MS);
    },
    [baseUrl, showMessage],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (dismissRef.current) clearTimeout(dismissRef.current);
    };
  }, []);

  return { value, loading, message, setValue };
}
