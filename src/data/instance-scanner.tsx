import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";

import { directDepositorAbi, hubCoreRegistryAbi, hubPeripheryRegistryAbi, machineAbi } from "@/abis";
import { type HubInstance, pinnedImplementation } from "@/config/instances";
import { fetchMachineData } from "@/data/fetch-machine-data";
import { removeInstance, publishInstance } from "@/data/hub-store";
import { enumerateMachines, readImplementation, resolveFactories } from "@/data/machines";
import { readRequestTimes } from "@/data/request-times";
import type { InstanceSnapshot, InstanceWarning, LoadPhase, QueueHealth } from "@/data/types";
import { useStallWatch } from "@/hooks/use-stall-watch";
import { call, multicallLoose } from "@/lib/calls";
import { pendingRequestCount, redeemerKind } from "@/lib/derive";

const FIVE_MINUTES = 5 * 60_000;

/**
 * Loads one hub instance from chain state and publishes it to the hub store. Renders nothing. One scanner per
 * instance keeps every chain's failures local to that chain. No event logs: see machines.ts and request-times.ts.
 *
 * 1. registry → current core factory (and its implementation), periphery registry → periphery factory;
 * 2. every factory the registry has pointed at;
 * 3. Machines from the factory nonces;
 * 4. Machine data (two rounds of multicalls);
 * 5. queue health: the creation time of each redeemer's oldest pending request, from storage.
 */
export function InstanceScanner({ instance }: { instance: HubInstance }) {
  const { chainId } = instance;
  const client = usePublicClient({ chainId });

  // MARK: 1. Heads
  const heads = useQuery({
    queryKey: ["hubHeads", chainId, instance.hubCoreRegistry, instance.hubPeripheryRegistry],
    queryFn: async () => {
      const [coreFactory, peripheryFactory] = (await multicallLoose(client!, [
        call(instance.hubCoreRegistry, hubCoreRegistryAbi, "coreFactory"),
        ...(instance.hubPeripheryRegistry
          ? [call(instance.hubPeripheryRegistry, hubPeripheryRegistryAbi, "peripheryFactory")]
          : []),
      ])) as (Address | undefined)[];
      if (!coreFactory || coreFactory === zeroAddress)
        throw new Error("Could not read coreFactory() from the registry");
      const implementation = await readImplementation(client!, coreFactory).catch(() => undefined);
      return { coreFactory, peripheryFactory, implementation };
    },
    enabled: client !== undefined,
    staleTime: FIVE_MINUTES,
  });
  const currentFactory = heads.data?.coreFactory;

  // MARK: 2. Factories
  const factories = useQuery({
    queryKey: ["factories", chainId, instance.hubCoreRegistry, currentFactory],
    queryFn: () => resolveFactories(client!, instance, currentFactory!),
    enabled: client !== undefined && currentFactory !== undefined,
    staleTime: Infinity,
  });

  // MARK: 3. Machines
  const machines = useQuery({
    queryKey: ["machines", chainId, factories.data?.factories],
    queryFn: () => enumerateMachines(client!, factories.data!.factories),
    enabled: client !== undefined && factories.data !== undefined,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
    placeholderData: keepPreviousData,
  });
  const machineRefs = useMemo(() => machines.data ?? [], [machines.data]);

  // Discovered and user-added instances: the periphery registry, as reported by the first Machine's depositor or
  // redeemer. For built-in ones it is checked against the configured value (a mismatch shows a warning).
  const firstMachine = machineRefs[0]?.machine;
  const derived = useQuery({
    queryKey: ["derivedPeriphery", chainId, firstMachine],
    queryFn: async () => {
      const [depositor, redeemer] = (await multicallLoose(client!, [
        call(firstMachine!, machineAbi, "depositor"),
        call(firstMachine!, machineAbi, "redeemer"),
      ])) as (Address | undefined)[];
      const periphery = [depositor, redeemer].find((a) => a && a !== zeroAddress);
      if (!periphery) return { registry: undefined, factory: undefined };
      const [registry] = (await multicallLoose(client!, [
        call(periphery, directDepositorAbi, "peripheryRegistry"),
      ])) as (Address | undefined)[];
      if (!registry) return { registry: undefined, factory: undefined };
      const [factory] = (await multicallLoose(client!, [
        call(registry, hubPeripheryRegistryAbi, "peripheryFactory"),
      ])) as (Address | undefined)[];
      return { registry, factory };
    },
    enabled: client !== undefined && firstMachine !== undefined,
    staleTime: Infinity,
  });

  // MARK: 4. Machine data
  const peripheryFactory = heads.data?.peripheryFactory ?? derived.data?.factory;
  const peripheryKnown = instance.hubPeripheryRegistry !== undefined || derived.isFetched;
  const machineData = useQuery({
    queryKey: ["machineData", chainId, instance.id, machineRefs.map((m) => m.machine), peripheryFactory],
    queryFn: () =>
      fetchMachineData(client!, {
        chainId,
        instanceId: instance.id,
        verifiedHub: instance.source === "builtin",
        machines: machineRefs,
        peripheryFactory,
      }),
    enabled: client !== undefined && machineRefs.length > 0 && peripheryKnown,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
    placeholderData: keepPreviousData,
  });

  // MARK: 5. Queue health
  const oldestPending = useMemo(
    () =>
      Object.values(machineData.data ?? {}).flatMap((d) => {
        const pending = pendingRequestCount(d.redeemerInfo.nextRequestId, d.redeemerInfo.lastFinalizedRequestId);
        // Only redeemers whose storage layout is known (request-times.ts).
        if (!d.redeemer || !pending || !redeemerKind(d.redeemerInfo.implemId)) return [];
        return [{ redeemer: d.redeemer, id: d.redeemerInfo.lastFinalizedRequestId! + 1n }];
      }),
    [machineData.data],
  );
  const queue = useQuery({
    queryKey: ["queueHealth", chainId, oldestPending.map((p) => [p.redeemer.toLowerCase(), p.id.toString()])],
    queryFn: async () => {
      const times = await Promise.all(oldestPending.map((p) => readRequestTimes(client!, p.redeemer, [p.id])));
      return Object.fromEntries(
        oldestPending.map((p, i): [string, QueueHealth] => [
          p.redeemer.toLowerCase(),
          { oldestPendingRequestTime: times[i]![0] },
        ]),
      );
    },
    enabled: client !== undefined && oldestPending.length > 0,
    staleTime: Infinity,
  });

  // MARK: Publish

  const refetch = useCallback(() => {
    void heads.refetch();
    void machines.refetch();
    void machineData.refetch();
  }, [heads, machines, machineData]);

  const warnings = useMemo(() => {
    const out: InstanceWarning[] = [];
    if (instance.source === "builtin" && currentFactory && heads.data) {
      const pinned = pinnedImplementation(instance, currentFactory);
      const live = heads.data.implementation;
      if (!pinned || !live || !isAddressEqual(pinned, live))
        out.push({ kind: "factoryUpgraded", factory: currentFactory });
    }
    if (factories.data?.complete === false) out.push({ kind: "factoryHistoryUnknown" });
    const reported = derived.data?.registry;
    if (instance.hubPeripheryRegistry && reported && !isAddressEqual(instance.hubPeripheryRegistry, reported)) {
      out.push({ kind: "peripheryMismatch", reported });
    }
    return out;
  }, [instance, currentFactory, heads.data, factories.data, derived.data]);

  let phase: LoadPhase = "ready";
  if (machines.data === undefined) phase = "machines";
  else if (machineRefs.length > 0 && machineData.data === undefined) phase = "machineData";
  else if (oldestPending.length > 0 && queue.data === undefined && !queue.isError) phase = "health";

  const error =
    heads.error?.message ?? factories.error?.message ?? machines.error?.message ?? machineData.error?.message;
  const stalledForMs = useStallWatch(phase, phase === "ready" || error !== undefined);

  useEffect(() => {
    const snapshot: InstanceSnapshot = {
      instance,
      phase,
      factories: factories.data?.factories,
      peripheryFactory,
      machines: machineRefs,
      machineData: machineData.data ?? {},
      queueHealth: queue.data ?? {},
      dataUpdatedAt: machineData.dataUpdatedAt || undefined,
      warnings,
      stalledForMs,
      error,
      refetch,
    };
    publishInstance(snapshot);
  });

  // Drop this instance's snapshot when it is removed or hidden.
  useEffect(() => () => removeInstance(instance.id), [instance.id]);

  return null;
}
