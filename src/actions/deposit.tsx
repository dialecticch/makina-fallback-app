import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { isAddressEqual } from "viem";
import { useReadContract } from "wagmi";

import { machineAbi } from "@/abis";
import { depositPlan } from "@/actions/plans";
import { type ActionContext, useActionContext } from "@/actions/use-action-context";
import { useApprovalStep } from "@/actions/use-approval-step";
import { useTransactionFlow } from "@/actions/use-transaction-flow";
import { WrapEth } from "@/actions/wrap-eth";
import { ActionButton } from "@/components/action-button";
import { Amount } from "@/components/amount";
import { Line, SpenderLine } from "@/components/preview-lines";
import { parseTokenInput, TokenAmountInput } from "@/components/token-amount-input";
import { getChainConfig } from "@/config/chains";
import { useUserSettings } from "@/config/user-settings";
import type { MachineView } from "@/data/machine-view";
import { useDebouncedMemo } from "@/hooks/use-debounced-memo";
import { applySlippage } from "@/lib/derive";
import { preCheckFor } from "@/lib/pre-checks";

/** Deposit through the Machine's DirectDepositor. */
export function DepositForm({ view }: { view: MachineView }) {
  const ctx = useActionContext(view);
  return <DepositFields key={ctx.resetKey} view={view} ctx={ctx} />;
}

function DepositFields({ view, ctx }: { view: MachineView; ctx: ActionContext }) {
  const { data } = view;
  const { slippageBps } = useUserSettings();
  const flow = useTransactionFlow({ chainId: ctx.chainId, account: ctx.account });

  const [text, setText] = useState("");
  const [staleAck, setStaleAck] = useState(false);

  const assets = parseTokenInput(text, view.accountingDecimals);
  const debouncedAssets = useDebouncedMemo(() => assets, [assets], 300);
  const preview = useReadContract({
    chainId: ctx.chainId,
    address: data.machine,
    abi: machineAbi,
    functionName: "convertToShares",
    args: [debouncedAssets ?? 0n],
    query: { enabled: debouncedAssets !== undefined && debouncedAssets > 0n },
  });
  // Only a fresh preview for exactly this amount counts (never one kept from a previous amount).
  const shares = debouncedAssets === assets && !preview.isFetching ? preview.data : undefined;
  const minShares = shares === undefined ? undefined : applySlippage(shares, slippageBps);

  const symbol = view.accountingSymbol ?? "tokens";
  const approval = useApprovalStep(flow, ctx.user?.depositAllowance, assets);

  const exceedsCap = shares !== undefined && data.maxMint !== undefined && shares > data.maxMint;
  const blocker =
    assets === undefined || assets === 0n
      ? "Enter an amount."
      : ctx.user?.accountingBalance !== undefined && assets > ctx.user.accountingBalance
        ? `Not enough ${symbol} in this wallet.`
        : shares === undefined
          ? "Calculating shares…"
          : shares === 0n
            ? "This amount is too small to mint any shares."
            : exceedsCap
              ? "This deposit would exceed the Machine's share cap."
              : view.accountingStale && !staleAck
                ? "Confirm the stale-accounting warning first."
                : !ctx.hub
                  ? "Hub details are not loaded yet."
                  : undefined;

  const weth = getChainConfig(ctx.chainId)?.wrap?.weth;
  const isWeth = weth !== undefined && data.accountingToken !== undefined && isAddressEqual(weth, data.accountingToken);

  return (
    <div className="flex flex-col gap-3">
      <TokenAmountInput
        id={`deposit-${data.machine}`}
        label="You deposit"
        decimals={view.accountingDecimals}
        symbol={view.accountingSymbol}
        value={text}
        onChange={setText}
        balance={ctx.user?.accountingBalance}
      />

      <div className="flex flex-col gap-1.5 rounded-lg border p-3">
        <Line label="You receive (estimate)">
          <Amount value={shares} decimals={view.shareDecimals} symbol={view.symbol} compact={false} />
        </Line>
        <Line label={`Reverts below (${(slippageBps / 100).toFixed(2)}% slippage)`}>
          <Amount value={minShares} decimals={view.shareDecimals} symbol={view.symbol} compact={false} />
        </Line>
        <Line label="Share price">
          <Amount
            value={view.sharePrice}
            decimals={view.accountingDecimals}
            symbol={view.accountingSymbol}
            compact={false}
          />
        </Line>
        <Line label="Cap headroom">
          {view.cap?.kind === "none" ? (
            "No cap"
          ) : (
            <Amount value={data.maxMint} decimals={view.shareDecimals} symbol={view.symbol} />
          )}
        </Line>
        {data.depositor && (
          <SpenderLine
            chainId={ctx.chainId}
            amount={assets}
            decimals={view.accountingDecimals}
            symbol={view.accountingSymbol}
            spender={data.depositor}
            role="the depositor"
            needed={approval.needed}
          />
        )}
      </div>

      {view.accountingStale && (
        <label className="border-warning/40 bg-warning/10 flex items-start gap-2 rounded-lg border p-3 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={staleAck}
            onChange={(e) => setStaleAck(e.target.checked)}
          />
          <span>
            <TriangleAlert className="text-warning mr-1 inline size-3.5" aria-hidden />
            Shares are priced from a stale accounting update. I understand.
          </span>
        </label>
      )}

      <ActionButton
        chainId={ctx.chainId}
        check={preCheckFor("deposit", view, ctx)}
        blocker={blocker}
        state={flow.state}
        onClick={() => {
          if (!assets || shares === undefined || !ctx.account || !ctx.hub) return;
          // `receiver` is always the connected account.
          const plan = depositPlan({
            machine: data,
            hub: ctx.hub,
            account: ctx.account,
            assets,
            shares,
            slippageBps,
            symbol: view.accountingSymbol,
          });
          approval.run(plan, { onReceipt: () => setText("") });
        }}
      >
        {approval.needed ? `Approve ${symbol}` : "Deposit"}
      </ActionButton>

      {isWeth && <WrapEth view={view} />}
    </div>
  );
}
