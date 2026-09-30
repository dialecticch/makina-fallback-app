import type { Address as AddressType } from "viem";

import { Address } from "@/components/address";
import { Amount } from "@/components/amount";

/** One label / value line in an action's preview box. */
export function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/**
 * What the approval will grant, shown before the wallet prompt: the exact amount and the spender, so the user can
 * compare it with what their wallet displays.
 */
export function SpenderLine({
  chainId,
  amount,
  decimals,
  symbol,
  spender,
  role,
}: {
  chainId: number;
  amount: bigint | undefined;
  decimals: number | undefined;
  symbol: string | undefined;
  spender: AddressType;
  role: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t pt-1.5 text-xs">
      <span className="text-muted-foreground">
        Approval (only if needed): exactly <Amount value={amount} decimals={decimals} symbol={symbol} compact={false} />{" "}
        to {role}
      </span>
      <Address chainId={chainId} address={spender} full className="break-all" />
    </div>
  );
}
