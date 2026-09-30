import { Link } from "react-router";

import { Amount } from "@/components/amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useViewer } from "@/components/viewer";
import type { MachineView } from "@/data/machine-view";
import { useUserSnapshots } from "@/data/user-store";

/** Shown on the Machine page when a wallet is connected or an address is being viewed. */
export function YourPosition({ view }: { view: MachineView }) {
  const { address, readOnly } = useViewer();
  const snapshots = useUserSnapshots();
  if (!address) return null;

  const snapshot = snapshots.find(
    (s) => s.instance.id === view.data.instanceId && s.user.toLowerCase() === address.toLowerCase(),
  );
  const state = snapshot?.byMachine[view.data.machine.toLowerCase()];
  const requests = (snapshot?.requests ?? []).filter(
    (r) => r.machine.toLowerCase() === view.data.machine.toLowerCase(),
  );
  const claimable = requests.filter((r) => r.claimable);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{readOnly ? "Viewed address" : "Your position"}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Shares</dt>
            <dd>
              <Amount value={state?.shares} decimals={view.shareDecimals} symbol={view.symbol} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Value</dt>
            <dd>
              <Amount
                value={state?.shares === 0n ? 0n : state?.value}
                decimals={view.accountingDecimals}
                symbol={view.accountingSymbol}
              />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Pending redemptions</dt>
            <dd className="tabular-nums">{snapshot?.requestsReady ? requests.length - claimable.length : "…"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Claimable</dt>
            <dd className="tabular-nums">{snapshot?.requestsReady ? claimable.length : "…"}</dd>
          </div>
        </dl>
        {requests.length > 0 && (
          <Link
            to={readOnly ? `/portfolio?address=${address}` : "/portfolio"}
            className="text-brand mt-3 inline-block text-sm underline-offset-4 hover:underline"
          >
            {claimable.length > 0 ? "Claim in Portfolio" : "See requests in Portfolio"}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
