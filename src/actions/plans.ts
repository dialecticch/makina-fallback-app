import { type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName, parseAbi } from "viem";

import { asyncRedeemerFeeAbi, directDepositorAbi } from "@/abis";
import type { PlanTargets } from "@/actions/verify";
import { NO_REFERRAL } from "@/config/constants";
import type { MachineData } from "@/data/types";
import { applySlippage, lessRedeemFee } from "@/lib/derive";

/** A transaction the flow will simulate, send and wait for. Build it with `tx()`. */
export type TxRequest = {
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/** A transaction, type-checked against its ABI: a renamed function or wrong arguments fail to compile. */
export function tx<const abi extends Abi, const fn extends ContractFunctionName<abi, "nonpayable" | "payable">>(
  label: string,
  address: Address,
  abi: abi,
  functionName: fn,
  args?: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>,
  value?: bigint,
): TxRequest {
  return { label, address, abi: abi as Abi, functionName, args: args as readonly unknown[] | undefined, value };
}

/** An exact-amount ERC20 approval the flow adds only when the live allowance is lower. */
export type ApprovalNeed = { token: Address; spender: Address; amount: bigint; symbol?: string };

export type Plan = {
  approval?: ApprovalNeed;
  steps: TxRequest[];
  /** Checked through the wallet's own RPC before anything is signed (verify.ts). */
  targets?: PlanTargets[];
};

/**
 * A plan's approval on its own, for forms that make it a separate click before the action. Its targets are still
 * verified, so the spender is checked through the wallet's RPC before anything is approved.
 */
export function approvalOnly(plan: Plan): Plan {
  return { approval: plan.approval, steps: [], targets: plan.targets };
}

/** The hub a Machine belongs to, as needed to verify a plan's targets. */
export type HubAnchor = Pick<PlanTargets, "hubCoreRegistry" | "hubPeripheryRegistry" | "trustedFactories">;

/** WETH9 is not a Makina contract, so its one payable function is declared here rather than vendored. */
export const WETH_ABI = parseAbi(["function deposit() payable"]);

function targets(kind: PlanTargets["kind"], machine: MachineData, hub: HubAnchor): PlanTargets {
  return {
    kind,
    machine: machine.machine,
    factory: machine.factory,
    shareToken: machine.shareToken,
    depositor: machine.depositor,
    accountingToken: machine.accountingToken,
    redeemer: machine.redeemer,
    ...hub,
  };
}

/**
 * Deposit through the DirectDepositor: approve the accounting token to the depositor (exact amount), then
 * `deposit(assets, receiver = account, minShares, referralKey = 0)` with `minShares = shares × (1 − slippage)`.
 */
export function depositPlan(args: {
  machine: MachineData;
  hub: HubAnchor;
  account: Address;
  assets: bigint;
  /** `convertToShares(assets)` at preview time. */
  shares: bigint;
  slippageBps: number;
  symbol?: string;
}): Plan & { minShares: bigint } {
  const { machine, account, assets, shares, slippageBps } = args;
  if (!machine.depositor || !machine.accountingToken) throw new Error("This Machine has no depositor");
  const minShares = applySlippage(shares, slippageBps);
  return {
    minShares,
    approval: { token: machine.accountingToken, spender: machine.depositor, amount: assets, symbol: args.symbol },
    steps: [tx("Deposit", machine.depositor, directDepositorAbi, "deposit", [assets, account, minShares, NO_REFERRAL])],
    targets: [targets("deposit", machine, args.hub)],
  };
}

/**
 * Request a redemption: approve shares to the redeemer (exact amount), then
 * `requestRedeem(shares, receiver = account, minAssets)` with `minAssets = estimate × (1 − slippage)` and
 * `estimate = convertToAssets(shares)` less the redeem fee on AsyncRedeemerFee. `minAssets` only protects the
 * request itself: at finalization the redeemer pays the lower of the recorded and the then-current value.
 */
export function requestRedeemPlan(args: {
  machine: MachineData;
  hub: HubAnchor;
  account: Address;
  shares: bigint;
  /** `convertToAssets(shares)` at preview time. */
  grossAssets: bigint;
  /** The redeem fee rate, only for AsyncRedeemerFee. */
  redeemFeeRate: bigint | undefined;
  slippageBps: number;
  symbol?: string;
}): Plan & { estimate: bigint; minAssets: bigint } {
  const { machine, account, shares, slippageBps } = args;
  if (!machine.redeemer) throw new Error("This Machine has no redeemer");
  const estimate = lessRedeemFee(args.grossAssets, args.redeemFeeRate);
  const minAssets = applySlippage(estimate, slippageBps);
  return {
    estimate,
    minAssets,
    approval: { token: machine.shareToken, spender: machine.redeemer, amount: shares, symbol: args.symbol },
    steps: [
      tx("Request redemption", machine.redeemer, asyncRedeemerFeeAbi, "requestRedeem", [shares, account, minAssets]),
    ],
    targets: [targets("redeem", machine, args.hub)],
  };
}

/** Claim finalized requests, possibly on several Machines: no approval, and each redeemer pays the NFT's owner. */
export function claimPlan(claims: readonly { machine: MachineData; hub: HubAnchor; requestId: bigint }[]): Plan {
  const byMachine = new Map<string, (typeof claims)[number]>();
  for (const c of claims) {
    if (!c.machine.redeemer) throw new Error("This Machine has no redeemer");
    byMachine.set(c.machine.machine.toLowerCase(), c);
  }
  return {
    steps: claims.map((c) =>
      tx(`Claim request #${c.requestId}`, c.machine.redeemer!, asyncRedeemerFeeAbi, "claimAssets", [c.requestId]),
    ),
    targets: [...byMachine.values()].map((c) => targets("claim", c.machine, c.hub)),
  };
}

export function wrapPlan(weth: Address, amount: bigint): Plan {
  return { steps: [tx("Wrap ETH", weth, WETH_ABI, "deposit", undefined, amount)] };
}
