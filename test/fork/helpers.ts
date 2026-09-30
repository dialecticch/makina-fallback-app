import {
  type Abi,
  type Address,
  type Chain,
  createTestClient,
  defineChain,
  erc20Abi,
  http,
  publicActions,
  walletActions,
} from "viem";
import { base, mainnet } from "viem/chains";
import { inject } from "vitest";
import { createConfig, mock } from "wagmi";
import { connect } from "wagmi/actions";

import { hubCoreRegistryAbi, hubPeripheryRegistryAbi } from "@/abis";
import type { HubAnchor } from "@/actions/plans";
import type { HubInstance } from "@/config/instances";
import { fetchMachineData } from "@/data/fetch-machine-data";
import { enumerateMachines, resolveFactories } from "@/data/machines";

import { FORK, type ForkChainId } from "./config";

export const forkSkip = inject("forkSkip");
const urls = inject("forkUrls");

const CHAINS: Record<ForkChainId, Chain> = { 1: mainnet, 8453: base };

/** The fork's URL; a placeholder when the suite is skipped, so clients can still be created (and never used). */
export const forkUrl = (chainId: ForkChainId) => urls[String(chainId)] ?? `http://127.0.0.1:${FORK[chainId].port}`;

/** The chain definition pointed at the local fork, so wagmi's mock wallet also sends there. */
function forkChain(chainId: ForkChainId) {
  return defineChain({ ...CHAINS[chainId], rpcUrls: { default: { http: [forkUrl(chainId)] } } });
}

/** viem client with public, wallet and anvil test actions on the fork. */
export function forkClient(chainId: ForkChainId) {
  return createTestClient({ mode: "anvil", chain: forkChain(chainId), transport: http(forkUrl(chainId)) })
    .extend(publicActions)
    .extend(walletActions);
}

export type ForkClient = ReturnType<typeof forkClient>;

/**
 * A wagmi config like the app's, on the fork, with the mock connector acting as `account` (anvil auto-impersonates).
 * Actions run through the same `executePlan` as the UI.
 */
export async function walletConfig(chainId: ForkChainId, account: Address) {
  const chain = forkChain(chainId);
  const config = createConfig({
    chains: [chain],
    transports: { [chain.id]: http(forkUrl(chainId)) },
    connectors: [mock({ accounts: [account] })],
  });
  await connect(config, { connector: config.connectors[0]!, chainId: chain.id });
  return config;
}

export async function withSnapshot(client: ForkClient) {
  const id = await client.snapshot();
  return () => client.revert({ id });
}

/** Sends a transaction from any address (anvil `--auto-impersonate`), funding it with gas first. */
export async function sendAs(
  client: ForkClient,
  from: Address,
  tx: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] },
) {
  await client.setBalance({ address: from, value: 10n ** 20n });
  const hash = await client.writeContract({ ...tx, account: from, chain: client.chain } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${tx.functionName} from ${from} reverted`);
  return receipt;
}

export async function erc20Balance(client: ForkClient, token: Address, owner: Address) {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

/**
 * The explorer pipeline, headless: the same functions the instance scanner runs (factories, Machines from the
 * factory nonces, the two rounds of multicalls), on the fork.
 */
export async function scanInstance(client: ForkClient, instance: HubInstance) {
  const coreFactory = await client.readContract({
    address: instance.hubCoreRegistry,
    abi: hubCoreRegistryAbi,
    functionName: "coreFactory",
  });
  const peripheryFactory = instance.hubPeripheryRegistry
    ? await client.readContract({
        address: instance.hubPeripheryRegistry,
        abi: hubPeripheryRegistryAbi,
        functionName: "peripheryFactory",
      })
    : undefined;
  const { factories } = await resolveFactories(client, instance, coreFactory);
  const machines = await enumerateMachines(client, factories);
  const machineData = await fetchMachineData(client as never, {
    chainId: instance.chainId,
    instanceId: instance.id,
    verifiedHub: instance.source === "builtin",
    machines,
    peripheryFactory,
  });
  return { coreFactory, peripheryFactory, factories, machines, machineData };
}

/** What a plan needs to verify its targets, as the UI builds it from the instance (use-action-context.ts). */
export function hubAnchor(instance: HubInstance): HubAnchor {
  return {
    hubCoreRegistry: instance.hubCoreRegistry,
    hubPeripheryRegistry: instance.hubPeripheryRegistry,
    trustedFactories: instance.knownFactories,
  };
}
