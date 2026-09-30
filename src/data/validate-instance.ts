import { type Address, createPublicClient, fallback, getAddress, http, isAddress } from "viem";

import { getChainConfig } from "@/config/chains";
import type { StoredUserInstance } from "@/config/user-settings";
import { classifyRegistry } from "@/data/discovery";
import { findDeploymentBlock } from "@/lib/start-block";

export type ValidationStep = "connecting" | "checking registry" | "finding start block";

/**
 * Validates a hand-added instance: the RPCs must answer with the right chain ID, and the address must behave like
 * a HubCoreRegistry (shape only: the hub stays unverified). Also finds the registry's deployment block, which needs
 * an RPC with historical state.
 *
 * RPCs are only accepted for chains the app does not ship. On a shipped chain they would serve every read on that
 * chain, the built-in hub's included; the user adds those under "RPC endpoints", where they are visible.
 */
export async function validateUserInstance(
  input: {
    chainId: number;
    name?: string;
    rpcUrls: string[];
    registry: string;
    explorerUrl?: string;
    nativeSymbol?: string;
  },
  onStep?: (step: ValidationStep) => void,
): Promise<StoredUserInstance> {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) throw new Error("Enter a valid chain ID.");
  if (!isAddress(input.registry, { strict: false })) throw new Error("Enter a valid registry address.");
  const registry = getAddress(input.registry) as Address;

  const shippedChain = getChainConfig(input.chainId);
  if (shippedChain && input.rpcUrls.length > 0) {
    throw new Error(`${shippedChain.chain.name} is built in: add RPCs under "RPC endpoints" instead.`);
  }
  if (input.explorerUrl && !/^https:\/\/[^\s]+$/.test(input.explorerUrl)) {
    throw new Error("The explorer URL must start with https://.");
  }
  const urls = shippedChain ? shippedChain.rpcs.filter((r) => r.maxLogBlocks !== 0).map((r) => r.url) : input.rpcUrls;
  if (urls.length === 0) throw new Error("This chain is not built in: add at least one RPC URL.");

  const client = createPublicClient({
    transport: fallback(urls.map((url) => http(url, { timeout: 20_000 }))),
    ccipRead: false,
  });

  onStep?.("connecting");
  const chainId = await client.getChainId();
  if (chainId !== input.chainId) {
    throw new Error(`The RPC reports chain ID ${chainId}, not ${input.chainId}.`);
  }

  onStep?.("checking registry");
  const kind = await classifyRegistry(client, registry);
  if (kind.kind === "none") throw new Error("There is no contract at this address on this chain.");
  if (kind.kind === "spoke") throw new Error("This is a spoke registry, not a hub: it hosts no Machines.");

  onStep?.("finding start block");
  let startBlock: bigint;
  try {
    startBlock = await findDeploymentBlock(client, registry);
  } catch {
    throw new Error("Could not find the registry's deployment block. Use an RPC that serves historical state.");
  }

  return {
    chainId: input.chainId,
    name: shippedChain ? undefined : input.name?.trim() || undefined,
    rpcUrls: shippedChain ? [] : input.rpcUrls,
    explorerUrl: shippedChain ? undefined : input.explorerUrl?.trim() || undefined,
    nativeSymbol: shippedChain ? undefined : input.nativeSymbol?.trim() || undefined,
    hubCoreRegistry: registry,
    startBlock: startBlock.toString(),
  };
}
