import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Access, STATUS_META, type Status, type StatusCondition } from "@/lib/derive";
import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  teal: "border-brand/40 bg-brand/10 text-brand",
  yellow: "border-warning/40 bg-warning/10 text-warning",
  red: "border-destructive/40 bg-destructive/10 text-destructive",
  grey: "border-border bg-muted text-muted-foreground",
} as const;

function Badge({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONE_CLASSES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** One badge (highest severity wins); hovering lists every active condition. Text carries the meaning, not colour. */
export function StatusBadge({
  status,
  conditions,
  loading = false,
  verifiedHub = true,
}: {
  status: Status | undefined;
  conditions: readonly StatusCondition[];
  loading?: boolean;
  /** False for Machines of hubs this release does not ship: adds an "Unverified hub" badge. */
  verifiedHub?: boolean;
}) {
  if (!verifiedHub) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge tone="yellow">Unverified hub</Badge>
        <StatusBadge status={status} conditions={conditions} loading={loading} />
      </span>
    );
  }
  if (status === undefined || loading) return <Badge tone="grey">Loading…</Badge>;
  const meta = STATUS_META[status];
  const badge = (
    <Badge tone={meta.tone}>
      {meta.label}
      {conditions.length > 1 && <span aria-hidden>+{conditions.length - 1}</span>}
    </Badge>
  );
  if (conditions.length <= 1) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`Status: ${conditions.map((c) => STATUS_META[c].label).join(", ")}`}>
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="flex flex-col gap-0.5">
          {conditions.map((c) => (
            <li key={c}>{STATUS_META[c].label}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function AccessBadge({ access }: { access: Access | undefined }) {
  if (access === undefined) return <span className="text-muted-foreground">–</span>;
  const tone = access === "Open" ? "teal" : access === "Whitelisted" ? "yellow" : "grey";
  return <Badge tone={tone}>{access}</Badge>;
}
