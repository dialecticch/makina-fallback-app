/**
 * Computes `startBlock` for each seed instance in src/config/instances.ts: the block its HubCoreRegistry was
 * deployed at (binary search on eth_getCode). Prints the values and exits non-zero if any committed value differs.
 *
 *   pnpm find-start-blocks
 */
import { BUILTIN_INSTANCES } from "../src/config/instances.ts";
import { findDeploymentBlock } from "../src/lib/start-block.ts";
import { scriptClient } from "./lib/clients.ts";

let mismatch = false;

for (const instance of BUILTIN_INSTANCES) {
  const client = scriptClient(instance.chainId);
  const startBlock = await findDeploymentBlock(client, instance.hubCoreRegistry);
  const matches = startBlock === instance.startBlock;
  if (!matches) mismatch = true;

  console.log(
    `${instance.id.padEnd(14)} chain ${String(instance.chainId).padEnd(5)} registry ${instance.hubCoreRegistry}` +
      `  startBlock ${startBlock}n${matches ? "" : `  (committed: ${instance.startBlock}n)`}`,
  );
}

if (mismatch) {
  console.error("\nUpdate startBlock in src/config/instances.ts with the values above.");
  process.exit(1);
}
