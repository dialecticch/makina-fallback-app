import type { Address, PublicClient } from "viem";

/**
 * First block at which `address` has code, by binary search on `eth_getCode` (about log2(latest) ≈ 25 calls).
 * Needs an RPC that serves historical state. Used by scripts/find-start-blocks.ts for the seed instances, and at
 * runtime for discovered and user-added instances.
 *
 * Kept free of `@/` imports so Node scripts can import it directly.
 */
export async function findDeploymentBlock(
  client: Pick<PublicClient, "getBlockNumber" | "getCode">,
  address: Address,
  { low = 0n, high }: { low?: bigint; high?: bigint } = {},
): Promise<bigint> {
  const latest = high ?? (await client.getBlockNumber());
  const hasCode = async (blockNumber: bigint) => {
    const code = await client.getCode({ address, blockNumber });
    return code !== undefined && code !== "0x";
  };

  if (!(await hasCode(latest))) throw new Error(`${address} has no code at block ${latest}`);

  let lo = low;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (await hasCode(mid)) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}
