import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";
import { useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";

import { ACCESS_MANAGER, BUILTIN_INSTANCES, type HubInstance, instanceId } from "@/config/instances";
import { useUserSettings } from "@/config/user-settings";
import { classifyRegistry } from "@/data/discovery";
import { findDeploymentBlock } from "@/lib/start-block";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

export type Probe = {
  chainId: number;
  registry: Address;
  result: "hub" | "spoke" | "none" | "noInfrastructure" | "error";
  error?: string;
};

export type DiscoveryResult = { instances: HubInstance[]; probes: Probe[]; scannedAt: number };

export function userInstances(settings: ReturnType<typeof useUserSettings>): HubInstance[] {
  return settings.instances.map((i) => ({
    id: instanceId("user", i.chainId, i.hubCoreRegistry),
    chainId: i.chainId,
    hubCoreRegistry: i.hubCoreRegistry,
    startBlock: BigInt(i.startBlock),
    source: "user" as const,
    knownFactories: [],
    factoryImplementations: {},
  }));
}

const key = (chainId: number, registry: Address) => `${chainId}:${registry.toLowerCase()}`;

/**
 * Chain discovery: every configured chain × every known hub registry address (Makina deploys its registries at
 * the same address on each chain). Pairs already configured are skipped; chains without Makina's AccessManager
 * are skipped with one `eth_getCode`. Results are cached for 7 days; "Rescan networks" in Settings refetches.
 */
export function useDiscovery() {
  const config = useConfig();
  const settings = useUserSettings();

  const chainIds = useMemo(() => config.chains.map((c) => c.id).sort((a, b) => a - b), [config.chains]);
  const known = useMemo(() => [...BUILTIN_INSTANCES, ...userInstances(settings)], [settings]);
  const registries = useMemo(
    () => [...new Set(known.map((i) => i.hubCoreRegistry.toLowerCase()))].sort() as Address[],
    [known],
  );

  return useQuery({
    queryKey: ["discovery", chainIds, registries],
    queryFn: async (): Promise<DiscoveryResult> => {
      const configured = new Set(known.map((i) => key(i.chainId, i.hubCoreRegistry)));
      const probes: Probe[] = [];
      const instances: HubInstance[] = [];

      await Promise.all(
        chainIds.map(async (chainId) => {
          const client = getPublicClient(config, { chainId });
          if (!client) return;
          const pending = registries.filter((r) => !configured.has(key(chainId, r)));
          if (pending.length === 0) return;

          try {
            const code = await client.getCode({ address: ACCESS_MANAGER });
            if (!code || code === "0x") {
              for (const registry of pending) probes.push({ chainId, registry, result: "noInfrastructure" });
              return;
            }
          } catch (error) {
            for (const registry of pending) {
              probes.push({ chainId, registry, result: "error", error: (error as Error).message.split("\n")[0] });
            }
            return;
          }

          for (const registry of pending) {
            try {
              const kind = await classifyRegistry(client, registry);
              if (kind.kind !== "hub") {
                probes.push({ chainId, registry, result: kind.kind });
                continue;
              }
              const startBlock = await findDeploymentBlock(client, registry);
              probes.push({ chainId, registry, result: "hub" });
              instances.push({
                id: instanceId("discovered", chainId, registry),
                chainId,
                hubCoreRegistry: registry,
                startBlock,
                source: "discovered",
                knownFactories: [],
                factoryImplementations: {},
              });
            } catch (error) {
              probes.push({ chainId, registry, result: "error", error: (error as Error).message.split("\n")[0] });
            }
          }
        }),
      );

      probes.sort((a, b) => a.chainId - b.chainId);
      return { instances, probes, scannedAt: Date.now() };
    },
    staleTime: WEEK_MS,
    gcTime: WEEK_MS,
    retry: 1,
  });
}
