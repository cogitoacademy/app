"use client";

import { useEffect, useState } from "react";

/**
 * Keeps time-sensitive UI current without reading a clock on every render.
 * Refreshing when a hidden tab becomes visible prevents stale labels after the
 * browser suspends background timers.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, intervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") update();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);

  return now;
}
