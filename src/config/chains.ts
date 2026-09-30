import { type Address, type Chain, parseEther } from "viem";
import { arbitrum, base, ink, mainnet, monad, optimism } from "viem/chains";

export type RpcEndpoint = {
  url: string;
  /** JSON-RPC batching. Only enable where the endpoint is known to accept batches. */
  batch?: false | { batchSize: number };
  /**
   * Largest historical `eth_getLogs` block range the endpoint accepts, as measured by `node scripts/probe-rpcs.ts`.
   * `0` keeps the endpoint for point reads only. Unset means "unconstrained or unknown": the log scanner then
   * starts at 10,000 blocks and adapts.
   */
  maxLogBlocks?: number;
};

/** A Makina hub shipped with the app. Values come from maintainer scripts, never guesses (see CONTRIBUTING.md). */
export type BuiltinHub = {
  hubCoreRegistry: Address;
  hubPeripheryRegistry: Address;
  /** Block the registry was deployed at (`pnpm find-start-blocks`). Activity scans start here. */
  startBlock: bigint;
  /**
   * Every factory the registry has pointed at, and each one's EIP-1967 implementation, as of the last
   * `pnpm check-factories`. Machine discovery relies on these implementations deploying Machines with CREATE; the
   * app warns when a factory's implementation no longer matches.
   */
  knownFactories: readonly Address[];
  factoryImplementations: Readonly<Record<Address, Address>>;
};

export type ChainConfig = {
  chain: Chain;
  /** Public RPCs, tried in order after any user-provided RPC. */
  rpcs: RpcEndpoint[];
  /** Rough average block time, used to size the unconfirmed tail of cached log scans. */
  blockTimeSeconds: number;
  /** The Wrap ETH helper, where the native token is ETH: WETH and the native balance "Max" keeps for gas. */
  wrap?: { weth: Address; gasReserve: bigint };
  /** The Makina hub on this chain, if any. Chains without one are still probed by discovery. */
  hub?: BuiltinHub;
};

/**
 * Every chain where Makina's shared infrastructure exists: the one table to edit to add a chain, an RPC or a
 * built-in hub (plus an icon at src/assets/chains/<chainId>.svg). Runtime discovery probes each chain for hubs, so
 * a chain listed here without `hub` still shows any hub deployed on it (read-only until unlocked).
 *
 * `maxLogBlocks` values were measured on 2026-09-30. Free tiers change often: re-run `scripts/probe-rpcs.ts`
 * when scans get slow. drpc's free tier currently refuses historical `eth_getLogs` entirely. publicnode is left out:
 * it refuses historical state and its error responses carry no CORS headers, so browsers cannot read them.
 */
export const CANDIDATE_CHAINS: readonly ChainConfig[] = [
  {
    chain: mainnet,
    rpcs: [
      { url: "https://mainnet.gateway.tenderly.co", batch: { batchSize: 10 } },
      { url: "https://rpc.mevblocker.io", batch: { batchSize: 10 }, maxLogBlocks: 9_999 },
      { url: "https://eth.drpc.org", batch: false, maxLogBlocks: 0 },
      { url: "https://eth-pokt.nodies.app", batch: false, maxLogBlocks: 0 },
      { url: "https://eth.merkle.io", batch: false },
    ],
    blockTimeSeconds: 12,
    wrap: { weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", gasReserve: parseEther("0.005") },
    hub: {
      hubCoreRegistry: "0x0FAEeCEab0BCb63bE2Fe984Ea8c77778989d53eA",
      hubPeripheryRegistry: "0xc0109106a2E119087a5739c9532ec7e1B039EE05",
      startBlock: 23426662n,
      // pnpm check-factories, 2026-09-30 (block 26,090,155): 13 Machines from nonces = 13 from MachineCreated logs.
      knownFactories: ["0x8d28A69328561eF9F171c58996fEcB9F494e070c"],
      factoryImplementations: {
        "0x8d28A69328561eF9F171c58996fEcB9F494e070c": "0x6E969Ba0941ACD84d56B297864f6677d15ea6e29",
      },
    },
  },
  {
    chain: base,
    rpcs: [
      { url: "https://mainnet.base.org", batch: { batchSize: 10 }, maxLogBlocks: 2_000 },
      { url: "https://developer-access-mainnet.base.org", batch: false, maxLogBlocks: 2_000 },
      { url: "https://base.gateway.tenderly.co", batch: { batchSize: 10 }, maxLogBlocks: 1_000 },
      { url: "https://base.drpc.org", batch: false, maxLogBlocks: 0 },
    ],
    blockTimeSeconds: 2,
    wrap: { weth: "0x4200000000000000000000000000000000000006", gasReserve: parseEther("0.0005") },
    hub: {
      hubCoreRegistry: "0xCFd878e9A9E17D79f04B4176E624e82fFF78b2cf",
      hubPeripheryRegistry: "0x9208c2BB7Cf1AC29B1E338c3d59C2b357318AAD3",
      startBlock: 50439192n,
      // pnpm check-factories, 2026-09-30 (block 51,990,137): 9 Machines from nonces = 9 from MachineCreated logs.
      knownFactories: ["0x1E1fa6F5f258b744881634216bDBc612B09C3C30"],
      factoryImplementations: {
        "0x1E1fa6F5f258b744881634216bDBc612B09C3C30": "0x6F51da4074EfD2A9ceB945B8fa24DF9045dB14BA",
      },
    },
  },
  {
    chain: arbitrum,
    rpcs: [
      { url: "https://arbitrum.gateway.tenderly.co", batch: { batchSize: 10 } },
      { url: "https://arb1.arbitrum.io/rpc", batch: false },
      { url: "https://arbitrum.drpc.org", batch: false, maxLogBlocks: 0 },
    ],
    blockTimeSeconds: 0.25,
    wrap: { weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", gasReserve: parseEther("0.0005") },
  },
  {
    chain: optimism,
    rpcs: [
      { url: "https://optimism.gateway.tenderly.co", batch: { batchSize: 10 } },
      { url: "https://mainnet.optimism.io", batch: false },
      { url: "https://optimism.drpc.org", batch: false, maxLogBlocks: 0 },
    ],
    blockTimeSeconds: 2,
    wrap: { weth: "0x4200000000000000000000000000000000000006", gasReserve: parseEther("0.0005") },
  },
  {
    chain: ink,
    rpcs: [
      { url: "https://rpc-qnd.inkonchain.com", batch: false, maxLogBlocks: 9_999 },
      { url: "https://rpc-gel.inkonchain.com", batch: false, maxLogBlocks: 1_000 },
      { url: "https://ink.drpc.org", batch: false, maxLogBlocks: 0 },
    ],
    blockTimeSeconds: 1,
    wrap: { weth: "0x4200000000000000000000000000000000000006", gasReserve: parseEther("0.0005") },
  },
  {
    chain: monad,
    rpcs: [
      { url: "https://rpc1.monad.xyz", batch: false },
      { url: "https://rpc3.monad.xyz", batch: false, maxLogBlocks: 1_000 },
      { url: "https://rpc.monad.xyz", batch: false, maxLogBlocks: 100 },
      { url: "https://monad-mainnet.drpc.org", batch: false, maxLogBlocks: 0 },
    ],
    blockTimeSeconds: 0.4,
  },
];

export function getChainConfig(chainId: number) {
  return CANDIDATE_CHAINS.find((c) => c.chain.id === chainId);
}

export function explorerUrl(chain: Chain | undefined, kind: "address" | "tx", value: string) {
  const root = chain?.blockExplorers?.default.url;
  return root ? `${root.replace(/\/$/, "")}/${kind}/${value}` : undefined;
}
