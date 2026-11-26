import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Keeps an overlay mounted briefly while playing its exit animation,
 * cancelling cleanly if reopened before unmount.
 */
export function usePresence(
  open: boolean,
  exitMs = 190,
): { mounted: boolean; state: "open" | "exiting" } {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<"open" | "exiting">(
    open ? "open" : "exiting",
  );

  useEffect(() => {
    if (open) {
      setMounted(true);
      setState("open");
      return;
    }
    if (!mounted) return;
    if (exitMs <= 0 || prefersReducedMotion()) {
      setMounted(false);
      setState("exiting");
      return;
    }
    setState("exiting");
    const timer = window.setTimeout(() => {
      setMounted(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs, mounted]);

  return { mounted: open || mounted, state: open ? "open" : state };
}

/**
 * Preserves the last non-empty value while an overlay is playing its exit transition.
 */
export function usePreservedValue<T>(
  value: T | null | undefined,
  active: boolean,
): T | null {
  const ref = useRef<T | null>(value ?? null);
  if (active && value !== null && value !== undefined) {
    ref.current = value;
  }
  return active ? (value ?? ref.current) : ref.current;
}
