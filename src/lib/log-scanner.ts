import { type Address, type Hex, numberToHex } from "viem";

import { isRateLimitError, markHealthy, markRateLimited, withTransportSlot } from "./rate-limit.ts";

/**
 * `eth_getLogs` over a large block range on free public RPCs, outside React.
 *
 * Every RPC works through the same queue of block ranges in parallel, each with its own range limit: the declared
 * `maxBlocks`, or for unknown RPCs 10,000 blocks, doubling on success and halving on errors. Requests are paced
 * per RPC (rate-limit.ts) and aborted on timeout. A rate limit puts the range back without penalising it.
 */

export type LogFilter = {
  /** Omitted: any contract (the caller filters by emitter). */
  address?: readonly Address[];
  topics: readonly (Hex | readonly Hex[] | null)[];
};

export type ScannedLog = {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
};

/** An RPC to scan with. `maxBlocks: 0` excludes it (point reads only). */
export type ScanEndpoint = { url: string; maxBlocks?: number };

const DEFAULT_CHUNK = 10_000n;
const MAX_ADAPTIVE_CHUNK = 200_000n;
const REQUEST_TIMEOUT_MS = 20_000;
/** Consecutive errors (rate limits included) after which an RPC stops taking part in this scan. */
const MAX_CONSECUTIVE_ERRORS = 12;
const WORKERS_PER_RPC = 3;

class RpcError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

type RawLog = {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  logIndex: Hex;
  transactionHash: Hex;
  removed?: boolean;
};

async function getLogs(url: string, filter: LogFilter, from: bigint, to: bigint, signal: AbortSignal | undefined) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [
        { address: filter.address, topics: filter.topics, fromBlock: numberToHex(from), toBlock: numberToHex(to) },
      ],
    }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new RpcError(`HTTP ${response.status} from ${new URL(url).host}`, response.status);
  const body = (await response.json()) as { result?: RawLog[]; error?: { code?: number; message?: string } };
  if (body.error || !Array.isArray(body.result)) throw new RpcError(body.error?.message ?? "Invalid eth_getLogs reply");
  return body.result
    .filter((l) => !l.removed)
    .map((l): ScannedLog => ({
      address: l.address,
      topics: l.topics,
      data: l.data,
      blockNumber: BigInt(l.blockNumber),
      logIndex: Number(l.logIndex),
      transactionHash: l.transactionHash,
    }));
}

/** All logs matching `filter` in `[fromBlock, toBlock]`, sorted by block and log index. */
export async function scanLogs(args: {
  endpoints: readonly ScanEndpoint[];
  filter: LogFilter;
  fromBlock: bigint;
  toBlock: bigint;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<ScannedLog[]> {
  const { filter, fromBlock, toBlock, onProgress, signal } = args;
  if (toBlock < fromBlock) return [];

  const rpcs = args.endpoints
    .filter((e) => e.maxBlocks !== 0)
    .map((e) => ({
      url: e.url,
      chunk: e.maxBlocks === undefined ? DEFAULT_CHUNK : BigInt(e.maxBlocks),
      adaptive: e.maxBlocks === undefined,
      errors: 0,
      retired: false,
    }));
  if (rpcs.length === 0) throw new Error("No RPC for this chain serves eth_getLogs.");

  const total = toBlock - fromBlock + 1n;
  let done = 0n;
  const pending: [bigint, bigint][] = [[fromBlock, toBlock]];
  const logs: ScannedLog[] = [];
  let inFlight = 0;
  let lastError: unknown;

  /** The next range of at most `size` blocks, oldest first. */
  const take = (size: bigint): [bigint, bigint] | undefined => {
    const next = pending.shift();
    if (!next) return undefined;
    const [from, to] = next;
    if (to - from + 1n <= size) return next;
    pending.unshift([from + size, to]);
    return [from, from + size - 1n];
  };

  async function worker(rpc: (typeof rpcs)[number]) {
    while (!rpc.retired) {
      signal?.throwIfAborted();
      const range = take(rpc.chunk);
      if (!range) {
        // Nothing queued: finished once no other request can fail and put a range back.
        if (inFlight === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      inFlight += 1;
      try {
        const found = await withTransportSlot(rpc.url, async (startedAt) => {
          try {
            return await getLogs(rpc.url, filter, range[0], range[1], signal);
          } catch (error) {
            if (isRateLimitError(error)) markRateLimited(rpc.url, startedAt);
            throw error;
          }
        });
        markHealthy(rpc.url);
        logs.push(...found);
        done += range[1] - range[0] + 1n;
        onProgress?.(Number(done) / Number(total));
        rpc.errors = 0;
        if (rpc.adaptive && rpc.chunk < MAX_ADAPTIVE_CHUNK) rpc.chunk *= 2n;
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
        pending.unshift(range);
        rpc.errors += 1;
        // Range too large, too many results, a timeout: try smaller ranges. Rate limits keep the range size.
        if (!isRateLimitError(error) && rpc.chunk > 1n) rpc.chunk /= 2n;
        if (rpc.errors >= MAX_CONSECUTIVE_ERRORS) rpc.retired = true;
      } finally {
        inFlight -= 1;
      }
    }
  }

  await Promise.all(rpcs.flatMap((rpc) => Array.from({ length: WORKERS_PER_RPC }, () => worker(rpc))));
  if (pending.length > 0) {
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Every RPC failed to return logs (${reason}). Add your own RPC in Settings.`);
  }

  return logs.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
}
