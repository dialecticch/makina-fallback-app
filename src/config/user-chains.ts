import { defineChain } from "viem";

import { CANDIDATE_CHAINS, type ChainConfig } from "@/config/chains";
import type { StoredUserInstance, UserSettings } from "@/config/user-settings";

/** Canonical Multicall3, deployed at the same address on nearly every EVM chain. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** A chain the app does not ship, defined from a user-added instance (viem `defineChain`). */
export function customChainConfig(instance: StoredUserInstance): ChainConfig {
  const symbol = instance.nativeSymbol ?? "ETH";
  const chain = defineChain({
    id: instance.chainId,
    name: instance.name ?? `Chain ${instance.chainId}`,
    nativeCurrency: { name: symbol, symbol, decimals: 18 },
    rpcUrls: { default: { http: instance.rpcUrls } },
    blockExplorers: instance.explorerUrl ? { default: { name: "Explorer", url: instance.explorerUrl } } : undefined,
    contracts: { multicall3: { address: MULTICALL3 } },
  });
  return { chain, rpcs: [], blockTimeSeconds: 2 };
}

const isShipped = (chainId: number) => CANDIDATE_CHAINS.some((c) => c.chain.id === chainId);

/** Shipped candidate chains plus any chain only a user-added instance knows about. */
export function allChainConfigs(settings: Pick<UserSettings, "instances">): ChainConfig[] {
  const known = new Set(CANDIDATE_CHAINS.map((c) => c.chain.id));
  const custom: ChainConfig[] = [];
  for (const instance of settings.instances) {
    if (known.has(instance.chainId)) continue;
    known.add(instance.chainId);
    custom.push(customChainConfig(instance));
  }
  return [...CANDIDATE_CHAINS, ...custom];
}

/**
 * The user's RPCs per chain: Settings → RPC endpoints, plus the RPCs of user-added instances on chains the app does
 * not ship. On a shipped chain an instance never brings its own RPCs: they would silently serve every read on that
 * chain, including the built-in hub's.
 */
export function allUserRpcUrls(settings: Pick<UserSettings, "rpcUrls" | "instances">): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [chainId, urls] of Object.entries(settings.rpcUrls)) out[chainId] = [...urls];
  for (const instance of settings.instances) {
    if (isShipped(instance.chainId)) continue;
    const key = String(instance.chainId);
    out[key] = [...new Set([...(out[key] ?? []), ...instance.rpcUrls])];
  }
  return out;
}
