import { useMemo } from "react";

import { BUILTIN_INSTANCES, type HubInstance, mergeInstances } from "@/config/instances";
import { useUserSettings } from "@/config/user-settings";
import { useDiscovery, userInstances } from "@/data/use-discovery";

/**
 * Every hub instance: built-in, then discovered, then user-added, deduplicated on `(chainId, hubCoreRegistry)`.
 * Hubs the user hid in Settings are left out unless `includeHidden`.
 */
export function useInstances({ includeHidden = false } = {}): HubInstance[] {
  const settings = useUserSettings();
  const discovery = useDiscovery();
  return useMemo(() => {
    const all = mergeInstances(BUILTIN_INSTANCES, discovery.data?.instances ?? [], userInstances(settings));
    return includeHidden ? all : all.filter((i) => !settings.hiddenHubs.includes(i.id));
  }, [discovery.data, settings, includeHidden]);
}
