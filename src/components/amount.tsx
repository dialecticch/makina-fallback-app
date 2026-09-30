import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTokenAmount, formatTokenExact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A token amount in compact form, with the exact value in a tooltip. Renders "–" when unknown. */
export function Amount({
  value,
  decimals,
  symbol,
  compact = true,
  className,
}: {
  value: bigint | undefined;
  decimals: number | undefined;
  symbol?: string;
  compact?: boolean;
  className?: string;
}) {
  if (value === undefined || decimals === undefined) {
    return <span className={cn("text-muted-foreground", className)}>–</span>;
  }
  const exact = `${formatTokenExact(value, decimals)}${symbol ? ` ${symbol}` : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("tabular-nums", className)} tabIndex={0}>
          {formatTokenAmount(value, decimals, { compact })}
          {symbol && <span className="text-muted-foreground"> {symbol}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="font-mono">{exact}</TooltipContent>
    </Tooltip>
  );
}
