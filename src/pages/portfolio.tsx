import { ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { useChains } from "wagmi";

import { ClaimAllButton, ClaimButton } from "@/actions/claim";
import { Amount } from "@/components/amount";
import { StatusBadge } from "@/components/badges";
import { ChainIcon } from "@/components/chain-icon";
import { ErrorBoundary } from "@/components/error-boundary";
import { type FitColumn, FitTable } from "@/components/fit-table";
import { LearnMore } from "@/components/learn-more";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ViewAddressField } from "@/components/viewer";
import { explorerUrl } from "@/config/chains";
import type { MachineView } from "@/data/machine-view";
import { useActivity } from "@/data/use-activity";
import {
  type ActivityRow,
  activityRows,
  type EarningsRow,
  earningsRows,
  type Position,
  type RequestRow,
  usePortfolio,
} from "@/data/use-portfolio";
import type { UserSnapshot } from "@/data/user-types";
import { REQUEST_STATUS_LABEL } from "@/lib/derive";
import { abbreviateAddress, formatTokenAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { YieldGap } from "@/lib/yield";

type Activity = ReturnType<typeof useActivity>;

function MachineCell({ view, chainId }: { view: MachineView | undefined; chainId: number }) {
  const chains = useChains();
  const chain = chains.find((c) => c.id === chainId);
  if (!view) return <span className="text-muted-foreground">Unknown Machine</span>;
  return (
    <Link to={`/machine/${view.data.chainId}/${view.data.machine}`} className="flex items-center gap-2 hover:underline">
      <ChainIcon id={chainId} name={chain?.name} />
      <span className="sr-only">{chain?.name}</span>
      <span className="font-medium">{view.symbol ?? abbreviateAddress(view.data.machine)}</span>
    </Link>
  );
}

function ChainLines({ snapshots }: { snapshots: UserSnapshot[] }) {
  const chains = useChains();
  return (
    <div className="flex flex-col gap-1">
      {snapshots.map((s) => {
        const chain = chains.find((c) => c.id === s.instance.chainId);
        return (
          <div
            key={s.instance.id}
            className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
          >
            <span className="text-foreground flex items-center gap-1.5 font-medium">
              <ChainIcon id={s.instance.chainId} name={chain?.name} />
              {chain?.name ?? `Chain ${s.instance.chainId}`}
            </span>
            {!s.balancesReady || !s.requestsReady ? (
              <span role="status">Loading your positions…</span>
            ) : s.updatedAt ? (
              <span>
                Updated <RelativeTime unixSeconds={Math.floor(s.updatedAt / 1000)} />
              </span>
            ) : null}
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => s.refetch?.()}>
              <RefreshCw aria-hidden />
              Refresh
            </Button>
            {s.error && (
              <span role="alert" className="text-destructive">
                {s.error.split("\n")[0]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary label={title}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </CardHeader>
        <CardContent className="px-2 sm:px-5">{children}</CardContent>
      </Card>
    </ErrorBoundary>
  );
}

function ClaimableSection({ rows }: { rows: RequestRow[] }) {
  if (rows.length === 0) return null;
  const columns: FitColumn<RequestRow>[] = [
    {
      key: "machine",
      label: "Machine",
      title: true,
      cell: (r) => <MachineCell view={r.view} chainId={r.request.chainId} />,
    },
    {
      key: "request",
      label: "Request",
      cell: (r) => <span className="font-mono tabular-nums">#{r.request.id.toString()}</span>,
    },
    {
      key: "assets",
      label: "Assets",
      align: "right",
      cell: (r) => (
        <Amount
          value={r.request.claimableAssets}
          decimals={r.view?.accountingDecimals}
          symbol={r.view?.accountingSymbol}
        />
      ),
    },
    {
      key: "claim",
      label: "Claim",
      header: <span className="sr-only">Claim</span>,
      align: "right",
      wide: true,
      cell: (r) => <ClaimButton row={r} />,
    },
  ];
  return (
    <Section title="Claimable redemptions">
      {rows.length > 1 && (
        <div className="flex justify-end px-3 pb-2">
          <ClaimAllButton rows={rows} />
        </div>
      )}
      <FitTable columns={columns} rows={rows} rowKey={(r) => `${r.request.redeemer}:${r.request.id}`} />
    </Section>
  );
}

const GAP_TEXT: Record<YieldGap, string> = {
  unpriced: "Shares came in or left outside Makina, and no RPC returned their past value. Add an RPC in Settings.",
  balance: "Shares moved in a way the history cannot account for.",
  request: "A redemption request moved between wallets.",
  unknownValue: "A current value could not be read. Try Refresh.",
};

function signedAmount(value: bigint, decimals: number) {
  const sign = value > 0n ? "+" : value < 0n ? "−" : "";
  return `${sign}${formatTokenAmount(value < 0n ? -value : value, decimals)}`;
}

/** `part / whole` as a signed percentage with two decimals. */
function signedPercent(part: bigint, whole: bigint) {
  if (whole <= 0n) return undefined;
  const bps = (part * 10_000n) / whole;
  const abs = bps < 0n ? -bps : bps;
  return `${bps > 0n ? "+" : bps < 0n ? "−" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}%`;
}

/** What one Machine earned the viewer, with the split in a tooltip; "–" with the reason when it cannot be known. */
function Earned({ row, loading }: { row: EarningsRow | undefined; loading: boolean }) {
  if (!row) return <span className="text-muted-foreground">{loading ? "…" : "–"}</span>;
  const { result, view } = row;
  const decimals = view.accountingDecimals;
  if (!result.ok || decimals === undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="text-muted-foreground">
            –
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {result.ok ? "Unknown token decimals." : GAP_TEXT[result.gap]}
        </TooltipContent>
      </Tooltip>
    );
  }
  const percent = signedPercent(result.current, result.costBasis);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn("tabular-nums", result.total > 0n && "text-success", result.total < 0n && "text-destructive")}
        >
          {signedAmount(result.total, decimals)}
          {view.accountingSymbol && <span className="text-muted-foreground"> {view.accountingSymbol}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-64 flex-col gap-0.5">
        {row.holding && (
          <span>
            Shares held: {signedAmount(result.current, decimals)}
            {percent && ` (${percent})`}
          </span>
        )}
        {result.past !== 0n && <span>Shares redeemed or sent: {signedAmount(result.past, decimals)}</span>}
        <span className="text-muted-foreground">At the share price when shares came in and left.</span>
      </TooltipContent>
    </Tooltip>
  );
}

function EarningsPrompt({ activity }: { activity: Activity }) {
  if (activity.started) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2">
      <Button size="sm" variant="outline" onClick={activity.load}>
        Show earnings
      </Button>
      <span className="text-muted-foreground text-xs">
        Loads your history: a minute or two the first time. <LearnMore topic="data" />
      </span>
    </div>
  );
}

function PositionsSection({
  positions,
  loading,
  earnings,
  activity,
}: {
  positions: Position[];
  loading: boolean;
  earnings: Map<string, EarningsRow>;
  activity: Activity;
}) {
  const chains = useChains();
  const byChain = new Map<number, Position[]>();
  for (const p of positions) byChain.set(p.view.data.chainId, [...(byChain.get(p.view.data.chainId) ?? []), p]);
  const columns: FitColumn<Position>[] = [
    {
      key: "machine",
      label: "Machine",
      title: true,
      cell: ({ view }) => <MachineCell view={view} chainId={view.data.chainId} />,
    },
    {
      key: "shares",
      label: "Shares",
      align: "right",
      cell: ({ view, state }) => <Amount value={state.shares} decimals={view.shareDecimals} />,
    },
    {
      key: "value",
      label: "Value",
      align: "right",
      cell: ({ view, state }) => (
        <Amount value={state.value} decimals={view.accountingDecimals} symbol={view.accountingSymbol} />
      ),
    },
    {
      key: "earned",
      label: "Earned",
      align: "right",
      cell: ({ view }) => <Earned row={earnings.get(view.key)} loading={activity.loading} />,
    },
    {
      key: "price",
      label: "Share price",
      align: "right",
      cell: ({ view }) => <Amount value={view.sharePrice} decimals={view.accountingDecimals} compact={false} />,
    },
    {
      key: "status",
      label: "Status",
      cell: ({ view }) => (
        <StatusBadge status={view.status} conditions={view.conditions} verifiedHub={view.verifiedHub} />
      ),
    },
    {
      key: "actions",
      label: "Actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      wide: true,
      cell: ({ view }) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/machine/${view.data.chainId}/${view.data.machine}?action=deposit`}>Deposit more</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/machine/${view.data.chainId}/${view.data.machine}?action=redeem`}>Redeem</Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Section title="Positions">
      {positions.length === 0 ? (
        loading ? (
          <Skeleton className="h-16" />
        ) : (
          <p className="text-muted-foreground px-3 pb-2 text-sm">No Makina positions on these networks.</p>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <EarningsPrompt activity={activity} />
          {[...byChain.entries()].map(([chainId, list]) => (
            <div key={chainId} className="flex flex-col gap-1">
              <h3 className="text-muted-foreground flex items-center gap-1.5 px-3 text-xs font-medium">
                <ChainIcon id={chainId} name={chains.find((c) => c.id === chainId)?.name} />
                {chains.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`}
              </h3>
              <FitTable columns={columns} rows={list} rowKey={({ view }) => view.key} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function PendingSection({ rows, now }: { rows: RequestRow[]; now: bigint }) {
  if (rows.length === 0) return null;
  const earliest = (r: RequestRow) => {
    const delay = r.view?.data.redeemerInfo.finalizationDelay;
    return r.request.requestTime !== undefined && delay !== undefined ? r.request.requestTime + delay : undefined;
  };
  const columns: FitColumn<RequestRow>[] = [
    {
      key: "machine",
      label: "Machine",
      title: true,
      cell: (r) => <MachineCell view={r.view} chainId={r.request.chainId} />,
    },
    {
      key: "request",
      label: "Request",
      cell: (r) => <span className="font-mono tabular-nums">#{r.request.id.toString()}</span>,
    },
    {
      key: "shares",
      label: "Shares",
      align: "right",
      cell: (r) => <Amount value={r.request.shares} decimals={r.view?.shareDecimals} />,
    },
    {
      key: "estimate",
      label: "Estimated assets",
      align: "right",
      cell: (r) => (
        <>
          <Amount
            value={r.request.estimatedAssets}
            decimals={r.view?.accountingDecimals}
            symbol={r.view?.accountingSymbol}
          />
          <span className="sr-only"> (estimate)</span>
        </>
      ),
    },
    {
      key: "requested",
      label: "Requested",
      cell: (r) =>
        r.request.requestTime !== undefined ? (
          <RelativeTime unixSeconds={r.request.requestTime} nowSeconds={now} />
        ) : (
          <span className="text-muted-foreground">Unknown</span>
        ),
    },
    {
      key: "earliest",
      label: "Earliest finalization",
      cell: (r) => {
        const e = earliest(r);
        return e !== undefined ? <RelativeTime unixSeconds={e} nowSeconds={now} /> : "–";
      },
    },
    {
      key: "status",
      label: "Status",
      cell: (r) => (
        <span className={cn("text-xs font-medium", r.status === "stalled" && "text-warning")}>
          {REQUEST_STATUS_LABEL[r.status]}
        </span>
      ),
    },
  ];
  return (
    <Section
      title="Pending redemptions"
      description="Each pays the value when requested, or less if the share price falls before finalization."
    >
      <FitTable columns={columns} rows={rows} rowKey={(r) => `${r.request.redeemer}:${r.request.id}`} />
    </Section>
  );
}

/** Machines the viewer has left (no shares now), with what they earned. */
function PastSection({ earnings }: { earnings: Map<string, EarningsRow> }) {
  const rows = [...earnings.values()].filter((r) => !r.holding && r.result.ok && r.result.total !== 0n);
  if (rows.length === 0) return null;
  const columns: FitColumn<EarningsRow>[] = [
    {
      key: "machine",
      label: "Machine",
      title: true,
      cell: ({ view }) => <MachineCell view={view} chainId={view.data.chainId} />,
    },
    { key: "earned", label: "Earned", align: "right", cell: (row) => <Earned row={row} loading={false} /> },
    {
      key: "actions",
      label: "Actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      wide: true,
      cell: ({ view }) => (
        <Button size="sm" variant="outline" asChild>
          <Link to={`/machine/${view.data.chainId}/${view.data.machine}?action=deposit`}>Deposit again</Link>
        </Button>
      ),
    },
  ];
  return (
    <Section title="Past positions">
      <FitTable columns={columns} rows={rows} rowKey={({ view }) => view.key} />
    </Section>
  );
}

const ACTIVITY_LABEL = { deposit: "Deposit", request: "Redemption request", claim: "Claim" } as const;

function ActivitySection({
  activity,
  views,
  now,
}: {
  activity: Activity;
  views: Map<string, MachineView>;
  now: bigint;
}) {
  const chains = useChains();
  const rows: ActivityRow[] = activityRows(activity.items, views);
  const chainName = (id: number) => chains.find((c) => c.id === id)?.name ?? `Chain ${id}`;
  const activityColumns: FitColumn<ActivityRow>[] = [
    {
      key: "action",
      label: "Action",
      title: true,
      cell: ({ item }) => (
        <>
          {ACTIVITY_LABEL[item.kind]}
          {item.requestId !== undefined && (
            <span className="text-muted-foreground font-mono"> #{item.requestId.toString()}</span>
          )}
        </>
      ),
    },
    { key: "machine", label: "Machine", cell: ({ item, view }) => <MachineCell view={view} chainId={item.chainId} /> },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      cell: ({ item, view }) =>
        item.kind === "request" ? (
          <Amount value={item.shares} decimals={view?.shareDecimals} symbol={view?.symbol} />
        ) : (
          <Amount value={item.assets} decimals={view?.accountingDecimals} symbol={view?.accountingSymbol} />
        ),
    },
    {
      key: "when",
      label: "When",
      cell: ({ item }) =>
        item.time !== undefined ? (
          <RelativeTime unixSeconds={item.time} nowSeconds={now} />
        ) : (
          `Block ${item.blockNumber}`
        ),
    },
    {
      key: "tx",
      label: "Transaction",
      header: <span className="sr-only">Transaction</span>,
      align: "right",
      wide: true,
      cell: ({ item }) => {
        const href = explorerUrl(
          chains.find((c) => c.id === item.chainId),
          "tx",
          item.txHash,
        );
        return href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
            aria-label={`View transaction ${item.txHash} in the explorer`}
          >
            {item.txHash.slice(0, 10)}…
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null;
      },
    },
  ];

  return (
    <Section title="Activity">
      {!activity.started ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2">
          <Button size="sm" variant="outline" onClick={activity.load}>
            Load activity
          </Button>
          <span className="text-muted-foreground text-xs">
            Takes a minute or two the first time. <LearnMore topic="data" />
          </span>
        </div>
      ) : activity.loading ? (
        <div role="status" className="text-muted-foreground flex flex-col gap-1 px-3 pb-2 text-xs">
          {activity.progress
            .filter((p) => p.fraction < 1)
            .map((p) => (
              <span key={p.chainId} className="tabular-nums">
                {chainName(p.chainId)}: scanning
                {p.fraction > 0 ? ` ${Math.floor(p.fraction * 100)}%` : "…"}
              </span>
            ))}
        </div>
      ) : null}
      {!activity.started ? null : rows.length === 0 && activity.loading ? null : rows.length === 0 ? (
        <p className="text-muted-foreground px-3 pb-2 text-sm">No activity found.</p>
      ) : (
        <FitTable
          columns={activityColumns}
          rows={rows}
          rowKey={({ item }) => `${item.chainId}:${item.txHash}:${item.logIndex}`}
        />
      )}
      {activity.errors.map((e) => (
        <p key={e.chainId} role="alert" className="text-destructive px-3 pb-2 text-xs">
          {chainName(e.chainId)}: {e.message.split("\n")[0]}
        </p>
      ))}
    </Section>
  );
}

export function PortfolioPage() {
  const portfolio = usePortfolio();
  const activity = useActivity(portfolio.address);
  const earnings = earningsRows(portfolio.snapshots, activity.yieldData, portfolio.views);

  if (!portfolio.address) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm">Connect a wallet, or view any address read-only.</p>
          <ViewAddressField />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-muted-foreground font-mono text-xs break-all">{portfolio.address}</p>
      </div>
      <ChainLines snapshots={portfolio.snapshots} />
      <ClaimableSection rows={portfolio.claimable} />
      <PositionsSection
        positions={portfolio.positions}
        loading={portfolio.loadingBalances}
        earnings={earnings}
        activity={activity}
      />
      <PendingSection rows={portfolio.pending} now={portfolio.now} />
      <PastSection earnings={earnings} />
      <ActivitySection activity={activity} views={portfolio.views} now={portfolio.now} />
    </div>
  );
}
