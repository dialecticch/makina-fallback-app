import type { Chain, HttpTransportConfig } from "viem";
import { createConfig, fallback, http, injected, type Transport, unstable_connector } from "wagmi";

import type { ChainConfig, RpcEndpoint } from "@/config/chains";
import { allChainConfigs, allUserRpcUrls } from "@/config/user-chains";
import { envRpcUrls, readUserSettings } from "@/config/user-settings";
import type { ScanEndpoint } from "@/lib/log-scanner";

const httpConfig: HttpTransportConfig = {
  retryDelay: 0,
  timeout: 30_000,
};

/**
 * RPCs in order, then the injected wallet's provider as a last resort. The wallet transport refuses any request
 * while the wallet is on a different chain, so it can never serve another chain's state.
 */
function createFallbackTransport(rpcs: RpcEndpoint[]) {
  return fallback(
    [
      ...rpcs.map(({ url, batch }) => http(url, { ...httpConfig, batch })),
      unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 0 }),
    ],
    { retryCount: 4, retryDelay: 250 },
  );
}

/** User RPCs (Settings, then `.env.local`) go ahead of the public list; duplicates are dropped. */
export function rpcsFor(config: ChainConfig, userRpcUrls: Record<string, string[]>): RpcEndpoint[] {
  const userUrls = [...(userRpcUrls[String(config.chain.id)] ?? []), ...envRpcUrls(config.chain.id)];
  const seen = new Set<string>();
  const out: RpcEndpoint[] = [];
  for (const rpc of [...userUrls.map((url) => ({ url, batch: false as const })), ...config.rpcs]) {
    if (seen.has(rpc.url)) continue;
    seen.add(rpc.url);
    out.push(rpc);
  }
  return out;
}

/** The RPCs a log scan uses on `chainId`, with their `eth_getLogs` range limits. Never the wallet. */
export function scanEndpoints(chainId: number): ScanEndpoint[] {
  const settings = readUserSettings();
  const config = allChainConfigs(settings).find((c) => c.chain.id === chainId);
  if (!config) return [];
  return rpcsFor(config, allUserRpcUrls(settings)).map((r) => ({ url: r.url, maxBlocks: r.maxLogBlocks }));
}

/** Hosts of the user's own RPCs for a chain (Settings and build-time), for the "custom RPC" indicator. */
export function customRpcHosts(chainId: number): string[] {
  const settings = readUserSettings();
  const urls = [...(allUserRpcUrls(settings)[String(chainId)] ?? []), ...envRpcUrls(chainId)];
  return [...new Set(urls.map((u) => new URL(u).host))];
}

/**
 * Built once at startup from the shipped chains and the user's settings (their RPCs and any chain a user-added
 * instance needs). Settings changes that affect transports apply on reload.
 */
export function createAppConfig(chainConfigs: readonly ChainConfig[] = allChainConfigs(readUserSettings())) {
  const rpcUrls = allUserRpcUrls(readUserSettings());
  const chains = chainConfigs.map((c) => c.chain) as [Chain, ...Chain[]];
  const transports: Record<number, Transport> = {};
  for (const c of chainConfigs) {
    transports[c.chain.id] = createFallbackTransport(rpcsFor(c, rpcUrls));
  }

  return createConfig({
    chains,
    transports,
    connectors: [injected({ shimDisconnect: true })],
    batch: {
      multicall: {
        batchSize: 16383, // (2^14 - 1) works across all RPCs tested
        wait: 100,
      },
    },
    cacheTime: 250,
    pollingInterval: 4000,
    // No CCIP-Read (EIP-3668): it lets any contract the app calls make the browser fetch URLs of its choosing.
    ccipRead: false,
  });
}
