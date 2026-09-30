import type { CapUsage } from "@/lib/derive";
import { formatRatioPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CapBar({ usage, className }: { usage: CapUsage | undefined; className?: string }) {
  if (usage === undefined) return <span className="text-muted-foreground">–</span>;
  if (usage.kind === "none") return <span className="text-muted-foreground text-xs">No cap</span>;

  const ratio = usage.kind === "full" ? 1 : usage.ratio;
  const label = usage.kind === "full" ? "Full" : formatRatioPercent(ratio);
  return (
    <div className={cn("flex min-w-24 items-center gap-2", className)}>
      <div
        role="meter"
        aria-label="Deposit cap used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={label}
        className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
      >
        <div
          className={cn("h-full rounded-full", ratio >= 0.95 ? "bg-warning" : "bg-brand")}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums">{label}</span>
    </div>
  );
}
