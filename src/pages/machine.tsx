import { ExternalLink, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { getAddress, isAddress, maxUint256 } from "viem";
import { useChains } from "wagmi";

import { ActionPanel } from "@/components/action-panel";
import { Address } from "@/components/address";
import { Amount } from "@/components/amount";
import { AccessBadge, StatusBadge } from "@/components/badges";
import { LearnMore } from "@/components/learn-more";
import { CapBar } from "@/components/cap-bar";
import { ChainIcon } from "@/components/chain-icon";
import { ErrorBoundary } from "@/components/error-boundary";
import { RelativeTime } from "@/components/relative-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { YourPosition } from "@/components/your-position";
import { Button } from "@/components/ui/button";
import { makinaAppStrategyUrl } from "@/config/app";
import { useUserSettings, writeUserSettings } from "@/config/user-settings";
import { useInstanceSnapshot, useInstanceSnapshots } from "@/data/hub-store";
import { type MachineView, toMachineView } from "@/data/machine-view";
import { useNowSeconds } from "@/hooks/use-now";
import { formatDuration, formatWadPercent } from "@/lib/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto text-right">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary label={title}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">{children}</dl>
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
}

function Rate({ value }: { value: bigint | undefined }) {
  return value === undefined ? <span className="text-muted-foreground">–</span> : <>{formatWadPercent(value)}</>;
}

/**
 * Machines of hubs this release does not ship (discovered or added by hand) are read-only until the user confirms
 * the hub's registry address. A lookalike registry is the obvious phishing route during an outage.
 */
function UnverifiedHubBanner({ view }: { view: MachineView }) {
  const hub = useInstanceSnapshot(view.data.instanceId);
  const settings = useUserSettings();
  const [checked, setChecked] = useState(false);
  if (view.verifiedHub || !hub) return null;
  const id = hub.instance.id;
  const unlocked = settings.unlockedHubs.includes(id);

  return (
    <div role="alert" className="border-warning/40 bg-warning/10 flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <p className="flex items-start gap-2">
        <ShieldAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>Unverified hub</strong> ({hub.instance.source === "user" ? "added by you" : "found on this network"}
          ), not built into this release. Registry{" "}
          <span className="font-mono break-all">{hub.instance.hubCoreRegistry}</span>.{" "}
          {unlocked ? "Unlocked: deposits and redemptions are enabled." : "View only until you unlock it."}{" "}
          <LearnMore topic="hubs" />
        </span>
      </p>
      {!unlocked && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            This registry address comes from an official Makina source.
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!checked}
            onClick={() => writeUserSettings({ unlockedHubs: [...settings.unlockedHubs, id] })}
          >
            Unlock this hub
          </Button>
        </div>
      )}
    </div>
  );
}

function Header({ view, now }: { view: MachineView; now: bigint }) {
  const chains = useChains();
  const chain = chains.find((c) => c.id === view.data.chainId);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ChainIcon id={view.data.chainId} name={chain?.name} />
            {chain?.name ?? `Chain ${view.data.chainId}`}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{view.name ?? "Unknown Machine"}</h1>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-sm">{view.symbol}</span>
            <StatusBadge status={view.status} conditions={view.conditions} verifiedHub={view.verifiedHub} />
          </div>
        </div>
        {view.symbol && (
          <a
            href={makinaAppStrategyUrl(view.symbol)}
            target="_blank"
            rel="noreferrer"
            className="text-brand inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            Open in Makina app
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <dt className="text-muted-foreground text-xs">TVL</dt>
          <dd className="text-lg font-semibold">
            <Amount value={view.tvl} decimals={view.accountingDecimals} symbol={view.accountingSymbol} />
          </dd>
        </Card>
        <Card className="p-4">
          <dt className="text-muted-foreground text-xs">Share price</dt>
          <dd className="text-lg font-semibold">
            <Amount
              value={view.sharePrice}
              decimals={view.accountingDecimals}
              symbol={view.accountingSymbol}
              compact={false}
            />
          </dd>
        </Card>
        <Card className="col-span-2 p-4 sm:col-span-1">
          <dt className="text-muted-foreground text-xs">Last accounting</dt>
          <dd className="text-lg font-semibold">
            <RelativeTime unixSeconds={view.data.lastGlobalAccountingTime} nowSeconds={now} />
            {view.accountingStale && <span className="text-warning ml-2 text-xs font-medium">Stale</span>}
          </dd>
        </Card>
      </dl>

      <UnverifiedHubBanner view={view} />
      {view.data.recoveryMode && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
        >
          <strong>Recovery mode.</strong> Deposits and new redemption requests are disabled and pending requests cannot
          be finalized. Requests that are already finalized can still be claimed.
        </div>
      )}
      {view.accountingStale && !view.data.recoveryMode && (
        <div role="alert" className="border-warning/40 bg-warning/10 text-warning rounded-lg border p-3 text-sm">
          <strong>Accounting is stale.</strong> The share price was last updated{" "}
          <RelativeTime unixSeconds={view.data.lastGlobalAccountingTime} nowSeconds={now} />, longer ago than this
          Machine&apos;s {formatDuration(view.data.caliberStaleThreshold ?? 0n)} threshold. Deposits are priced from
          that last update.
        </div>
      )}
    </div>
  );
}

function MachineDetails({ view, now }: { view: MachineView; now: bigint }) {
  const { data } = view;
  const chainId = data.chainId;
  const health = view.health;

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <Header view={view} now={now} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4 lg:order-2">
          <div className="lg:sticky lg:top-20 flex flex-col gap-4">
            <ErrorBoundary label="Actions">
              <ActionPanel view={view} />
            </ErrorBoundary>
            <ErrorBoundary label="Your position">
              <YourPosition view={view} />
            </ErrorBoundary>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:order-1">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Section title="Fees">
              <Row label="Management (annual)">
                <Rate value={view.fees.management} />
              </Row>
              <Row label="Performance">
                <Rate value={view.fees.performance} />
              </Row>
              <Row label="Security Module (annual)">
                <Rate value={view.fees.securityModule} />
              </Row>
              <Row label="Redemption">
                <Rate value={view.fees.redemption} />
              </Row>
            </Section>

            <Section title="Redemption queue">
              {view.redeemerClosed ? (
                <Row label="Status">Redemptions closed</Row>
              ) : (
                <>
                  <Row label="Pending requests">
                    <span className="tabular-nums">{view.pending === undefined ? "–" : view.pending.toString()}</span>
                  </Row>
                  <Row label="Finalization delay">
                    {data.redeemerInfo.finalizationDelay === undefined
                      ? "–"
                      : formatDuration(data.redeemerInfo.finalizationDelay)}
                  </Row>
                  <Row label="Minimum redemption">
                    <Amount
                      value={data.redeemerInfo.minRedeemAmount}
                      decimals={view.shareDecimals}
                      symbol={view.symbol}
                    />
                  </Row>
                  <Row label="Last finalized request">
                    {data.redeemerInfo.lastFinalizedRequestId === undefined
                      ? "–"
                      : data.redeemerInfo.lastFinalizedRequestId === 0n
                        ? "None yet"
                        : `#${data.redeemerInfo.lastFinalizedRequestId}`}
                  </Row>
                  <Row label="Oldest pending request">
                    {view.pending === 0n ? (
                      "None"
                    ) : health?.oldestPendingRequestTime !== undefined ? (
                      <span>
                        #{(data.redeemerInfo.lastFinalizedRequestId ?? 0n) + 1n}, created{" "}
                        <RelativeTime unixSeconds={health.oldestPendingRequestTime} nowSeconds={now} />
                      </span>
                    ) : (
                      "–"
                    )}
                  </Row>
                  <Row label="Queue">
                    {view.queueStalled ? (
                      <span className="text-warning inline-flex items-center gap-1 font-medium">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        Stalled
                      </span>
                    ) : view.queueStalled === false ? (
                      "Moving"
                    ) : (
                      "–"
                    )}
                  </Row>
                </>
              )}
            </Section>

            <Section title="Limits">
              <Row label="Share cap">
                {data.shareLimit === maxUint256 ? (
                  "No cap"
                ) : (
                  <Amount value={data.shareLimit} decimals={view.shareDecimals} symbol={view.symbol} />
                )}
              </Row>
              <Row label="Cap used">
                <CapBar usage={view.cap} />
              </Row>
              <Row label="Cap headroom">
                {data.maxMint === maxUint256 ? (
                  "Unlimited"
                ) : (
                  <Amount value={data.maxMint} decimals={view.shareDecimals} symbol={view.symbol} />
                )}
              </Row>
              <Row label="Access">
                <AccessBadge access={view.access} />
              </Row>
              <Row label="Sanctions screening">
                {data.depositorInfo.isSanctionsCheckEnabled === undefined
                  ? "–"
                  : data.depositorInfo.isSanctionsCheckEnabled
                    ? "On"
                    : "Off"}
              </Row>
            </Section>

            <Section title="Contracts and roles">
              <Row label="Machine">
                <Address address={data.machine} chainId={chainId} />
              </Row>
              <Row label="Share token">
                <Address address={data.shareToken} chainId={chainId} />
              </Row>
              <Row label={`Accounting token${view.accountingSymbol ? ` (${view.accountingSymbol})` : ""}`}>
                <Address address={data.accountingToken} chainId={chainId} />
              </Row>
              <Row label={`Depositor${view.depositorKind ? ` (${view.depositorKind})` : ""}`}>
                <Address address={data.depositor} chainId={chainId} />
              </Row>
              <Row label={`Redeemer${view.redeemerKind ? ` (${view.redeemerKind})` : ""}`}>
                <Address address={data.redeemer} chainId={chainId} />
              </Row>
              <Row label={`Fee manager${view.feeManagerKind ? ` (${view.feeManagerKind})` : ""}`}>
                <Address address={data.feeManager} chainId={chainId} />
              </Row>
              <Row label="Operator">
                <Address address={data.roles.operator} chainId={chainId} />
              </Row>
              <Row label="Mechanic">
                <Address address={data.roles.mechanic} chainId={chainId} />
              </Row>
              <Row label="Risk manager">
                <Address address={data.roles.riskManager} chainId={chainId} />
              </Row>
              <Row label="Security council">
                <Address address={data.roles.securityCouncil} chainId={chainId} />
              </Row>
            </Section>
          </div>

          {(view.depositorKind === undefined && !view.depositorClosed && data.depositor !== undefined) ||
          (view.redeemerKind === undefined && !view.redeemerClosed && data.redeemer !== undefined) ? (
            <p className="text-muted-foreground text-sm">
              Some of this Machine&apos;s contracts are not supported here, so those actions are read-only.{" "}
              <LearnMore topic="statuses" />
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MachinePage() {
  const params = useParams();
  const chainId = Number(params.chainId);
  const address = params.address && isAddress(params.address) ? getAddress(params.address) : undefined;
  const snapshots = useInstanceSnapshots();
  const now = useNowSeconds();

  const onChain = useMemo(() => snapshots.filter((s) => s.instance.chainId === chainId), [snapshots, chainId]);
  const found = useMemo(() => {
    if (!address) return undefined;
    for (const s of onChain) {
      const data = s.machineData[address.toLowerCase()];
      if (data) return { data, health: data.redeemer ? s.queueHealth[data.redeemer.toLowerCase()] : undefined };
    }
    return undefined;
  }, [onChain, address]);
  const view = found ? toMachineView(found.data, found.health, now) : undefined;

  if (!address || !Number.isInteger(chainId)) {
    return <NotFound message="This link does not point to a valid address." />;
  }
  if (view) return <MachineDetails view={view} now={now} />;

  const scanning = onChain.length === 0 || onChain.some((s) => s.phase === "machines" || s.phase === "machineData");
  if (scanning) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
        <p className="text-muted-foreground text-sm">Reading this Machine from the chain…</p>
      </div>
    );
  }
  return <NotFound message={`No Makina Machine at ${address} on chain ${chainId}.`} />;
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Machine not found</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
      <Link className="text-brand text-sm underline" to="/">
        Back to Explore
      </Link>
    </div>
  );
}
