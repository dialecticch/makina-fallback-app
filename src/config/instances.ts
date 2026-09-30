import { type Address, isAddressEqual } from "viem";

import { CANDIDATE_CHAINS } from "./chains.ts";

/**
 * A Makina instance: a hub chain hosting Machines (plus the spokes those Machines' Calibers use, which this app
 * never calls). Kept free of `@/` imports so Node scripts can import it directly.
 */
export type HubInstance = {
  id: string;
  chainId: number;
  hubCoreRegistry: Address;
  /** Configured for built-in instances; derived from the first Machine for discovered and user-added ones. */
  hubPeripheryRegistry?: Address;
  /** Block the registry was deployed at: activity scans start here. Never 0. */
  startBlock: bigint;
  /**
   * Only built-in hubs are verified: they ship with this release. Discovered and user-added hubs are read-only
   * until the user unlocks them.
   */
  source: "builtin" | "discovered" | "user";
  /** Built-in only (see `BuiltinHub` in chains.ts). */
  knownFactories: readonly Address[];
  factoryImplementations: Readonly<Record<Address, Address>>;
};

/** Makina's shared AccessManager: on every chain with Makina infrastructure, at this address. */
export const ACCESS_MANAGER: Address = "0x0fCEfa3f1047F35521A49cD8B06faBd588665d7F";

/** Built-in hubs, from the `hub` entries in chains.ts. */
export const BUILTIN_INSTANCES: readonly HubInstance[] = CANDIDATE_CHAINS.flatMap(({ chain, hub }) =>
  hub
    ? [
        {
          id: `builtin-${chain.id}-${hub.hubCoreRegistry.toLowerCase()}`,
          chainId: chain.id,
          hubCoreRegistry: hub.hubCoreRegistry,
          hubPeripheryRegistry: hub.hubPeripheryRegistry,
          startBlock: hub.startBlock,
          source: "builtin" as const,
          knownFactories: hub.knownFactories,
          factoryImplementations: hub.factoryImplementations,
        },
      ]
    : [],
);

export function instanceId(source: HubInstance["source"], chainId: number, registry: Address) {
  return `${source}-${chainId}-${registry.toLowerCase()}`;
}

/** The pinned implementation for `factory`, if this instance ships one. */
export function pinnedImplementation(instance: HubInstance, factory: Address): Address | undefined {
  const entry = Object.entries(instance.factoryImplementations).find(([f]) => isAddressEqual(f as Address, factory));
  return entry?.[1];
}

function instanceKey(instance: Pick<HubInstance, "chainId" | "hubCoreRegistry">) {
  return `${instance.chainId}:${instance.hubCoreRegistry.toLowerCase()}`;
}

/** True when `(chainId, registry)` is already one of `instances`. */
export function isKnownInstance(instances: readonly HubInstance[], chainId: number, registry: Address) {
  return instances.some((i) => instanceKey(i) === instanceKey({ chainId, hubCoreRegistry: registry }));
}

/** built-in, then discovered, then user; the first entry for a `(chainId, hubCoreRegistry)` pair wins. */
export function mergeInstances(...lists: readonly (readonly HubInstance[])[]): HubInstance[] {
  const seen = new Set<string>();
  const out: HubInstance[] = [];
  for (const instance of lists.flat()) {
    const key = instanceKey(instance);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(instance);
  }
  return out;
}
