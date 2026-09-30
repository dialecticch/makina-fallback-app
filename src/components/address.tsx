import { ExternalLink } from "lucide-react";
import { type Address as AddressType, zeroAddress } from "viem";
import { useChains } from "wagmi";

import { CopyButton } from "@/components/copy-button";
import { explorerUrl } from "@/config/chains";
import { abbreviateAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Truncated address with copy and an explorer link. The full address is in the title for hover and screen readers. */
export function Address({
  address,
  chainId,
  full = false,
  className,
}: {
  address: AddressType | undefined;
  chainId: number;
  full?: boolean;
  className?: string;
}) {
  const chains = useChains();
  if (address === undefined) return <span className="text-muted-foreground">–</span>;
  if (address === zeroAddress) return <span className="text-muted-foreground">None (zero address)</span>;

  const chain = chains.find((c) => c.id === chainId);
  const href = explorerUrl(chain, "address", address);

  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-xs", className)}>
      <span title={address} className={full ? "break-all" : undefined}>
        {full ? address : abbreviateAddress(address)}
      </span>
      <CopyButton value={address} label="Copy address" />
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${address} in ${chain?.blockExplorers?.default.name ?? "explorer"}`}
          className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </span>
  );
}
