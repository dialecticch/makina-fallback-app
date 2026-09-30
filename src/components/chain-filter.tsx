import { createContext, useContext, useMemo } from "react";
import { useChains } from "wagmi";

import { useInstances } from "@/data/use-instances";
import { useLocalStorage } from "@/hooks/use-local-storage";

type ChainFilter = { chainId: number | "all"; setChainId: (value: number | "all") => void };

const ChainFilterContext = createContext<ChainFilter>({ chainId: "all", setChainId: () => {} });

export function ChainFilterProvider({ children }: { children: React.ReactNode }) {
  const [chainId, setChainId] = useLocalStorage<number | "all">("makina-fallback:chain-filter", "all");
  const value = useMemo(() => ({ chainId, setChainId }), [chainId, setChainId]);
  return <ChainFilterContext.Provider value={value}>{children}</ChainFilterContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChainFilter() {
  return useContext(ChainFilterContext);
}

/** Chains that have at least one hub instance, in instance order. */
// eslint-disable-next-line react-refresh/only-export-components
export function useInstanceChains() {
  const instances = useInstances();
  const chains = useChains();
  return useMemo(() => {
    const ids = [...new Set(instances.map((i) => i.chainId))];
    return ids.map((id) => ({ id, name: chains.find((c) => c.id === id)?.name ?? `Chain ${id}` }));
  }, [instances, chains]);
}

export function ChainFilterSelect() {
  const { chainId, setChainId } = useChainFilter();
  const chains = useInstanceChains();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Network</span>
      <select
        className="border-input bg-card h-9 rounded-md border px-2 text-sm"
        value={String(chainId)}
        onChange={(e) => setChainId(e.target.value === "all" ? "all" : Number(e.target.value))}
      >
        <option value="all">All networks</option>
        {chains.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
