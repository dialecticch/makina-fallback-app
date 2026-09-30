import { useLayoutEffect, useRef, useState } from "react";

/**
 * Table or cards, decided by what actually fits instead of a viewport breakpoint, so no content (long names, badges,
 * fonts, zoom level) can force horizontal scrolling.
 *
 * Put `ref` on an element that stays mounted in both layouts and contains the table in the wide one. While the table
 * is shown it is measured after every render and on every resize; if it is wider than its box, the layout switches to
 * cards and remembers the width it needed, then switches back once the container is at least that wide again. The
 * switch happens in a layout effect, before the browser paints, so the wrong layout never flashes.
 */
export function useTableFits<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [fits, setFits] = useState(true);
  const needed = useRef(0);

  // No dependency list on purpose: rows, badges or fonts change the table's width without resizing its container.
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const table = container.querySelector("table");
      const box = table?.parentElement;
      if (table && box) {
        const overflow = table.offsetWidth - box.clientWidth;
        if (overflow > 0) {
          needed.current = container.clientWidth + overflow;
          setFits(false);
        }
      } else if (needed.current > 0 && container.clientWidth >= needed.current) {
        setFits(true);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  });

  return { ref, fits };
}
