import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import type { HubInstance } from "@/config/instances";
import { fetchUserBalances, fetchUserRequests } from "@/data/fetch-user-data";
import { useInstanceSnapshot } from "@/data/hub-store";
import type { MachineData } from "@/data/types";
import { publishUser, removeUser } from "@/data/user-store";
import type { UserSnapshot } from "@/data/user-types";

const MINUTE = 60_000;

/**
 * Loads one viewer's standing on one hub instance from chain state and publishes it to the user store. Renders
 * nothing. Balances, allowances and pre-check reads in one round of multicalls, then the redemption requests
 * (fetch-user-data.ts). History is separate and on demand (activity.ts).
 */
export function UserScanner({ instance, user }: { instance: HubInstance; user: Address }) {
  const { chainId } = instance;
  const client = usePublicClient({ chainId });
  const queryClient = useQueryClient();
  const hub = useInstanceSnapshot(instance.id);

  const machines: MachineData[] = useMemo(() => Object.values(hub?.machineData ?? {}), [hub?.machineData]);
  const machineAddresses = useMemo(() => machines.map((m) => m.machine.toLowerCase()).sort(), [machines]);

  const balances = useQuery({
    queryKey: ["user", chainId, "balances", user.toLowerCase(), machineAddresses],
    queryFn: () => fetchUserBalances(client!, { user, machines }),
    enabled: client !== undefined && machines.length > 0,
    staleTime: 30_000,
    refetchInterval: MINUTE,
    placeholderData: keepPreviousData,
  });

  const byMachine = balances.data?.byMachine;
  const requestKey = useMemo(
    () =>
      machines.map((m) => [
        m.machine.toLowerCase(),
        String(byMachine?.[m.machine.toLowerCase()]?.requestNfts ?? ""),
        String(m.redeemerInfo.nextRequestId ?? ""),
        // Re-read when the queue moves (a request becomes claimable).
        String(m.redeemerInfo.lastFinalizedRequestId ?? ""),
      ]),
    [machines, byMachine],
  );
  const requests = useQuery({
    queryKey: ["user", chainId, "requests", user.toLowerCase(), requestKey],
    queryFn: () => fetchUserRequests(client!, { chainId, user, machines, byMachine: byMachine! }),
    enabled: client !== undefined && byMachine !== undefined,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["user", chainId] });
  }, [queryClient, chainId]);

  const error = balances.error?.message ?? requests.error?.message;

  useEffect(() => {
    const snapshot: UserSnapshot = {
      instance,
      user,
      balancesReady: balances.data !== undefined,
      requestsReady: requests.data !== undefined,
      nativeBalance: balances.data?.nativeBalance,
      byMachine: balances.data?.byMachine ?? {},
      requests: requests.data ?? [],
      updatedAt: balances.dataUpdatedAt || undefined,
      error,
      refetch,
    };
    publishUser(snapshot);
  });

  // Drop this viewer's snapshot when the scanner unmounts (viewer or instance changed).
  useEffect(() => () => removeUser(instance.id, user), [instance.id, user]);

  return null;
}
