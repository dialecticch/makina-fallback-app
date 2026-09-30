/**
 * Per-RPC pacing for the log scanner (log-scanner.ts), as in TCP congestion control (AIMD): requests are spaced at
 * a per-RPC rate that halves on a rate limit and grows slowly on success, with a bounded number in flight. A scan
 * settles at whatever rate a free public RPC tolerates and keeps making progress at that rate, rather than
 * bursting, getting blocked, and then sitting idle through a cooldown.
 *
 * A rate limit never counts as a failure of the requested block range: shrinking the range on 429s means more
 * requests and more 429s, down to 1-block requests.
 */

const MAX_IN_FLIGHT = 4;
/** Requests per second. */
const INITIAL_RATE = 8;
const MIN_RATE = 0.5;
const MAX_RATE = 50;
/** On success the rate grows by about this many requests per second, every second. */
const RATE_INCREASE = 0.5;

type TransportState = {
  rate: number;
  /** Earliest time the next request may start. */
  nextAt: number;
  /** When the rate was last cut: 429s for requests started before this belong to the same burst. */
  lastCutAt: number;
  inFlight: number;
  waiting: (() => void)[];
};

const states = new Map<string, TransportState>();

function stateOf(id: string): TransportState {
  let s = states.get(id);
  if (!s) {
    s = { rate: INITIAL_RATE, nextAt: 0, lastCutAt: 0, inFlight: 0, waiting: [] };
    states.set(id, s);
  }
  return s;
}

const RATE_LIMIT_TEXT = /rate.?limit|too many requests|over rate limit|request limit|throttl/i;
/** What browsers report when a request got no readable response (including 429s sent without CORS headers). */
const NETWORK_ERROR_TEXT = /failed to fetch|networkerror|load failed|network request failed/i;

/**
 * True for errors that say nothing about the requested block range, so they must not shrink it:
 * - HTTP 429, and JSON-RPC errors whose message says rate limit (codes like -32005 are ambiguous);
 * - HTTP 502, 503 and 504 (an overloaded endpoint);
 * - no readable response at all. Public RPCs often send 429s without CORS headers, which browsers surface only
 *   as a generic "Failed to fetch".
 * Timeouts are not included: a huge range can legitimately be slow.
 */
export function isRateLimitError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    const e = current as {
      name?: string;
      status?: number;
      message?: string;
      details?: string;
      shortMessage?: string;
      cause?: unknown;
    };
    if (e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504) return true;
    const texts = [e.message, e.details, e.shortMessage].filter((m): m is string => typeof m === "string");
    if (texts.some((m) => RATE_LIMIT_TEXT.test(m))) return true;
    if (e.name === "TypeError" && texts.some((m) => NETWORK_ERROR_TEXT.test(m))) return true;
    if (e.name === "HttpRequestError" && e.status === undefined && texts.some((m) => NETWORK_ERROR_TEXT.test(m))) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

/** A request started at `startedAt` was rate-limited. Cuts the rate once per burst. */
export function markRateLimited(id: string, startedAt: number, now = Date.now()) {
  const s = stateOf(id);
  if (startedAt < s.lastCutAt) return;
  s.rate = Math.max(MIN_RATE, s.rate / 2);
  s.lastCutAt = now;
  s.nextAt = Math.max(s.nextAt, now + 1000 / s.rate);
}

export function markHealthy(id: string) {
  const s = stateOf(id);
  s.rate = Math.min(MAX_RATE, s.rate + RATE_INCREASE / s.rate);
}

/** Current pacing, for tests and debugging. */
export function rateOf(id: string) {
  return stateOf(id).rate;
}

/**
 * Runs `fn` once fewer than MAX_IN_FLIGHT requests are running on this RPC and its pacing allows another
 * one. `fn` receives the time it actually started, for `markRateLimited`.
 */
export async function withTransportSlot<T>(id: string, fn: (startedAt: number) => Promise<T>): Promise<T> {
  const s = stateOf(id);
  if (s.inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => s.waiting.push(resolve));
  s.inFlight += 1;
  try {
    const now = Date.now();
    const at = Math.max(now, s.nextAt);
    s.nextAt = at + 1000 / s.rate;
    if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
    return await fn(Date.now());
  } finally {
    s.inFlight -= 1;
    s.waiting.shift()?.();
  }
}

/** For tests. */
export function resetRateLimitState() {
  states.clear();
}
