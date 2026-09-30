import { HttpRequestError, RpcRequestError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRateLimitError,
  markHealthy,
  markRateLimited,
  rateOf,
  resetRateLimitState,
  withTransportSlot,
} from "@/lib/rate-limit";

describe("per-RPC pacing for log scans", () => {
  beforeEach(() => resetRateLimitState());
  afterEach(() => vi.useRealTimers());

  it("recognises HTTP 429 and rate-limit JSON-RPC errors, but not range errors", () => {
    expect(isRateLimitError(new HttpRequestError({ url: "https://x", status: 429 }))).toBe(true);
    const rpc = (code: number, message: string) =>
      new RpcRequestError({ body: {}, url: "https://x", error: { code, message } });
    expect(isRateLimitError(rpc(-32005, "rate limit exceeded"))).toBe(true);
    expect(isRateLimitError(rpc(-32016, "over rate limit"))).toBe(true);
    expect(isRateLimitError(rpc(-32029, "Too Many Requests, Please apply an API key"))).toBe(true);
    // Infura-style -32005 about result size is a range problem, not a rate limit.
    expect(isRateLimitError(rpc(-32005, "query returned more than 10000 results"))).toBe(false);
    expect(isRateLimitError(rpc(-32614, "eth_getLogs is limited to a 2,000 range"))).toBe(false);
  });

  it("treats unreadable responses (429s without CORS headers) and 5xx overload as rate limits, not timeouts", () => {
    const corsBlocked = new HttpRequestError({ url: "https://x", cause: new TypeError("Failed to fetch") });
    expect(isRateLimitError(corsBlocked)).toBe(true);
    expect(isRateLimitError(new HttpRequestError({ url: "https://x", status: 503 }))).toBe(true);
    expect(isRateLimitError(new Error("Promise timed out"))).toBe(false);
    expect(isRateLimitError(new HttpRequestError({ url: "https://x", status: 400 }))).toBe(false);
  });

  it("halves the rate once per burst of 429s, down to a floor, and recovers slowly", () => {
    const t0 = 1_000_000;
    expect(rateOf("a")).toBe(8);
    markRateLimited("a", t0, t0);
    markRateLimited("a", t0 - 100, t0 + 50); // started before the cut: same burst, no second cut
    expect(rateOf("a")).toBe(4);
    markRateLimited("a", t0 + 100, t0 + 200);
    expect(rateOf("a")).toBe(2);
    for (let i = 1; i <= 10; i++) markRateLimited("a", t0 + 1_000 * i, t0 + 1_000 * i);
    expect(rateOf("a")).toBe(0.5);
    for (let i = 0; i < 40; i++) markHealthy("a");
    expect(rateOf("a")).toBeGreaterThan(4);
    expect(rateOf("b")).toBe(8);
  });

  it("spaces requests at the RPC's rate and runs at most four at once", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    let running = 0;
    let peak = 0;
    const task = () =>
      withTransportSlot("t", async () => {
        starts.push(Date.now());
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        running -= 1;
      });
    const all = Promise.all(Array.from({ length: 10 }, task));
    await vi.runAllTimersAsync();
    await all;
    expect(starts).toHaveLength(10);
    expect(peak).toBe(4);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(125); // 8 req/s
  });
});
