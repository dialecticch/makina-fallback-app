import { type Address, getAddress, getContractAddress, isAddressEqual, type PublicClient, zeroAddress } from "viem";

import { hubCoreFactoryAbi, hubCoreRegistryAbi, machineAbi } from "../abis/index.ts";
import type { HubInstance } from "../config/instances.ts";

/**
 * Machine discovery from chain state, without event logs.
 *
 * HubCoreFactory deploys every Machine with a plain CREATE (`new BeaconProxy(...)`), so each Machine's address is
 * `getContractAddress(factory, nonce)` for one of the factory's past nonces. Reading the factory's nonce and asking
 * the factory `isMachine` for each candidate address finds every Machine in two requests, however old the chain.
 * (The nonce also counts share tokens, pre-deposit vaults and the CREATE3 deployments of calibers and bridge
 * adapters; `isMachine` filters those out.)
 *
 * This relies on the factory implementation deploying Machines with CREATE. Built-in hubs pin the implementation
 * they were checked against (`factoryImplementation` in instances.ts, verified by `pnpm check-factories`), and the
 * app warns when a factory has been upgraded since.
 */

/** A Machine found through its factory. `index` is the global creation order (factory order, then nonce). */
export type MachineRef = { machine: Address; shareToken: Address; factory: Address; index: number };

/** EIP-1967 implementation slot: `bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)`. */
export const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

type Client = Pick<PublicClient, "getTransactionCount" | "multicall" | "readContract" | "getStorageAt">;

/** Every Machine created by `factories`, oldest first. */
export async function enumerateMachines(client: Client, factories: readonly Address[]): Promise<MachineRef[]> {
  const out: MachineRef[] = [];
  for (const factory of factories) {
    const nonce = await client.getTransactionCount({ address: factory });
    // Contract nonces start at 1 (EIP-161): deployments used nonces 1 .. nonce - 1.
    const candidates = Array.from({ length: Math.max(0, nonce - 1) }, (_, i) =>
      getContractAddress({ from: factory, nonce: BigInt(i + 1) }),
    );
    if (candidates.length === 0) continue;
    const results = await client.multicall({
      contracts: candidates.flatMap((candidate) => [
        { address: factory, abi: hubCoreFactoryAbi, functionName: "isMachine", args: [candidate] } as const,
        { address: candidate, abi: machineAbi, functionName: "shareToken" } as const,
      ]),
      allowFailure: true,
      batchSize: 16_384,
    });
    candidates.forEach((machine, i) => {
      const isMachine = results[2 * i];
      const shareToken = results[2 * i + 1];
      if (isMachine?.status !== "success" || isMachine.result !== true) return;
      if (shareToken?.status !== "success" || typeof shareToken.result !== "string") return;
      out.push({ machine, shareToken: shareToken.result as Address, factory, index: out.length });
    });
  }
  return out;
}

/** The address stored in a proxy's EIP-1967 implementation slot, or undefined for a non-proxy. */
export async function readImplementation(client: Client, proxy: Address): Promise<Address | undefined> {
  const slot = await client.getStorageAt({ address: proxy, slot: IMPLEMENTATION_SLOT });
  if (!slot || BigInt(slot) === 0n) return undefined;
  return getAddress(`0x${slot.slice(-40)}`);
}

/**
 * Every factory the registry pointed at between `fromBlock` and `toBlock`, found by bisecting historical
 * `coreFactory()` reads (about 20 reads per change, 2 when nothing changed). Needs an RPC that serves historical
 * state; throws otherwise. A change that was later reverted (A → B → A) between two probes is not detected.
 */
export async function factoryHistory(
  client: Pick<PublicClient, "readContract">,
  registry: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Address[]> {
  const at = (blockNumber: bigint) =>
    client.readContract({ address: registry, abi: hubCoreRegistryAbi, functionName: "coreFactory", blockNumber });
  const found: Address[] = [];
  const add = (a: Address) => {
    if (a !== zeroAddress && !found.some((f) => isAddressEqual(f, a))) found.push(a);
  };

  async function bisect(lo: bigint, loValue: Address, hi: bigint, hiValue: Address): Promise<void> {
    if (isAddressEqual(loValue, hiValue) || hi - lo <= 1n) return;
    const mid = (lo + hi) / 2n;
    const midValue = await at(mid);
    add(midValue);
    await bisect(lo, loValue, mid, midValue);
    await bisect(mid, midValue, hi, hiValue);
  }

  const [first, last] = await Promise.all([at(fromBlock), at(toBlock)]);
  add(first);
  add(last);
  await bisect(fromBlock, first, toBlock, last);
  return found;
}

function uniqueFactories(addresses: readonly Address[]) {
  return addresses.filter((a, i) => addresses.findIndex((b) => isAddressEqual(a, b)) === i);
}

/**
 * The factories to enumerate for an instance. A built-in hub whose current factory is pinned needs no further
 * reads. Otherwise the registry's history is bisected; if the RPCs serve no historical state, only the pinned and
 * current factories are used and `complete` is false.
 */
export async function resolveFactories(
  client: Pick<PublicClient, "readContract" | "getBlockNumber">,
  instance: HubInstance,
  current: Address,
): Promise<{ factories: Address[]; complete: boolean }> {
  const known = instance.knownFactories;
  if (known.some((f) => isAddressEqual(f, current))) return { factories: [...known], complete: true };
  try {
    const head = await client.getBlockNumber();
    const history = await factoryHistory(client, instance.hubCoreRegistry, instance.startBlock, head);
    return { factories: uniqueFactories([...known, ...history, current]), complete: true };
  } catch {
    return { factories: uniqueFactories([...known, current]), complete: false };
  }
}
