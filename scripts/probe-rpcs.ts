/**
 * Measures, for every public RPC in src/config/chains.ts, the largest `eth_getLogs` block range it accepts from a
 * hub's start block (i.e. with historical data). Use the output to set `maxLogBlocks` in chains.ts.
 *
 *   node scripts/probe-rpcs.ts [chainId]
 */
import { CANDIDATE_CHAINS } from "../src/config/chains.ts";
import { BUILTIN_INSTANCES } from "../src/config/instances.ts";

const SIZES = [1_000_000n, 9_999n, 5_000n, 2_000n, 1_000n];
const only = process.argv[2] ? Number(process.argv[2]) : undefined;

async function rpc(url: string, method: string, params: unknown[]) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message ?? "error");
  return body.result;
}

for (const config of CANDIDATE_CHAINS) {
  if (only !== undefined && config.chain.id !== only) continue;
  const instance = BUILTIN_INSTANCES.find((i) => i.chainId === config.chain.id);
  console.log(`\n== ${config.chain.name} (${config.chain.id})`);

  for (const { url } of config.rpcs) {
    let latest: bigint;
    try {
      latest = BigInt((await rpc(url, "eth_blockNumber", [])) as string);
    } catch (e) {
      console.log(`${url.padEnd(44)} unreachable: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    // Probe historical logs from the hub start block where there is one, otherwise ~1M blocks back.
    const from = instance?.startBlock ?? latest - 1_000_000n;
    let accepted: string = "none";
    let lastError = "";
    for (const size of SIZES) {
      const to = from + size - 1n < latest ? from + size - 1n : latest;
      try {
        await rpc(url, "eth_getLogs", [
          {
            address: "0x0000000000000000000000000000000000000001",
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
          },
        ]);
        accepted = size === SIZES[0] ? "unconstrained" : size.toString();
        break;
      } catch (e) {
        lastError = (e as Error).message;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(
      `${url.padEnd(44)} max getLogs range: ${accepted}${accepted === "none" ? ` (${lastError.slice(0, 90)})` : ""}`,
    );
  }
}
