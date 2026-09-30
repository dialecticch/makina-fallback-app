import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scanLogs } from "@/lib/log-scanner";
import { resetRateLimitState } from "@/lib/rate-limit";

type Request = { url: string; from: number; to: number };

/** A fake JSON-RPC endpoint: `handler` decides each eth_getLogs reply. */
function stubFetch(handler: (r: Request) => { status?: number; logsAt?: number[]; error?: string }) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const params = JSON.parse(init.body).params[0];
      const r = { url, from: Number(BigInt(params.fromBlock)), to: Number(BigInt(params.toBlock)) };
      requests.push(r);
      const reply = handler(r);
      if (reply.status && reply.status !== 200) return new Response("{}", { status: reply.status });
      if (reply.error) return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: reply.error } });
      const result = (reply.logsAt ?? []).map((block, i) => ({
        address: "0x1111111111111111111111111111111111111111",
        topics: [],
        data: "0x",
        blockNumber: `0x${block.toString(16)}`,
        logIndex: `0x${i.toString(16)}`,
        transactionHash: `0x${block.toString(16).padStart(64, "0")}`,
      }));
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    }),
  );
  return requests;
}

const covered = (requests: Request[], from: number, to: number) => {
  const blocks = new Set<number>();
  for (const r of requests) for (let b = r.from; b <= r.to; b++) blocks.add(b);
  for (let b = from; b <= to; b++) if (!blocks.has(b)) return false;
  return true;
};

describe("scanLogs", () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function run(promise: Promise<unknown>) {
    const settled = promise.then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );
    await vi.runAllTimersAsync();
    return settled;
  }

  it("covers the range within each RPC's limit and returns the logs sorted", async () => {
    const requests = stubFetch((r) => ({
      logsAt: r.from <= 2_500 && 2_500 <= r.to ? [2_500] : r.from === 1 ? [1] : [],
    }));
    const result = await run(
      scanLogs({
        endpoints: [{ url: "https://a", maxBlocks: 1_000 }],
        filter: { topics: [] },
        fromBlock: 1n,
        toBlock: 4_000n,
      }),
    );
    expect(result.ok && (result.v as { blockNumber: bigint }[]).map((l) => l.blockNumber)).toEqual([1n, 2_500n]);
    expect(requests.every((r) => r.to - r.from + 1 <= 1_000)).toBe(true);
    expect(covered(requests, 1, 4_000)).toBe(true);
  });

  it("never asks an RPC marked maxBlocks: 0", async () => {
    const requests = stubFetch(() => ({}));
    await run(
      scanLogs({
        endpoints: [
          { url: "https://points-only", maxBlocks: 0 },
          { url: "https://b", maxBlocks: 2_000 },
        ],
        filter: { topics: [] },
        fromBlock: 1n,
        toBlock: 3_000n,
      }),
    );
    expect(requests.some((r) => r.url === "https://points-only")).toBe(false);
  });

  it("retries rate-limited ranges without shrinking them", async () => {
    let calls = 0;
    const requests = stubFetch(() => (++calls <= 3 ? { status: 429 } : {}));
    const result = await run(
      scanLogs({
        endpoints: [{ url: "https://c", maxBlocks: 1_000 }],
        filter: { topics: [] },
        fromBlock: 1n,
        toBlock: 1_000n,
      }),
    );
    expect(result.ok).toBe(true);
    expect(requests.every((r) => r.to - r.from + 1 === 1_000)).toBe(true);
  });

  it("halves the range on other errors, and grows it again on unknown RPCs", async () => {
    const requests = stubFetch((r) => (r.to - r.from + 1 > 2_500 ? { error: "block range too large" } : {}));
    const result = await run(
      scanLogs({ endpoints: [{ url: "https://d" }], filter: { topics: [] }, fromBlock: 1n, toBlock: 20_000n }),
    );
    expect(result.ok).toBe(true);
    expect(
      covered(
        requests.filter((r) => r.to - r.from + 1 <= 2_500),
        1,
        20_000,
      ),
    ).toBe(true);
  });

  it("fails with a clear message when every RPC keeps failing", async () => {
    stubFetch(() => ({ error: "boom" }));
    const result = await run(
      scanLogs({
        endpoints: [{ url: "https://e", maxBlocks: 10 }],
        filter: { topics: [] },
        fromBlock: 1n,
        toBlock: 100n,
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.e.message).toMatch(/Every RPC failed/);
  });
});
