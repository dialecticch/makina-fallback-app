/**
 * Checks the assumption behind Machine discovery (src/data/machines.ts) for every built-in hub, and prints the
 * values to pin in src/config/instances.ts:
 *
 * - every factory the registry ever pointed at (bisecting historical `coreFactory()`; needs an archive RPC);
 * - each factory's EIP-1967 implementation;
 * - the Machines found from the factory nonces equal the Machines announced by `MachineCreated` logs.
 *
 * Exits non-zero on any mismatch.
 *
 *   pnpm check-factories        (reads FORK_RPC_URL_<chainId> from .env.local when present)
 */
import { getAbiItem, isAddressEqual } from "viem";

import { hubCoreFactoryAbi, hubCoreRegistryAbi } from "../src/abis/index.ts";
import { BUILTIN_INSTANCES, pinnedImplementation } from "../src/config/instances.ts";
import { enumerateMachines, factoryHistory, readImplementation } from "../src/data/machines.ts";
import { scriptClient } from "./lib/clients.ts";
import { getLogsChunked } from "./lib/logs.ts";

let failed = false;
const fail = (message: string) => {
  failed = true;
  console.error(`  ✗ ${message}`);
};

for (const instance of BUILTIN_INSTANCES) {
  const client = scriptClient(instance.chainId);
  const head = await client.getBlockNumber();
  console.log(`${instance.id} (chain ${instance.chainId}), head ${head}`);

  const current = await client.readContract({
    address: instance.hubCoreRegistry,
    abi: hubCoreRegistryAbi,
    functionName: "coreFactory",
  });
  const factories = await factoryHistory(client, instance.hubCoreRegistry, instance.startBlock, head);
  if (!factories.some((f) => isAddressEqual(f, current))) factories.push(current);

  const implementations = Object.fromEntries(
    await Promise.all(factories.map(async (f) => [f, await readImplementation(client, f)] as const)),
  );
  const fromNonces = await enumerateMachines(client, factories);

  const logs = await getLogsChunked(client, {
    address: factories,
    event: getAbiItem({ abi: hubCoreFactoryAbi, name: "MachineCreated" }),
    fromBlock: instance.startBlock,
    toBlock: head,
  });
  const fromLogs = logs.map((l) => l.args.machine!);

  for (const m of fromLogs) {
    if (!fromNonces.some((r) => isAddressEqual(r.machine, m)))
      fail(`${m} is in MachineCreated logs but not found from nonces`);
  }
  for (const r of fromNonces) {
    if (!fromLogs.some((m) => isAddressEqual(m, r.machine))) fail(`${r.machine} found from nonces but not in logs`);
  }
  for (const f of instance.knownFactories) {
    if (!factories.some((x) => isAddressEqual(x, f))) fail(`pinned factory ${f} is not in the registry's history`);
  }
  for (const f of factories) {
    const pinned = pinnedImplementation(instance, f);
    if (pinned === undefined) fail(`factory ${f} is not pinned in knownFactories/factoryImplementations`);
    else if (!implementations[f] || !isAddressEqual(pinned, implementations[f]!)) {
      fail(`factory ${f} implementation is ${implementations[f]}, pinned ${pinned}`);
    }
  }

  console.log(`  ${fromNonces.length} Machines from nonces, ${fromLogs.length} from logs`);
  console.log(`  knownFactories: [${factories.map((f) => `"${f}"`).join(", ")}],`);
  console.log(
    `  factoryImplementations: { ${factories.map((f) => `"${f}": "${implementations[f] ?? "none"}"`).join(", ")} },`,
  );
}

if (failed) {
  console.error("\nMachine discovery would be wrong or the pins are outdated: see above.");
  process.exit(1);
}
