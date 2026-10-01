import { useState } from "react";

import { approvalOnly, type Plan } from "@/actions/plans";
import type { useTransactionFlow } from "@/actions/use-transaction-flow";

type Flow = ReturnType<typeof useTransactionFlow>;
type RunOptions = NonNullable<Parameters<Flow["run"]>[1]>;

/** Whether to show an approval before the action: undefined while the allowance or the amount is unknown. */
export function needsApproval(allowance: bigint | undefined, amount: bigint | undefined) {
  if (allowance === undefined || amount === undefined || amount === 0n) return undefined;
  return allowance < amount;
}

/**
 * The approval as its own click: while the allowance is below `amount`, `run` sends only the plan's approval, and the
 * button becomes the action once it confirms. One click, one signature.
 *
 * `needed` is display only: the action's plan still re-reads the allowance through the wallet and approves first if it
 * is short, so a stale read here can never skip a needed approval.
 */
export function useApprovalStep(flow: Flow, allowance: bigint | undefined, amount: bigint | undefined) {
  // What this form just approved, until the app's own read catches up (its RPC can lag the wallet's by a block).
  const [approved, setApproved] = useState<bigint>();
  const known = approved !== undefined && (allowance === undefined || approved > allowance) ? approved : allowance;
  const needed = needsApproval(known, amount);

  const run = (plan: Plan, options: RunOptions = {}) => {
    const approval = plan.approval;
    if (needed && approval) {
      void flow.run(approvalOnly(plan), {
        onReceipt: () => {
          setApproved(approval.amount);
          return `${approval.symbol ?? "Token"} approved.`;
        },
        onNothingToSend: () => setApproved(approval.amount),
      });
      return;
    }
    void flow.run(plan, {
      ...options,
      onReceipt: (receipt) => {
        setApproved(undefined); // the action spent the allowance
        return options.onReceipt?.(receipt);
      },
    });
  };

  return { needed, run };
}
