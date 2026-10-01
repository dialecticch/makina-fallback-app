import {
  type Address,
  erc20Abi,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import type { Config } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";

import { type ApprovalNeed, type Plan, type TxRequest, tx } from "@/actions/plans";
import { verifyTargets, walletReader } from "@/actions/verify";
import { ALL_ERRORS_ABI, isContractRevert } from "@/lib/errors";

export type ExecuteEvent =
  | { type: "verifying" }
  | { type: "simulating"; label: string }
  | { type: "awaitingSignature"; label: string }
  | { type: "sent"; label: string; hash: Hash }
  /** Still not mined after a while: keep waiting (the button stays busy, so it cannot be sent twice). */
  | { type: "slow"; label: string; hash: Hash }
  | { type: "confirmed"; label: string; receipt: TransactionReceipt };

export class FlowCancelled extends Error {}

/** How long to wait for a receipt before telling the user it is slow (the wait itself goes on). */
const SLOW_AFTER_MS = 3 * 60_000;

/**
 * Exact-amount approval, only when the live allowance is lower. If approving directly reverts in simulation while
 * an allowance is already set (USDT-style tokens), approve 0 first.
 */
export async function approvalSteps(
  reader: Pick<PublicClient, "readContract" | "simulateContract">,
  { account, need }: { account: Address; need: ApprovalNeed },
): Promise<TxRequest[]> {
  const allowance = await reader.readContract({
    address: need.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, need.spender],
  });
  if (allowance >= need.amount) return [];
  const symbol = need.symbol ?? "token";
  const approve = (amount: bigint, label = `Approve ${symbol}`) =>
    tx(label, need.token, erc20Abi, "approve", [need.spender, amount]);
  if (allowance > 0n) {
    try {
      await reader.simulateContract({
        account,
        address: need.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [need.spender, need.amount],
      });
    } catch (error) {
      // Only a revert means "this token needs a reset"; a network error must not add a transaction.
      if (!isContractRevert(error)) throw error;
      return [approve(0n, `Reset ${symbol} approval`), approve(need.amount)];
    }
  }
  return [approve(need.amount)];
}

/**
 * Runs a plan through the connected wallet:
 * 1. its targets are re-read through the wallet's own RPC and must match what the app showed (verify.ts);
 * 2. approvals (exact amount) are added only when the live allowance is lower;
 * 3. each step is simulated from `account` through the wallet's RPC, sent with `chainId` (so a wallet on the wrong
 *    chain is refused before signing), and awaited.
 * The same code path serves the UI (`useTransactionFlow`) and the fork tests.
 */
export async function executePlan(
  config: Config,
  args: {
    chainId: number;
    account: Address;
    plan: Plan;
    onEvent?: (event: ExecuteEvent) => void;
    isCancelled?: () => boolean;
    onStepConfirmed?: () => void;
  },
): Promise<TransactionReceipt | undefined> {
  const { chainId, account, plan, onEvent } = args;
  const check = () => {
    if (args.isCancelled?.()) throw new FlowCancelled();
  };

  const reader = await walletReader(config, chainId);
  if (plan.targets?.length) {
    onEvent?.({ type: "verifying" });
    for (const targets of plan.targets) await verifyTargets(reader, targets);
    check();
  }

  const steps = [
    ...(plan.approval ? await approvalSteps(reader, { account, need: plan.approval }) : []),
    ...plan.steps,
  ];
  let last: TransactionReceipt | undefined;
  for (const [i, step] of steps.entries()) {
    check();
    // "Approve USDC (1/2)", so the user sees there is a second transaction to sign.
    const label = steps.length > 1 ? `${step.label} (${i + 1}/${steps.length})` : step.label;
    onEvent?.({ type: "simulating", label });
    const { request } = await reader.simulateContract({
      account,
      address: step.address,
      // The target's ABI plus every known error, so reverts from deeper calls decode too.
      abi: [...step.abi, ...ALL_ERRORS_ABI],
      functionName: step.functionName,
      args: step.args,
      value: step.value,
    } as never);
    check();

    onEvent?.({ type: "awaitingSignature", label: step.label });
    const hash = await writeContract(config, { ...(request as object), chainId } as never);
    onEvent?.({ type: "sent", label: step.label, hash });

    const receipt = await waitForReceipt(
      config,
      chainId,
      hash,
      () => onEvent?.({ type: "slow", label: step.label, hash }),
      check,
    );
    if (receipt.status !== "success") throw new Error(`${step.label} reverted on-chain (${hash}).`);
    onEvent?.({ type: "confirmed", label: step.label, receipt });
    args.onStepConfirmed?.();
    last = receipt;
  }
  return last;
}

/**
 * Waits for a receipt without ever reporting a pending transaction as failed: after SLOW_AFTER_MS it notifies and
 * keeps waiting. A speed-up is followed to its replacement; a cancellation from the wallet stops the flow.
 */
async function waitForReceipt(
  config: Config,
  chainId: number,
  hash: Hash,
  onSlow: () => void,
  check: () => void,
): Promise<TransactionReceipt> {
  let cancelledInWallet = false;
  for (let attempt = 0; ; attempt++) {
    try {
      const receipt = await waitForTransactionReceipt(config, {
        chainId,
        hash,
        timeout: SLOW_AFTER_MS,
        onReplaced: (replacement) => {
          if (replacement.reason === "cancelled") cancelledInWallet = true;
        },
      });
      if (cancelledInWallet) throw new Error("The transaction was cancelled in your wallet.");
      return receipt;
    } catch (error) {
      if (!(error instanceof WaitForTransactionReceiptTimeoutError)) throw error;
      check();
      if (attempt === 0) onSlow();
    }
  }
}
