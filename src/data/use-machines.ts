import { useMemo } from "react";

import { useInstanceSnapshots } from "@/data/hub-store";
import { type MachineView, toMachineView } from "@/data/machine-view";
import { useNowSeconds } from "@/hooks/use-now";

/** Every Machine found so far on every instance, as display-ready views. */
export function useMachineViews(): MachineView[] {
  const snapshots = useInstanceSnapshots();
  const now = useNowSeconds();
  return useMemo(
    () =>
      snapshots.flatMap((s) =>
        Object.values(s.machineData).map((data) =>
          toMachineView(data, data.redeemer ? s.queueHealth[data.redeemer.toLowerCase()] : undefined, now),
        ),
      ),
    [snapshots, now],
  );
}
