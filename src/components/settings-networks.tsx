import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader, Lock, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { isAddress } from "viem";
import { useChains } from "wagmi";

import { ChainIcon } from "@/components/chain-icon";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getChainConfig } from "@/config/chains";
import { isKnownInstance } from "@/config/instances";
import { envRpcUrls, readUserSettings, useUserSettings, writeUserSettings } from "@/config/user-settings";
import { useDiscovery } from "@/data/use-discovery";
import { useInstances } from "@/data/use-instances";
import { validateUserInstance, type ValidationStep } from "@/data/validate-instance";
import { abbreviateAddress } from "@/lib/format";
import { parseRpcUrls, rpcChainId } from "@/lib/rpc-urls";

function ReloadNote() {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-xs">
      Saved. Reload the app to apply.
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => window.location.reload()}>
        Reload now
      </Button>
    </p>
  );
}

const SOURCE_LABEL = { builtin: "Built in", discovered: "Discovered", user: "Added by you" } as const;

const toggle = (list: string[], id: string, on: boolean) =>
  on ? [...new Set([...list, id])] : list.filter((x) => x !== id);

/** Hubs the app knows, with Rescan (runtime discovery), hide/show, lock, and removal of user-added ones. */
export function NetworksPanel() {
  const instances = useInstances({ includeHidden: true });
  const chains = useChains();
  const discovery = useDiscovery();
  const queryClient = useQueryClient();
  const settings = useUserSettings();
  const [changed, setChanged] = useState(false);

  const failures = discovery.data?.probes.filter((p) => p.result === "error") ?? [];

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {instances.map((i) => {
          const chain = chains.find((c) => c.id === i.chainId);
          const hidden = settings.hiddenHubs.includes(i.id);
          const unlocked = settings.unlockedHubs.includes(i.id);
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <ChainIcon id={i.chainId} name={chain?.name} />
              <span className={hidden ? "text-muted-foreground font-medium line-through" : "font-medium"}>
                {chain?.name ?? `Chain ${i.chainId}`}
              </span>
              <span className="text-muted-foreground font-mono" title={i.hubCoreRegistry}>
                {abbreviateAddress(i.hubCoreRegistry)}
              </span>
              <span className="text-muted-foreground ml-auto">
                {SOURCE_LABEL[i.source]}
                {i.source !== "builtin" && (unlocked ? " · unlocked" : " · read-only")}
              </span>
              {i.source !== "builtin" && unlocked && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={`Lock actions on the ${chain?.name ?? i.chainId} hub again`}
                  title="Lock this hub again (view only)"
                  onClick={() => writeUserSettings({ unlockedHubs: toggle(settings.unlockedHubs, i.id, false) })}
                >
                  <Lock aria-hidden />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={`${hidden ? "Show" : "Hide"} the ${chain?.name ?? i.chainId} hub`}
                title={hidden ? "Show this hub" : "Hide this hub (it is no longer loaded)"}
                onClick={() => {
                  writeUserSettings({ hiddenHubs: toggle(settings.hiddenHubs, i.id, !hidden) });
                  setChanged(true);
                }}
              >
                {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              </Button>
              {i.source === "user" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={`Remove the custom hub on ${chain?.name ?? i.chainId}`}
                  onClick={() => {
                    writeUserSettings({
                      instances: settings.instances.filter(
                        (s) =>
                          !(
                            s.chainId === i.chainId &&
                            s.hubCoreRegistry.toLowerCase() === i.hubCoreRegistry.toLowerCase()
                          ),
                      ),
                      unlockedHubs: toggle(settings.unlockedHubs, i.id, false),
                    });
                    setChanged(true);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {changed && <ReloadNote />}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={discovery.isFetching}
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["discovery"] })}
        >
          {discovery.isFetching ? <Loader className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Rescan networks
        </Button>
        {discovery.data && (
          <span className="text-muted-foreground text-xs">
            Scanned <RelativeTime unixSeconds={Math.floor(discovery.data.scannedAt / 1000)} />:{" "}
            {discovery.data.instances.length} new hub{discovery.data.instances.length === 1 ? "" : "s"}
            {failures.length > 0 && `, ${failures.length} network${failures.length === 1 ? "" : "s"} unreachable`}
          </span>
        )}
      </div>
      {failures.length > 0 && (
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer">Unreachable</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {failures.map((p) => (
              <li key={`${p.chainId}:${p.registry}`}>
                {chains.find((c) => c.id === p.chainId)?.name ?? p.chainId}: {p.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Add a custom hub by hand, validated before it is saved. RPCs only for chains the app does not ship. */
export function AddInstancePanel() {
  const known = useInstances({ includeHidden: true });
  const [chainId, setChainId] = useState("");
  const [name, setName] = useState("");
  const [rpcText, setRpcText] = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [nativeSymbol, setNativeSymbol] = useState("");
  const [registry, setRegistry] = useState("");
  const [step, setStep] = useState<ValidationStep | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [added, setAdded] = useState(false);
  const busy = step !== undefined;
  const shipped = /^[0-9]+$/.test(chainId) ? getChainConfig(Number(chainId)) : undefined;
  const newChain = /^[0-9]+$/.test(chainId) && !shipped;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const { urls, invalid } = parseRpcUrls(newChain ? rpcText : "");
        if (invalid.length > 0) {
          setError(`Not a usable RPC URL: ${invalid.join(", ")} (https only, or http to a local node).`);
          return;
        }
        if (isAddress(registry, { strict: false }) && isKnownInstance(known, Number(chainId), registry)) {
          setError("This hub is already in the list.");
          return;
        }
        setError(undefined);
        setAdded(false);
        validateUserInstance(
          { chainId: Number(chainId), name, rpcUrls: urls, registry, explorerUrl, nativeSymbol },
          setStep,
        )
          .then((instance) => {
            const { instances } = readUserSettings();
            writeUserSettings({ instances: [...instances, instance] });
            setAdded(true);
          })
          .catch((err: Error) => setError(err.message.split("\n")[0]))
          .finally(() => setStep(undefined));
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        Chain ID
        <Input inputMode="numeric" value={chainId} onChange={(e) => setChainId(e.target.value.trim())} required />
        {shipped && <span className="text-muted-foreground">{shipped.chain.name}: built in, uses its RPCs.</span>}
      </label>
      <label className="flex flex-col gap-1 text-xs">
        HubCoreRegistry address
        <Input className="font-mono" value={registry} onChange={(e) => setRegistry(e.target.value.trim())} required />
      </label>
      {newChain && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Network name
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Native token symbol
              <Input value={nativeSymbol} onChange={(e) => setNativeSymbol(e.target.value)} placeholder="ETH" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            RPC URLs (one per line)
            <textarea
              className="border-input bg-card min-h-16 rounded-md border px-3 py-2 font-mono text-xs"
              value={rpcText}
              onChange={(e) => setRpcText(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Block explorer URL (optional)
            <Input value={explorerUrl} onChange={(e) => setExplorerUrl(e.target.value.trim())} placeholder="https://" />
          </label>
        </>
      )}
      <Button type="submit" size="sm" className="w-fit" disabled={busy}>
        {busy && <Loader className="animate-spin" aria-hidden />}
        {busy ? `Validating: ${step}…` : "Validate and add"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      {added && <ReloadNote />}
    </form>
  );
}

/** Extra RPC URLs per chain, tried before the public list. The main fix for rate limits. */
export function RpcPanel() {
  const chains = useChains();
  const settings = useUserSettings();
  const [chainId, setChainId] = useState(String(chains[0]?.id ?? 1));
  const [text, setText] = useState(() => (settings.rpcUrls[chainId] ?? []).join("\n"));
  const [error, setError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const fromEnv = envRpcUrls(Number(chainId)).length;
  const fromInstances = settings.instances
    .filter((i) => i.chainId === Number(chainId))
    .flatMap((i) => i.rpcUrls).length;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        Network
        <select
          className="border-input bg-card h-8 rounded-md border px-2 text-xs"
          value={chainId}
          onChange={(e) => {
            setChainId(e.target.value);
            setText((settings.rpcUrls[e.target.value] ?? []).join("\n"));
            setSaved(false);
            setError(undefined);
          }}
        >
          {chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="sr-only" htmlFor="rpc-urls">
        RPC URLs, one per line
      </label>
      <textarea
        id="rpc-urls"
        className="border-input bg-card min-h-20 rounded-md border px-3 py-2 font-mono text-xs"
        placeholder="https://your-rpc.example (one per line)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />
      {fromEnv > 0 && (
        <p className="text-muted-foreground text-xs">
          Plus {fromEnv} RPC{fromEnv === 1 ? "" : "s"} from VITE_RPC_URLS_{chainId} in this build.
        </p>
      )}
      {fromInstances > 0 && (
        <p className="text-muted-foreground text-xs">
          Plus {fromInstances} RPC{fromInstances === 1 ? "" : "s"} from your custom hub on this network.
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={checking}
        onClick={() => {
          const { urls, invalid } = parseRpcUrls(text);
          if (invalid.length > 0) {
            setError(`Not a usable RPC URL: ${invalid.join(", ")} (https only, or http to a local node).`);
            return;
          }
          setError(undefined);
          setChecking(true);
          // Every RPC must answer with this network's chain ID, so a Base RPC never serves Ethereum reads.
          void Promise.all(
            urls.map((url) =>
              rpcChainId(url).then(
                (id) => (id === Number(chainId) ? undefined : `${new URL(url).host} is on chain ${id}`),
                (err: Error) => `${new URL(url).host} did not answer (${err.message})`,
              ),
            ),
          )
            .then((problems) => {
              const problem = problems.find((p) => p !== undefined);
              if (problem) {
                setError(`Not saved: ${problem}.`);
                return;
              }
              writeUserSettings({ rpcUrls: { ...readUserSettings().rpcUrls, [chainId]: urls } });
              setSaved(true);
            })
            .finally(() => setChecking(false));
        }}
      >
        {checking && <Loader className="animate-spin" aria-hidden />}
        {checking ? "Checking…" : "Save RPCs"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      {saved && <ReloadNote />}
    </div>
  );
}
