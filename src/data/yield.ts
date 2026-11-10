import {
  type Address,
  encodeEventTopics,
  getAddress,
  type Hex,
  hexToBigInt,
  keccak256,
  pad,
  type PublicClient,
  toHex,
} from "viem";

import { machineAbi, machineShareAbi } from "@/abis";
import { ACTIVITY_CACHE_PREFIX, scanCached } from "@/data/activity";
import type { MachineData } from "@/data/types";
import type { ActivityItem } from "@/data/user-types";
import { asBigint, call, multicallLoose } from "@/lib/calls";
import type { LogFilter, ScanEndpoint } from "@/lib/log-scanner";
import { findDeploymentBlock } from "@/lib/start-block";
import { classifyTransfers, type Movement, movementKey, type ShareTransfer, type YieldEvents } from "@/lib/yield";

/**
 * The inputs of the earnings figure (src/lib/yield.ts) on one chain, loaded with the activity history: the user's
 * share-token transfers (two filters, from and to the user, over the hub's share tokens), labelled against the
 * activity, and the value at its block of every transfer that is not a deposit or a request.
 */

export type ChainYieldData = {
  /** By lowercase Machine address. `movements` is undefined when a deposit or request has no matching transfer. */
  byMachine: Record<string, { movements: Movement[] | undefined; claims: YieldEvents["claims"] }>;
  /** `convertToAssets(shares)` at the block of each external movement, by `movementKey`. */
  values: Map<string, bigint>;
};

const TRANSFER = encodeEventTopics({ abi: machineShareAbi, eventName: "Transfer" })[0] as Hex;

export function transferFilters(user: Address, shareTokens: readonly Address[]): LogFilter[] {
  const topic = pad(user.toLowerCase() as Hex);
  return [
    { address: shareTokens, topics: [TRANSFER, topic] },
    { address: shareTokens, topics: [TRANSFER, null, topic] },
  ];
}

const keyBase = (kind: string, chainId: number, user: Address) =>
  `${ACTIVITY_CACHE_PREFIX}${kind}:v1:${chainId}:${user.toLowerCase()}`;

/** The user's transfers of every share token on the chain. The cache is per token set: a new Machine rescans. */
export async function scanShareTransfers(args: {
  client: Pick<PublicClient, "getBlockNumber" | "getBlock">;
  endpoints: readonly ScanEndpoint[];
  chainId: number;
  user: Address;
  fromBlock: bigint;
  confirmations: bigint;
  machines: readonly MachineData[];
  onProgress?: (fraction: number) => void;
}): Promise<{ transfers: (ShareTransfer & { machine: Address })[]; head: bigint }> {
  const tokens = [...new Set(args.machines.map((m) => m.shareToken.toLowerCase()))].sort() as Address[];
  const base = keyBase("transfers", args.chainId, args.user);
  const key = `${base}:${keccak256(toHex(tokens.join())).slice(2, 14)}`;
  dropSiblings(base, key);

  const { logs, head } = await scanCached({
    ...args,
    key,
    filters: transferFilters(args.user, tokens),
    withTimes: false,
  });
  const machineOf = new Map(args.machines.map((m) => [m.shareToken.toLowerCase(), m.machine]));
  const transfers = logs.flatMap((l) => {
    const machine = machineOf.get(l.address.toLowerCase());
    if (!machine || l.topics.length !== 3) return [];
    return [
      {
        machine,
        from: getAddress(`0x${l.topics[1]!.slice(26)}`),
        to: getAddress(`0x${l.topics[2]!.slice(26)}`),
        shares: hexToBigInt(l.data),
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
        txHash: l.transactionHash,
      },
    ];
  });
  return { transfers, head };
}

/** Removes cache entries for earlier token sets of this chain and user. */
function dropSiblings(base: string, keep: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${base}:`) && k !== keep) localStorage.removeItem(k);
    }
  } catch {
    // Storage disabled: nothing cached.
  }
}

/** Labels each Machine's transfers against the activity, then values the external ones at their block. */
export async function loadYieldData(args: {
  client: Pick<PublicClient, "multicall" | "getBlockNumber" | "getCode">;
  chainId: number;
  user: Address;
  fromBlock: bigint;
  /** Values at or below this block are final and cached. */
  safeBlock: bigint;
  machines: readonly MachineData[];
  activity: readonly ActivityItem[];
  transfers: readonly (ShareTransfer & { machine: Address })[];
}): Promise<ChainYieldData> {
  const { client, user } = args;
  const byMachine: ChainYieldData["byMachine"] = {};
  for (const m of args.machines) {
    const key = m.machine.toLowerCase();
    const mine = args.activity.filter((a) => a.machine.toLowerCase() === key);
    const transfers = args.transfers.filter((t) => t.machine.toLowerCase() === key);
    if (transfers.length === 0 && mine.length === 0) continue;
    const events: YieldEvents = {
      deposits: mine.flatMap((a) =>
        a.kind === "deposit" ? [{ txHash: a.txHash, assets: a.assets!, shares: a.shares! }] : [],
      ),
      requests: mine.flatMap((a) =>
        a.kind === "request" ? [{ txHash: a.txHash, requestId: a.requestId!, shares: a.shares! }] : [],
      ),
      claims: mine.flatMap((a) => (a.kind === "claim" ? [{ requestId: a.requestId!, assets: a.assets! }] : [])),
    };
    byMachine[key] = {
      movements: classifyTransfers({ user, redeemer: m.redeemer, transfers, events }),
      claims: events.claims,
    };
  }

  const external = Object.entries(byMachine).flatMap(([machine, d]) =>
    (d.movements ?? []).filter((x) => x.kind === "external").map((x) => ({ ...x, machine: machine as Address })),
  );
  const cacheKey = keyBase("values", args.chainId, user);
  const values = loadValues(cacheKey);
  const missing = external.filter((x) => !values.has(movementKey(x)));

  // One historical multicall per block. Before a Machine launched (shares minted by a pre-deposit vault), its
  // first block prices them.
  const launches = new Map<string, Promise<bigint | undefined>>();
  const launchOf = (machine: Address) => {
    if (!launches.has(machine)) {
      launches.set(
        machine,
        findDeploymentBlock(client, machine, { low: args.fromBlock }).catch(() => undefined),
      );
    }
    return launches.get(machine)!;
  };
  const read = (list: typeof missing, blockNumber: bigint) =>
    multicallLoose(
      client,
      list.map((x) => call(x.machine, machineAbi, "convertToAssets", [x.shares])),
      { blockNumber },
    ).catch(() => list.map(() => undefined));

  const blocks = [...new Set(missing.map((x) => x.blockNumber))];
  await Promise.all(
    blocks.map(async (block) => {
      const list = missing.filter((x) => x.blockNumber === block);
      const results = await read(list, block);
      await Promise.all(
        list.map(async (x, i) => {
          let value = asBigint(results[i]);
          if (value === undefined) {
            const launch = await launchOf(x.machine);
            if (launch !== undefined && launch > block) value = asBigint((await read([x], launch))[0]);
          }
          if (value !== undefined) values.set(movementKey(x), value);
        }),
      );
    }),
  );

  saveValues(
    cacheKey,
    values,
    new Set(external.filter((x) => x.blockNumber <= args.safeBlock).map((x) => movementKey(x))),
  );
  return { byMachine, values };
}

function loadValues(key: string): Map<string, bigint> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>).map(([k, v]) => [k, BigInt(v)]));
  } catch {
    return new Map();
  }
}

function saveValues(key: string, values: Map<string, bigint>, keep: Set<string>) {
  try {
    const out = Object.fromEntries([...values].filter(([k]) => keep.has(k)).map(([k, v]) => [k, v.toString()]));
    localStorage.setItem(key, JSON.stringify(out));
  } catch {
    // Quota or storage disabled: the next visit reads them again.
  }
}
