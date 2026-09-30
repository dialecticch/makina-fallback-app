import { useState } from "react";
import { isAddressEqual, parseEventLogs } from "viem";
import { useReadContract } from "wagmi";

import { asyncRedeemerFeeAbi, machineAbi } from "@/abis";
import { requestRedeemPlan } from "@/actions/plans";
import { type ActionContext, useActionContext } from "@/actions/use-action-context";
import { useTransactionFlow } from "@/actions/use-transaction-flow";
import { ActionButton } from "@/components/action-button";
import { Amount } from "@/components/amount";
import { Line, SpenderLine } from "@/components/preview-lines";
import { parseTokenInput, TokenAmountInput } from "@/components/token-amount-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUserSettings } from "@/config/user-settings";
import type { MachineView } from "@/data/machine-view";
import { useDebouncedMemo } from "@/hooks/use-debounced-memo";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { applySlippage, lessRedeemFee } from "@/lib/derive";
import { formatDuration, formatWadPercent } from "@/lib/format";
import { preCheckFor } from "@/lib/pre-checks";

/** Request a redemption through the Machine's AsyncRedeemer. */
export function RequestRedeemForm({ view }: { view: MachineView }) {
  const ctx = useActionContext(view);
  return <RequestRedeemFields key={ctx.resetKey} view={view} ctx={ctx} />;
}

function RequestRedeemFields({ view, ctx }: { view: MachineView; ctx: ActionContext }) {
  const { data } = view;
  const { slippageBps } = useUserSettings();
  const flow = useTransactionFlow({ chainId: ctx.chainId, account: ctx.account });
  const [text, setText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useLocalStorage<Record<string, true>>("makina-fallback:queue-ack", {});
  const ackKey = `${ctx.chainId}:${data.machine.toLowerCase()}`;

  const shares = parseTokenInput(text, view.shareDecimals);
  const debouncedShares = useDebouncedMemo(() => shares, [shares], 300);
  const preview = useReadContract({
    chainId: ctx.chainId,
    address: data.machine,
    abi: machineAbi,
    functionName: "convertToAssets",
    args: [debouncedShares ?? 0n],
    query: { enabled: debouncedShares !== undefined && debouncedShares > 0n },
  });
  const isFeeVariant = view.redeemerKind === "AsyncRedeemerFee";
  const feeRate = isFeeVariant ? data.redeemerInfo.redeemFeeRate : undefined;
  const gross = debouncedShares === shares && !preview.isFetching ? preview.data : undefined;
  const estimate = gross === undefined ? undefined : lessRedeemFee(gross, feeRate);
  const minAssets = estimate === undefined ? undefined : applySlippage(estimate, slippageBps);

  const min = data.redeemerInfo.minRedeemAmount;
  const blocker =
    shares === undefined || shares === 0n
      ? "Enter an amount of shares."
      : ctx.user?.shares !== undefined && shares > ctx.user.shares
        ? `You hold fewer ${view.symbol ?? "shares"} than that.`
        : min !== undefined && shares < min
          ? "Below this Machine's minimum redemption."
          : estimate === undefined
            ? "Calculating the estimate…"
            : !ctx.hub
              ? "Hub details are not loaded yet."
              : undefined;

  const submit = () => {
    if (!shares || gross === undefined || !ctx.account || !data.redeemer || !ctx.hub) return;
    const redeemer = data.redeemer;
    const plan = requestRedeemPlan({
      machine: data,
      hub: ctx.hub,
      account: ctx.account,
      shares,
      grossAssets: gross,
      redeemFeeRate: feeRate,
      slippageBps,
      symbol: view.symbol,
    });
    void flow.run(plan, {
      onReceipt: (receipt) => {
        setText("");
        const created = parseEventLogs({
          abi: asyncRedeemerFeeAbi,
          eventName: "RedeemRequestCreated",
          logs: receipt.logs,
        }).find((l) => isAddressEqual(l.address, redeemer));
        return created
          ? `Redemption request #${created.args.requestId} created. It now appears in Portfolio.`
          : undefined;
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <TokenAmountInput
        id={`redeem-${data.machine}`}
        label="You redeem"
        decimals={view.shareDecimals}
        symbol={view.symbol}
        value={text}
        onChange={setText}
        balance={ctx.user?.shares}
      />

      <div className="flex flex-col gap-1.5 rounded-lg border p-3">
        <Line label="Estimated assets">
          <Amount value={estimate} decimals={view.accountingDecimals} symbol={view.accountingSymbol} compact={false} />
        </Line>
        <Line label={`Request reverts below (${(slippageBps / 100).toFixed(2)}% slippage)`}>
          <Amount value={minAssets} decimals={view.accountingDecimals} symbol={view.accountingSymbol} compact={false} />
        </Line>
        <Line label="Redemption fee">
          {feeRate === undefined ? (isFeeVariant ? "–" : "None") : formatWadPercent(feeRate)}
        </Line>
        <Line label="Finalization delay">
          {data.redeemerInfo.finalizationDelay === undefined
            ? "–"
            : formatDuration(data.redeemerInfo.finalizationDelay)}
        </Line>
        <Line label="Minimum redemption">
          <Amount value={min} decimals={view.shareDecimals} symbol={view.symbol} />
        </Line>
        {data.redeemer && (
          <SpenderLine
            chainId={ctx.chainId}
            amount={shares}
            decimals={view.shareDecimals}
            symbol={view.symbol}
            spender={data.redeemer}
            role="the Machine's redeemer"
          />
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        The slippage limit only protects the request itself. When the mechanic finalizes it, you receive the lower of
        this value and the value at finalization: there is no minimum then.
      </p>

      <ActionButton
        chainId={ctx.chainId}
        check={preCheckFor("redeem", view, ctx)}
        blocker={blocker}
        state={flow.state}
        onClick={() => (acknowledged[ackKey] ? submit() : setConfirmOpen(true))}
      >
        Request redemption
      </ActionButton>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redemptions go through a queue</DialogTitle>
            <DialogDescription asChild>
              <ul className="flex list-disc flex-col gap-2 pl-5">
                <li>Your request joins this Machine&apos;s redemption queue and you receive an NFT for it.</li>
                <li>
                  The Machine&apos;s mechanic must finalize it, at the earliest{" "}
                  {data.redeemerInfo.finalizationDelay === undefined
                    ? "after the finalization delay"
                    : `${formatDuration(data.redeemerInfo.finalizationDelay)} from now`}
                  . This app cannot speed that up.
                </li>
                <li>
                  You then receive the lower of the value now and the value at finalization. If the Machine loses value
                  in between, so does your redemption.
                </li>
                <li>Once finalized, claim it from Portfolio.</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAcknowledged({ ...acknowledged, [ackKey]: true });
                setConfirmOpen(false);
                submit();
              }}
            >
              I understand, continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
