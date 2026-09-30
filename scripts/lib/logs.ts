import type { AbiEvent, Address, Log, PublicClient } from "viem";

/**
 * `eth_getLogs` over a large range for scripts: starts with big chunks and halves them whenever the RPC refuses
 * (range or result-size limits), so it works with both unconstrained and 10k-block RPCs.
 */
export async function getLogsChunked<const event extends AbiEvent>(
  client: PublicClient,
  params: { address: Address | Address[]; event: event; fromBlock: bigint; toBlock?: bigint },
): Promise<Log<bigint, number, false, event>[]> {
  const toBlock = params.toBlock ?? (await client.getBlockNumber());
  const out: Log<bigint, number, false, event>[] = [];
  let chunk = 5_000_000n;
  let from = params.fromBlock;

  while (from <= toBlock) {
    const to = from + chunk - 1n < toBlock ? from + chunk - 1n : toBlock;
    try {
      const logs = await client.getLogs({ address: params.address, event: params.event, fromBlock: from, toBlock: to });
      out.push(...(logs as Log<bigint, number, false, event>[]));
      from = to + 1n;
    } catch (error) {
      if (chunk <= 1_000n) throw error;
      chunk /= 2n;
    }
  }
  return out;
}
