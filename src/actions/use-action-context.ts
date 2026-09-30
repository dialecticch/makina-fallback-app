import { useMemo } from "react";
import { useChains, useConnection } from "wagmi";

import type { HubAnchor } from "@/actions/plans";
import { useViewer } from "@/components/viewer";
import { useUserSettings } from "@/config/user-settings";
import { useInstanceSnapshot } from "@/data/hub-store";
import type { MachineView } from "@/data/machine-view";
import { userKey, useUserSnapshot } from "@/data/user-store";
import type { PreCheckContext } from "@/lib/pre-checks";

/**
 * What every action on a Machine needs: who is acting, from which chain, their pre-check reads, and the hub the
 * Machine belongs to (to verify the transaction's targets through the wallet's RPC).
 */
export function useActionContext(view: MachineView) {
  const { address: account, chainId: walletChainId } = useConnection();
  const { readOnly } = useViewer();
  const chains = useChains();
  const settings = useUserSettings();
  const hub = useInstanceSnapshot(view.data.instanceId);
  const snapshot = useUserSnapshot(account ? userKey(view.data.instanceId, account) : undefined);

  const chainId = view.data.chainId;
  const instance = hub?.instance;
  const anchor: HubAnchor | undefined = useMemo(
    () =>
      instance && {
        hubCoreRegistry: instance.hubCoreRegistry,
        hubPeripheryRegistry: instance.hubPeripheryRegistry,
        // Built-in hubs: only the factories pinned in this release. Others: what the hub reported (unlocked by hand).
        trustedFactories: instance.source === "builtin" ? instance.knownFactories : (hub?.factories ?? []),
      },
    [instance, hub?.factories],
  );

  const pre: PreCheckContext = {
    readOnly,
    account,
    walletChainId,
    chainName: chains.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`,
    user: snapshot?.byMachine[view.data.machine.toLowerCase()],
    nativeBalance: snapshot?.nativeBalance,
    hubUnlocked: settings.unlockedHubs.includes(view.data.instanceId),
  };

  return {
    ...pre,
    chainId,
    hub: anchor,
    /** Forms remount (resetting their state and abandoning any flow) when chain, Machine, account or wallet chain change. */
    resetKey: `${chainId}:${view.data.machine.toLowerCase()}:${account?.toLowerCase() ?? "-"}:${walletChainId ?? "-"}`,
  };
}

export type ActionContext = ReturnType<typeof useActionContext>;
