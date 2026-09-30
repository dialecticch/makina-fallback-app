import { type Address, createPublicClient, custom, isAddressEqual, type PublicClient } from "viem";
import type { Config } from "wagmi";
import { getConnectorClient } from "wagmi/actions";

import {
  asyncRedeemerFeeAbi,
  directDepositorAbi,
  hubCoreFactoryAbi,
  hubCoreRegistryAbi,
  hubPeripheryFactoryAbi,
  hubPeripheryRegistryAbi,
  machineAbi,
  machineShareAbi,
} from "@/abis";
import { call, multicallLoose } from "@/lib/calls";

/**
 * Every address a transaction depends on, as the app's RPC reported it. Before anything is signed they are
 * re-read through the wallet's own provider (a second, independent view of the chain) and must match.
 *
 * Why: the app reads everything through public RPCs. A malicious or compromised RPC could report an attacker's
 * contract as a Machine's depositor, and the user would approve their tokens to it. Checking the same facts
 * through the wallet's RPC, starting from the hub's registry, closes that: an attacker would need to control both.
 */
export type PlanTargets = {
  kind: "deposit" | "redeem" | "claim";
  machine: Address;
  /** The factory that created the Machine. */
  factory: Address;
  hubCoreRegistry: Address;
  hubPeripheryRegistry?: Address;
  /** Factories accepted without asking the registry: the ones pinned in this release (or resolved for the hub). */
  trustedFactories: readonly Address[];
  shareToken: Address;
  depositor?: Address;
  accountingToken?: Address;
  redeemer?: Address;
};

export class TargetMismatch extends Error {}

/** A read-only client on the connected wallet's provider for `chainId` (the wallet must be on that chain). */
export async function walletReader(config: Config, chainId: number): Promise<PublicClient> {
  const wallet = await getConnectorClient(config, { chainId });
  return createPublicClient({
    chain: wallet.chain,
    transport: custom({ request: wallet.request }),
    ccipRead: false,
  }) as PublicClient;
}

const same = (a: unknown, b: Address | undefined) =>
  typeof a === "string" && b !== undefined && isAddressEqual(a as Address, b);

export async function verifyTargets(reader: Pick<PublicClient, "multicall">, t: PlanTargets): Promise<void> {
  const deposit = t.kind === "deposit";
  if (deposit && (!t.depositor || !t.accountingToken)) throw new TargetMismatch("This Machine has no depositor.");
  if (!deposit && !t.redeemer) throw new TargetMismatch("This Machine has no redeemer.");

  const [coreFactory, isMachine, shareToken, minter, target, token, backLink, peripheryFactory] = await multicallLoose(
    reader,
    [
      call(t.hubCoreRegistry, hubCoreRegistryAbi, "coreFactory"),
      call(t.factory, hubCoreFactoryAbi, "isMachine", [t.machine]),
      call(t.machine, machineAbi, "shareToken"),
      call(t.shareToken, machineShareAbi, "minter"),
      deposit ? call(t.machine, machineAbi, "depositor") : call(t.machine, machineAbi, "redeemer"),
      call(t.machine, machineAbi, "accountingToken"),
      deposit ? call(t.depositor!, directDepositorAbi, "machine") : call(t.redeemer!, asyncRedeemerFeeAbi, "machine"),
      ...(t.hubPeripheryRegistry ? [call(t.hubPeripheryRegistry, hubPeripheryRegistryAbi, "peripheryFactory")] : []),
    ],
  );

  const fail = (what: string) => {
    throw new TargetMismatch(
      `Your wallet's RPC does not confirm ${what}. Nothing was sent: the app's RPC may be reporting wrong data. ` +
        "Try again, or use a different RPC in Settings.",
    );
  };
  const factoryTrusted = t.trustedFactories.some((f) => isAddressEqual(f, t.factory)) || same(coreFactory, t.factory);
  if (!factoryTrusted) fail("the factory that created this Machine");
  if (isMachine !== true) fail("that this contract is a Machine of this hub");
  if (!same(shareToken, t.shareToken)) fail("the Machine's share token");
  if (!same(minter, t.machine)) fail("that the share token belongs to this Machine");
  if (deposit) {
    if (!same(target, t.depositor)) fail("the Machine's depositor");
    if (!same(token, t.accountingToken)) fail("the Machine's accounting token");
    if (!same(backLink, t.machine)) fail("that the depositor belongs to this Machine");
  } else {
    if (!same(target, t.redeemer)) fail("the Machine's redeemer");
    if (!same(backLink, t.machine)) fail("that the redeemer belongs to this Machine");
  }

  if (t.hubPeripheryRegistry) {
    if (typeof peripheryFactory !== "string") fail("the hub's periphery factory");
    const [created] = await multicallLoose(reader, [
      deposit
        ? call(peripheryFactory as Address, hubPeripheryFactoryAbi, "isDepositor", [t.depositor!])
        : call(peripheryFactory as Address, hubPeripheryFactoryAbi, "isRedeemer", [t.redeemer!]),
    ]);
    if (created !== true)
      fail(`that the ${deposit ? "depositor" : "redeemer"} was created by Makina's periphery factory`);
  }
}
