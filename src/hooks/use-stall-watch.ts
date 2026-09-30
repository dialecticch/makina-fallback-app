import { useEffect, useRef, useState } from "react";

const STALL_AFTER_MS = 45_000;

/**
 * Watches a loading signature (phase and progress). If it stays unchanged for 45 s while not done, returns how long
 * it has been stuck, so the UI can say "rate-limited, keep waiting or add an RPC" instead of a silent spinner.
 */
export function useStallWatch(signature: string, done: boolean): number | undefined {
  const last = useRef({ signature, at: Date.now() });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [done]);

  if (last.current.signature !== signature) last.current = { signature, at: Date.now() };
  const stuck = Math.max(0, now - last.current.at);
  return !done && stuck >= STALL_AFTER_MS ? stuck : undefined;
}
