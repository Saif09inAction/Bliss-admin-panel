"use client";

import { useEffect, useState } from "react";

/** True below Tailwind `lg` (1024px). SSR-safe (false on server). */
export function useIsMobile(breakpoint = 1023): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);

  return mobile;
}
