/**
 * Lists every Machine on each seed instance with the implementation IDs of its depositor, redeemer and fee
 * manager, as reported by the instance's HubPeripheryFactory, and checks them against IMPLEM_IDS in
 * src/config/constants.ts. Also checks that each Machine's periphery contracts point back at the configured
 * HubPeripheryRegistry. Exits non-zero if an ID is unknown or a registry does not match.
 *
 *   pnpm check-implem-ids
 */
import { type Address, getAbiItem, isAddressEqual, zeroAddress } from "viem";

import {
  directDepositorAbi,
  hubCoreFactoryAbi,
  hubCoreRegistryAbi,
  hubPeripheryFactoryAbi,
  hubPeripheryRegistryAbi,
  machineAbi,
  machineShareAbi,
} from "../src/abis/index.ts";
import { IMPLEM_IDS } from "../src/config/constants.ts";
import { BUILTIN_INSTANCES } from "../src/config/instances.ts";
import { scriptClient } from "./lib/clients.ts";
import { getLogsChunked } from "./lib/logs.ts";

type Role = keyof typeof IMPLEM_IDS;
let problems = 0;

function label(role: Role, id: number | undefined) {
  if (id === undefined) return "n/a";
  const known = (IMPLEM_IDS[role] as Record<number, string>)[id];
  if (!known) problems += 1;
  return known ? `${id} (${known})` : `${id} (UNKNOWN)`;
}

for (const instance of BUILTIN_INSTANCES) {
  const client = scriptClient(instance.chainId);
  console.log(`\n== ${instance.id} (chain ${instance.chainId})`);

  const currentFactory = await client.readContract({
    address: instance.hubCoreRegistry,
    abi: hubCoreRegistryAbi,
    functionName: "coreFactory",
  });
  const factoryChanges = await getLogsChunked(client, {
    address: instance.hubCoreRegistry,
    event: getAbiItem({ abi: hubCoreRegistryAbi, name: "CoreFactoryChanged" }),
    fromBlock: instance.startBlock,
  });
  const factories = [
    ...new Set([currentFactory, ...factoryChanges.map((log) => log.args.newCoreFactory!)].map((a) => a.toLowerCase())),
  ].filter((a) => a !== zeroAddress) as Address[];
  console.log(`core factories: ${factories.join(", ")} (current ${currentFactory})`);

  const peripheryFactory = await client.readContract({
    address: instance.hubPeripheryRegistry!,
    abi: hubPeripheryRegistryAbi,
    functionName: "peripheryFactory",
  });
  console.log(`periphery factory: ${peripheryFactory}`);

  const created = await getLogsChunked(client, {
    address: factories,
    event: getAbiItem({ abi: hubCoreFactoryAbi, name: "MachineCreated" }),
    fromBlock: instance.startBlock,
  });

  for (const log of created) {
    const machine = log.args.machine!;
    const shareToken = log.args.shareToken!;
    const [depositor, redeemer, feeManager, symbol] = await client.multicall({
      allowFailure: false,
      contracts: [
        { address: machine, abi: machineAbi, functionName: "depositor" },
        { address: machine, abi: machineAbi, functionName: "redeemer" },
        { address: machine, abi: machineAbi, functionName: "feeManager" },
        { address: shareToken, abi: machineShareAbi, functionName: "symbol" },
      ],
    });

    const ids = await client.multicall({
      allowFailure: true,
      contracts: [
        {
          address: peripheryFactory,
          abi: hubPeripheryFactoryAbi,
          functionName: "depositorImplemId",
          args: [depositor],
        },
        { address: peripheryFactory, abi: hubPeripheryFactoryAbi, functionName: "redeemerImplemId", args: [redeemer] },
        {
          address: peripheryFactory,
          abi: hubPeripheryFactoryAbi,
          functionName: "feeManagerImplemId",
          args: [feeManager],
        },
        { address: depositor, abi: directDepositorAbi, functionName: "peripheryRegistry" },
      ],
    });
    const id = (i: number, address: Address) =>
      address === zeroAddress || ids[i]!.status !== "success" ? undefined : Number(ids[i]!.result);

    const derivedRegistry = ids[3]!.status === "success" ? (ids[3]!.result as Address) : undefined;
    const registryNote =
      derivedRegistry === undefined
        ? "registry n/a"
        : isAddressEqual(derivedRegistry, instance.hubPeripheryRegistry!)
          ? "registry ok"
          : `REGISTRY MISMATCH ${derivedRegistry}`;
    if (derivedRegistry !== undefined && !isAddressEqual(derivedRegistry, instance.hubPeripheryRegistry!))
      problems += 1;

    console.log(
      `${symbol.padEnd(16)} ${machine}  depositor ${label("depositor", id(0, depositor))}` +
        `  redeemer ${label("redeemer", id(1, redeemer))}  feeManager ${label("feeManager", id(2, feeManager))}` +
        `  ${registryNote}` +
        (depositor === zeroAddress ? "  [no depositor]" : "") +
        (redeemer === zeroAddress ? "  [no redeemer]" : "") +
        (ids[0]!.status !== "success" && depositor !== zeroAddress
          ? `  [depositor ${depositor} not from factory]`
          : "") +
        (ids[1]!.status !== "success" && redeemer !== zeroAddress ? `  [redeemer ${redeemer} not from factory]` : ""),
    );
  }
}

if (problems > 0) {
  console.error(`\n${problems} problem(s): update IMPLEM_IDS or investigate the mismatches above.`);
  process.exit(1);
}
console.log("\nAll implementation IDs are known.");
