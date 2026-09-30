import { useState } from "react";

import { wrapPlan } from "@/actions/plans";
import { type ActionContext, useActionContext } from "@/actions/use-action-context";
import { useTransactionFlow } from "@/actions/use-transaction-flow";
import { ActionButton } from "@/components/action-button";
import { parseTokenInput, TokenAmountInput } from "@/components/token-amount-input";
import { getChainConfig } from "@/config/chains";
import type { MachineView } from "@/data/machine-view";
import { formatTokenAmount } from "@/lib/format";
import { preCheckFor } from "@/lib/pre-checks";

/** Wrap ETH into the chain's WETH, for WETH-denominated Machines. No unwrap. */
export function WrapEth({ view }: { view: MachineView }) {
  const ctx = useActionContext(view);
  const wrap = getChainConfig(ctx.chainId)?.wrap;
  if (!wrap) return null;
  return <WrapEthForm key={ctx.resetKey} view={view} ctx={ctx} wrap={wrap} />;
}

function WrapEthForm({
  view,
  ctx,
  wrap,
}: {
  view: MachineView;
  ctx: ActionContext;
  wrap: NonNullable<NonNullable<ReturnType<typeof getChainConfig>>["wrap"]>;
}) {
  const flow = useTransactionFlow({ chainId: ctx.chainId, account: ctx.account });
  const [text, setText] = useState("");

  const native = ctx.nativeBalance;
  const maxWrap = native === undefined ? undefined : native > wrap.gasReserve ? native - wrap.gasReserve : 0n;
  const amount = parseTokenInput(text, 18);
  const reserve = formatTokenAmount(wrap.gasReserve, 18);

  const blocker =
    amount === undefined || amount === 0n
      ? "Enter an amount of ETH to wrap."
      : maxWrap !== undefined && amount > maxWrap
        ? `Keep at least ${reserve} ETH for gas.`
        : undefined;

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Wrap ETH into WETH</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          This Machine takes WETH. Wrapping keeps {reserve} ETH back for gas. There is no unwrap here.
        </p>
        <TokenAmountInput
          id={`wrap-${view.data.machine}`}
          label="You wrap"
          decimals={18}
          symbol="ETH"
          value={text}
          onChange={setText}
          balance={native}
          maxValue={maxWrap}
        />
        <ActionButton
          size="sm"
          chainId={ctx.chainId}
          check={preCheckFor("wrap", view, ctx)}
          blocker={blocker}
          state={flow.state}
          onClick={() => {
            if (!amount) return;
            void flow.run(wrapPlan(wrap.weth, amount), { onReceipt: () => setText("") });
          }}
        >
          Wrap ETH
        </ActionButton>
      </div>
    </details>
  );
}
