import { useLayoutEffect, useMemo, useRef, useState } from "react";

export function useEventVisibility({
  eventHeight,
  eventGap,
  measurementKey,
}: {
  eventHeight: number;
  eventGap: number;
  measurementKey: number;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const updateHeight = () => setContentHeight(element.clientHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measurementKey]);

  const getVisibleEventCount = useMemo(
    () => (totalEvents: number) => {
      if (contentHeight === null) return totalEvents;

      const maxEvents = Math.floor(contentHeight / (eventHeight + eventGap));
      if (totalEvents <= maxEvents) return totalEvents;
      return maxEvents > 0 ? maxEvents - 1 : 0;
    },
    [contentHeight, eventGap, eventHeight],
  );

  return { contentRef, getVisibleEventCount };
}
