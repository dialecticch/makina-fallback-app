import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelativeTime, formatUtc } from "@/lib/format";

/** "3 hours ago", with the absolute UTC time in a tooltip. */
export function RelativeTime({
  unixSeconds,
  nowSeconds,
}: {
  unixSeconds: bigint | number | undefined;
  nowSeconds?: bigint;
}) {
  if (unixSeconds === undefined) return <span className="text-muted-foreground">–</span>;
  const t = Number(unixSeconds);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={new Date(t * 1000).toISOString()} tabIndex={0} className="tabular-nums">
          {formatRelativeTime(t, nowSeconds === undefined ? undefined : Number(nowSeconds))}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatUtc(t)}</TooltipContent>
    </Tooltip>
  );
}
