import type { Address, PublicClient } from "viem";

import { hubCoreRegistryAbi } from "@/abis";
import { isContractRevert } from "@/lib/errors";

export type RegistryKind =
  { kind: "none" } | { kind: "spoke" } | { kind: "hub"; coreFactory: Address; machineBeacon: Address };

/**
 * Is there a HubCoreRegistry at `address` on this chain? This checks the contract's shape only, not that Makina
 * deployed it: hubs found or added this way stay unverified (read-only until unlocked).
 * - no code: nothing there;
 * - `machineBeacon()` reverts: a SpokeCoreRegistry (the Ethereum instance's registry address is one on Base);
 * - `coreFactory()` returns a contract: a hub.
 * RPC errors (rate limits, timeouts) are thrown, never taken for an answer.
 */
export async function classifyRegistry(
  client: Pick<PublicClient, "getCode" | "readContract">,
  address: Address,
): Promise<RegistryKind> {
  const code = await client.getCode({ address });
  if (code === undefined || code === "0x") return { kind: "none" };

  let machineBeacon: Address;
  try {
    machineBeacon = await client.readContract({ address, abi: hubCoreRegistryAbi, functionName: "machineBeacon" });
  } catch (error) {
    if (isContractRevert(error)) return { kind: "spoke" };
    throw error;
  }

  const coreFactory = await client.readContract({ address, abi: hubCoreRegistryAbi, functionName: "coreFactory" });
  const factoryCode = await client.getCode({ address: coreFactory });
  if (factoryCode === undefined || factoryCode === "0x") return { kind: "spoke" };
  return { kind: "hub", coreFactory, machineBeacon };
}
