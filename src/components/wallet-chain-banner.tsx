import { TriangleAlert } from "lucide-react";
import { useChains, useConnection } from "wagmi";

/**
 * An unsupported wallet chain only shows a banner. Reads never depend on the wallet's
 * chain, and each action offers its own "Switch to …" button.
 */
export function WalletChainBanner() {
  const { status, chainId } = useConnection();
  const chains = useChains();
  if (status !== "connected" || chainId === undefined || chains.some((c) => c.id === chainId)) return null;
  return (
    <div role="status" className="bg-muted border-b">
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-sm sm:px-6">
        <TriangleAlert className="text-warning size-4 shrink-0" aria-hidden />
        Your wallet is on a network this app does not use (chain {chainId}). Everything still loads; actions will ask
        you to switch.
      </div>
    </div>
  );
}
