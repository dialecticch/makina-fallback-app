import { createPublicClient, fallback, http } from "viem";

import { getChainConfig } from "../../src/config/chains.ts";

/**
 * A viem client for scripts: `FORK_RPC_URL_<chainId>` from `.env.local` (if set) first, then the app's public
 * RPC list. Archive reads (historical `eth_getCode`) need an RPC that serves historical state.
 */
export function scriptClient(chainId: number) {
  const config = getChainConfig(chainId);
  if (!config) throw new Error(`Chain ${chainId} is not in src/config/chains.ts`);

  const urls = [process.env[`FORK_RPC_URL_${chainId}`], ...config.rpcs.map((r) => r.url)].filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );

  return createPublicClient({
    chain: config.chain,
    transport: fallback(urls.map((url) => http(url, { timeout: 30_000, retryCount: 2 }))),
  });
}
