import { useEffect, useState } from "react";

/** Current Unix time in seconds as a bigint, re-rendering every `intervalMs`. */
export function useNowSeconds(intervalMs = 30_000): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const id = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
