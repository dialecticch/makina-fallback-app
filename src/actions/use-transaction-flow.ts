import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hash, TransactionReceipt } from "viem";
import { useConfig } from "wagmi";

import { executePlan, FlowCancelled } from "@/actions/execute";
import type { Plan } from "@/actions/plans";
import { decodeRevert } from "@/lib/errors";

export type FlowState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "simulating"; label: string }
  | { status: "awaitingSignature"; label: string }
  | { status: "pending"; label: string; hash: Hash; slow?: boolean }
  | { status: "confirmed"; hash: Hash; message?: string }
  | { status: "failed"; message: string };

/**
 * UI wrapper around `executePlan`: flow state for the button (with explorer links) and a refresh of the chain's
 * data after every confirmed step.
 *
 * Forms are remounted with `key={resetKey}` when the chain, Machine, account or wallet chain changes; unmounting
 * abandons an in-flight flow, so the next click starts again from the pre-checks.
 */
export function useTransactionFlow({ chainId, account }: { chainId: number; account: Address | undefined }) {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [state, setState] = useState<FlowState>({ status: "idle" });

  const runId = useRef(0);
  useEffect(
    () => () => {
      runId.current += 1;
    },
    [],
  );

  const refreshChain = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["user", chainId] });
    void queryClient.invalidateQueries({ queryKey: ["machineData", chainId] });
    void queryClient.invalidateQueries({ queryKey: ["queueHealth", chainId] });
  }, [queryClient, chainId]);

  const run = useCallback(
    async (plan: Plan, { onReceipt }: { onReceipt?: (receipt: TransactionReceipt) => string | void } = {}) => {
      if (!account) return;
      const myRun = ++runId.current;
      const mine = () => runId.current === myRun;
      try {
        const receipt = await executePlan(config, {
          chainId,
          account,
          plan,
          isCancelled: () => !mine(),
          onStepConfirmed: refreshChain,
          onEvent: (event) => {
            if (!mine()) return;
            if (event.type === "verifying") setState({ status: "verifying" });
            if (event.type === "simulating") setState({ status: "simulating", label: event.label });
            if (event.type === "awaitingSignature") setState({ status: "awaitingSignature", label: event.label });
            if (event.type === "sent") setState({ status: "pending", label: event.label, hash: event.hash });
            if (event.type === "slow")
              setState({ status: "pending", label: event.label, hash: event.hash, slow: true });
          },
        });
        if (!mine() || !receipt) return;
        const message = onReceipt?.(receipt);
        setState({ status: "confirmed", hash: receipt.transactionHash, message: message || undefined });
      } catch (error) {
        if (error instanceof FlowCancelled || !mine()) return;
        const decoded = decodeRevert(error);
        setState(decoded.rejected ? { status: "idle" } : { status: "failed", message: decoded.message });
        console.error(error);
      }
    },
    [account, chainId, config, refreshChain],
  );

  const busy =
    state.status === "verifying" ||
    state.status === "simulating" ||
    state.status === "awaitingSignature" ||
    state.status === "pending";

  return { state, run, busy };
}
