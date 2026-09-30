import {
  type Address,
  encodeEventTopics,
  getAbiItem,
  type Hex,
  isAddressEqual,
  pad,
  parseEventLogs,
  type PublicClient,
} from "viem";

import { asyncRedeemerAbi, machineAbi } from "@/abis";
import type { MachineData } from "@/data/types";
import type { ActivityItem } from "@/data/user-types";
import { type LogFilter, type ScanEndpoint, type ScannedLog, scanLogs } from "@/lib/log-scanner";

/**
 * A user's on-chain history (deposits, redemption requests, claims) on one chain: the only thing the app still
 * reads from event logs, and only when the user asks for it.
 *
 * One filter per chain and user, with no address: the three event signatures in topics[0] (all Makina-specific)
 * and the user in topics[2] (`receiver` in all three). Logs are then kept only when a known Machine or redeemer
 * emitted them. Because the filter does not list contracts, a new Machine never invalidates the cache.
 */

export const ACTIVITY_EVENTS_ABI = [
  getAbiItem({ abi: machineAbi, name: "Deposit" }),
  getAbiItem({ abi: asyncRedeemerAbi, name: "RedeemRequestCreated" }),
  getAbiItem({ abi: asyncRedeemerAbi, name: "RedeemRequestClaimed" }),
] as const;

export function activityFilter(user: Address): LogFilter {
  const topic0 = ACTIVITY_EVENTS_ABI.map((event) => encodeEventTopics({ abi: [event] } as never)[0]! as Hex);
  return { topics: [topic0, null, pad(user.toLowerCase() as Hex)] };
}

// MARK: Cache

/** Persisted scan: logs up to `to` (a block old enough not to be reorged), with their block timestamps. */
type Stored = {
  v: 1;
  from: string;
  to: string;
  logs: (Omit<ScannedLog, "blockNumber"> & { blockNumber: string; time?: string })[];
};

export const ACTIVITY_CACHE_PREFIX = "makina-fallback:activity:";
const cacheKey = (chainId: number, user: Address) => `${ACTIVITY_CACHE_PREFIX}v1:${chainId}:${user.toLowerCase()}`;

export function hasActivityCache(chainId: number, user: Address) {
  try {
    return localStorage.getItem(cacheKey(chainId, user)) !== null;
  } catch {
    return false;
  }
}

type TimedLog = ScannedLog & { time?: bigint };

function load(key: string): { from: bigint; to: bigint; logs: TimedLog[] } | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Stored;
    if (stored.v !== 1) return undefined;
    return {
      from: BigInt(stored.from),
      to: BigInt(stored.to),
      logs: stored.logs.map((l) => ({
        ...l,
        blockNumber: BigInt(l.blockNumber),
        time: l.time === undefined ? undefined : BigInt(l.time),
      })),
    };
  } catch {
    return undefined;
  }
}

function save(key: string, from: bigint, to: bigint, logs: TimedLog[]) {
  const stored: Stored = {
    v: 1,
    from: from.toString(),
    to: to.toString(),
    logs: logs.map((l) => ({ ...l, blockNumber: l.blockNumber.toString(), time: l.time?.toString() })),
  };
  try {
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Quota or storage disabled: the next visit rescans.
  }
}

/**
 * Scans `[fromBlock, head]`, reusing the cached part and fetching block timestamps for new logs. Only blocks at
 * least `confirmations` deep are cached.
 */
export async function scanActivity(args: {
  client: Pick<PublicClient, "getBlockNumber" | "getBlock">;
  endpoints: readonly ScanEndpoint[];
  chainId: number;
  user: Address;
  fromBlock: bigint;
  confirmations: bigint;
  machines: readonly MachineData[];
  onProgress?: (fraction: number) => void;
}): Promise<ActivityItem[]> {
  const { client, endpoints, chainId, user, fromBlock, onProgress } = args;
  const key = cacheKey(chainId, user);
  const filter = activityFilter(user);
  const head = await client.getBlockNumber();
  const safe = head - args.confirmations;

  const cached = load(key);
  // Ranges still to scan: before the cache, after it, or everything.
  const ranges: [bigint, bigint][] = cached
    ? [...(fromBlock < cached.from ? [[fromBlock, cached.from - 1n] as [bigint, bigint]] : []), [cached.to + 1n, head]]
    : [[fromBlock, head]];
  const total = ranges.reduce((n, [a, b]) => n + (b >= a ? b - a + 1n : 0n), 0n);

  let before = 0n;
  const fresh: TimedLog[] = [];
  for (const [a, b] of ranges) {
    if (b < a) continue;
    const size = b - a + 1n;
    const found = await scanLogs({
      endpoints,
      filter,
      fromBlock: a,
      toBlock: b,
      onProgress: (f) => onProgress?.((Number(before) + f * Number(size)) / Math.max(1, Number(total))),
    });
    fresh.push(...found);
    before += size;
  }

  const all: TimedLog[] = [...(cached?.logs ?? []), ...fresh];
  const untimed = [...new Set(all.filter((l) => l.time === undefined).map((l) => l.blockNumber))];
  const blocks = await Promise.all(
    untimed.map((blockNumber) => client.getBlock({ blockNumber }).catch(() => undefined)),
  );
  const times = new Map(blocks.filter((b) => b?.number != null).map((b) => [b!.number!, b!.timestamp]));
  for (const l of all) if (l.time === undefined) l.time = times.get(l.blockNumber);

  const cacheFrom = cached && cached.from < fromBlock ? cached.from : fromBlock;
  save(
    key,
    cacheFrom,
    safe,
    all.filter((l) => l.blockNumber <= safe),
  );
  return toActivity(chainId, all, args.machines);
}

/** Keeps logs emitted by a known Machine (deposits) or its redeemer (requests, claims), newest first. */
export function toActivity(
  chainId: number,
  logs: readonly TimedLog[],
  machines: readonly MachineData[],
): ActivityItem[] {
  const parsed = parseEventLogs({ abi: ACTIVITY_EVENTS_ABI, logs: logs as never, strict: true });
  const timeOf = new Map(logs.map((l) => [`${l.transactionHash}:${l.logIndex}`, l.time]));
  const items: ActivityItem[] = [];
  for (const log of parsed) {
    const base = {
      chainId,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      time: timeOf.get(`${log.transactionHash}:${log.logIndex}`),
    };
    if (log.eventName === "Deposit") {
      const m = machines.find((d) => isAddressEqual(d.machine, log.address));
      if (m)
        items.push({ ...base, kind: "deposit", machine: m.machine, assets: log.args.assets, shares: log.args.shares });
      continue;
    }
    const m = machines.find((d) => d.redeemer && isAddressEqual(d.redeemer, log.address));
    if (!m) continue;
    if (log.eventName === "RedeemRequestCreated") {
      items.push({
        ...base,
        kind: "request",
        machine: m.machine,
        shares: log.args.shares,
        requestId: log.args.requestId,
      });
    } else {
      items.push({
        ...base,
        kind: "claim",
        machine: m.machine,
        shares: log.args.shares,
        assets: log.args.assets,
        requestId: log.args.requestId,
      });
    }
  }
  return items.reverse();
}
