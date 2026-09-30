import { describe, expect, it } from "vitest";

import { BUILTIN_INSTANCES } from "@/config/instances";
import { fetchUserBalances } from "@/data/fetch-user-data";
import { toMachineView } from "@/data/machine-view";
import { preCheckFor } from "@/lib/pre-checks";

import { ETHEREUM } from "./config";
import { forkClient, forkSkip, scanInstance } from "./helpers";

describe.skipIf(forkSkip)("View-only mode (fork)", () => {
  it("shows a holder's positions and disables every write", async () => {
    const client = forkClient(1);
    const { machineData } = await scanInstance(
      client,
      BUILTIN_INSTANCES.find((i) => i.chainId === 1)!,
    );

    // Same data path as a connected wallet, with a different address.
    const { byMachine } = await fetchUserBalances(client as never, {
      user: ETHEREUM.holder,
      machines: Object.values(machineData),
    });
    const held = Object.values(byMachine).filter((s) => (s.shares ?? 0n) > 0n);
    expect(held.map((s) => s.machine.toLowerCase())).toContain(ETHEREUM.machines.DMG.toLowerCase());
    for (const s of held) expect(s.value).toBeGreaterThan(0n);

    const dmg = toMachineView(machineData[ETHEREUM.machines.DMG.toLowerCase()]!, undefined, 0n);
    for (const action of ["deposit", "redeem", "claim", "wrap"] as const) {
      expect(
        preCheckFor(action, dmg, {
          readOnly: true,
          account: undefined,
          walletChainId: undefined,
          chainName: "Ethereum",
          user: byMachine[ETHEREUM.machines.DMG.toLowerCase()],
          nativeBalance: undefined,
          hubUnlocked: false,
        }),
      ).toMatchObject({ ok: false, code: "readOnly" });
    }
  });
});
