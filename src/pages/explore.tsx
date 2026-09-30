import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useChains } from "wagmi";

import { Amount } from "@/components/amount";
import { AccessBadge, StatusBadge } from "@/components/badges";
import { CapBar } from "@/components/cap-bar";
import { ChainIcon } from "@/components/chain-icon";
import { useChainFilter } from "@/components/chain-filter";
import { ChainStatus } from "@/components/chain-status";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInstanceSnapshots } from "@/data/hub-store";
import type { MachineView } from "@/data/machine-view";
import { useMachineViews } from "@/data/use-machines";
import { useIsMobile } from "@/hooks/use-mobile";
import { STATUS_META, STATUS_PRECEDENCE, type Status } from "@/lib/derive";
import { formatWadPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "machine" | "token" | "tvl" | "sharePrice" | "fees" | "cap" | "access" | "status";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const STATUS_ORDER: Status[] = [...STATUS_PRECEDENCE, "healthy"];
const ACCESS_ORDER = ["Open", "Whitelisted", "Closed"];

function cmpBig(a: bigint | undefined, b: bigint | undefined) {
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return a < b ? -1 : 1;
}

function compare(a: MachineView, b: MachineView, key: SortKey): number {
  const text = (x?: string, y?: string) => (x ?? "").localeCompare(y ?? "", "en", { sensitivity: "base" });
  switch (key) {
    case "machine":
      return text(a.symbol, b.symbol);
    case "token":
      return text(a.accountingSymbol, b.accountingSymbol);
    case "tvl":
      return cmpBig(a.tvl, b.tvl);
    case "sharePrice":
      return cmpBig(a.sharePrice, b.sharePrice);
    case "fees":
      return cmpBig(a.fees.management, b.fees.management);
    case "cap": {
      const v = (m: MachineView) => (m.cap?.kind === "partial" ? m.cap.ratio : m.cap?.kind === "full" ? 1 : -1);
      return v(a) - v(b);
    }
    case "access":
      return ACCESS_ORDER.indexOf(a.access ?? "") - ACCESS_ORDER.indexOf(b.access ?? "");
    case "status":
      return STATUS_ORDER.indexOf(a.status ?? "healthy") - STATUS_ORDER.indexOf(b.status ?? "healthy");
  }
}

/** Amounts are only comparable within one accounting token, so amount sorts group by token first. */
function sortViews(views: MachineView[], sort: Sort) {
  const sign = sort.dir === "asc" ? 1 : -1;
  const groupByToken = sort.key === "tvl" || sort.key === "sharePrice";
  return [...views].sort((a, b) => {
    if (groupByToken) {
      const byToken = compare(a, b, "token");
      if (byToken !== 0) return byToken;
    }
    return sign * compare(a, b, sort.key) || compare(a, b, "machine");
  });
}

function SortHeader({
  label,
  sortKey,
  sort,
  setSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  setSort: (s: Sort) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="hover:text-foreground inline-flex cursor-pointer items-center gap-1"
        onClick={() =>
          setSort({
            key: sortKey,
            dir: active ? (sort.dir === "asc" ? "desc" : "asc") : sortKey === "machine" ? "asc" : "desc",
          })
        }
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          ))}
      </button>
    </TableHead>
  );
}

function MachineName({ view }: { view: MachineView }) {
  const chains = useChains();
  const chain = chains.find((c) => c.id === view.data.chainId);
  return (
    <Link to={`/machine/${view.data.chainId}/${view.data.machine}`} className="group flex min-w-0 items-center gap-2">
      <ChainIcon id={view.data.chainId} name={chain?.name} />
      <span className="sr-only">{chain?.name}</span>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium group-hover:underline">{view.symbol ?? "Unknown"}</span>
        <span className="text-muted-foreground truncate text-xs">{view.name ?? view.data.machine}</span>
      </span>
    </Link>
  );
}

function Fees({ view }: { view: MachineView }) {
  const { management, performance } = view.fees;
  if (management === undefined && performance === undefined) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="tabular-nums text-xs">
      {management === undefined ? "–" : formatWadPercent(management)}
      <span className="text-muted-foreground"> / </span>
      {performance === undefined ? "–" : formatWadPercent(performance)}
    </span>
  );
}

function DepositButton({ view }: { view: MachineView }) {
  const unsupported = !view.depositorClosed && view.data.depositor !== undefined && view.depositorKind === undefined;
  if (view.access === "Closed" || unsupported) {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link to={`/machine/${view.data.chainId}/${view.data.machine}`}>View</Link>
      </Button>
    );
  }
  return (
    <Button size="sm" asChild>
      <Link to={`/machine/${view.data.chainId}/${view.data.machine}?action=deposit`}>Deposit</Link>
    </Button>
  );
}

const wrapRow = (fallback: React.ReactNode) => (
  <TableRow>
    <TableCell colSpan={9}>{fallback}</TableCell>
  </TableRow>
);

function MachineRow({ view, dimmed }: { view: MachineView; dimmed: boolean }) {
  return (
    <TableRow className={cn("hover:bg-accent/40", dimmed && "opacity-60")}>
      <TableCell className="max-w-64">
        <MachineName view={view} />
      </TableCell>
      <TableCell>{view.accountingSymbol ?? "–"}</TableCell>
      <TableCell className="text-right">
        <Amount value={view.tvl} decimals={view.accountingDecimals} />
      </TableCell>
      <TableCell className="text-right">
        <Amount value={view.sharePrice} decimals={view.accountingDecimals} compact={false} />
      </TableCell>
      <TableCell>
        <Fees view={view} />
      </TableCell>
      <TableCell>
        <CapBar usage={view.cap} />
      </TableCell>
      <TableCell>
        <AccessBadge access={view.access} />
      </TableCell>
      <TableCell>
        <StatusBadge status={view.status} conditions={view.conditions} verifiedHub={view.verifiedHub} />
      </TableCell>
      <TableCell className="text-right">
        <DepositButton view={view} />
      </TableCell>
    </TableRow>
  );
}

function MachineCard({ view, dimmed }: { view: MachineView; dimmed: boolean }) {
  return (
    <Card className={cn("flex flex-col gap-3 p-4", dimmed && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <MachineName view={view} />
        <StatusBadge status={view.status} conditions={view.conditions} verifiedHub={view.verifiedHub} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground text-xs">TVL</dt>
        <dd className="text-right">
          <Amount value={view.tvl} decimals={view.accountingDecimals} symbol={view.accountingSymbol} />
        </dd>
        <dt className="text-muted-foreground text-xs">Share price</dt>
        <dd className="text-right">
          <Amount value={view.sharePrice} decimals={view.accountingDecimals} compact={false} />
        </dd>
        <dt className="text-muted-foreground text-xs">Fees (mgmt / perf)</dt>
        <dd className="text-right">
          <Fees view={view} />
        </dd>
        <dt className="text-muted-foreground text-xs">Cap</dt>
        <dd>
          <CapBar usage={view.cap} />
        </dd>
        <dt className="text-muted-foreground text-xs">Access</dt>
        <dd className="text-right">
          <AccessBadge access={view.access} />
        </dd>
      </dl>
      <DepositButton view={view} />
    </Card>
  );
}

export function ExplorePage() {
  const views = useMachineViews();
  const snapshots = useInstanceSnapshots();
  const { chainId } = useChainFilter();
  // Nine columns need about 1,000 px, so rows become cards below Tailwind's `lg`.
  const isMobile = useIsMobile(1024);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState("all");
  const [sort, setSort] = useState<Sort>({ key: "tvl", dir: "desc" });

  const erroredInstances = useMemo(
    () => new Set(snapshots.filter((s) => s.error).map((s) => s.instance.id)),
    [snapshots],
  );

  const inChain = useMemo(() => views.filter((v) => chainId === "all" || v.data.chainId === chainId), [views, chainId]);
  const tokens = useMemo(
    () => [...new Set(inChain.map((v) => v.accountingSymbol).filter((s): s is string => !!s))].sort(),
    [inChain],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = inChain.filter(
      (v) =>
        (token === "all" || v.accountingSymbol === token) &&
        (q === "" || [v.name, v.symbol, v.data.machine, v.data.shareToken].some((s) => s?.toLowerCase().includes(q))),
    );
    return sortViews(filtered, sort);
  }, [inChain, token, search, sort]);

  const loading = snapshots.some(
    (s) => (chainId === "all" || s.instance.chainId === chainId) && s.phase !== "ready" && s.phase !== "health",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <p className="text-muted-foreground text-sm">
          Every Machine on every discovered Makina hub, read directly from the chain.
        </p>
      </div>

      <ChainStatus />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1 sm:max-w-sm">
          <span className="sr-only">Search Machines</span>
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Search name, symbol or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Token</span>
          <select
            className="border-input bg-card h-9 rounded-md border px-2 text-sm"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          >
            <option value="all">All</option>
            {tokens.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {rows.length} Machine{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-3">
          {rows.map((view) => (
            <ErrorBoundary key={view.key} label={view.symbol ?? "This Machine"}>
              <MachineCard view={view} dimmed={erroredInstances.has(view.data.instanceId)} />
            </ErrorBoundary>
          ))}
          {rows.length === 0 && loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <Card className="overflow-hidden py-1">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Machine" sortKey="machine" sort={sort} setSort={setSort} />
                <SortHeader label="Token" sortKey="token" sort={sort} setSort={setSort} />
                <SortHeader label="TVL" sortKey="tvl" sort={sort} setSort={setSort} className="text-right" />
                <SortHeader
                  label="Share price"
                  sortKey="sharePrice"
                  sort={sort}
                  setSort={setSort}
                  className="text-right"
                />
                <SortHeader label="Mgmt / perf fee" sortKey="fees" sort={sort} setSort={setSort} />
                <SortHeader label="Cap" sortKey="cap" sort={sort} setSort={setSort} />
                <SortHeader label="Access" sortKey="access" sort={sort} setSort={setSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} setSort={setSort} />
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((view) => (
                <ErrorBoundary key={view.key} label={view.symbol ?? "This Machine"} wrap={wrapRow}>
                  <MachineRow view={view} dimmed={erroredInstances.has(view.data.instanceId)} />
                </ErrorBoundary>
              ))}
              {rows.length === 0 &&
                loading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-8" />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {rows.length === 0 && !loading && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {inChain.length === 0 ? "No Machines found on these networks yet." : "No Machines match these filters."}
        </p>
      )}

      <p className="text-muted-foreground text-xs">
        TVL is the Machine&apos;s last reported AUM in its accounting token; amounts in different tokens are not
        comparable, so sorting by TVL groups by token. Fees are annualised; {STATUS_META.healthy.label} means no warning
        condition applies.
      </p>
    </div>
  );
}
