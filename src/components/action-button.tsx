import { ExternalLink, Loader } from "lucide-react";
import { useChains, useSwitchChain } from "wagmi";

import type { FlowState } from "@/actions/use-transaction-flow";
import { Button } from "@/components/ui/button";
import { explorerUrl } from "@/config/chains";
import type { PreCheckResult } from "@/lib/pre-checks";

const STEP_STATUS = {
  simulating: { full: "checking…", compact: "Checking…" },
  awaitingSignature: { full: "confirm in your wallet", compact: "Sign in wallet" },
  pending: { full: "pending…", compact: "Pending…" },
} as const;

/** "Approve USDC (1/2): confirm in your wallet", or just "Sign in wallet 1/2" on a small button (table cells). */
function busyLabel(state: FlowState, compact: boolean) {
  switch (state.status) {
    case "verifying":
      return compact ? "Verifying…" : "Verifying contracts…";
    case "simulating":
    case "awaitingSignature":
    case "pending": {
      const status = STEP_STATUS[state.status];
      if (compact) return state.progress ? `${status.compact} ${state.progress}` : status.compact;
      return `${state.label}${state.progress ? ` (${state.progress})` : ""}: ${status.full}`;
    }
    default:
      return undefined;
  }
}

/**
 * The single button every action uses. It shows the flow state, the first failing pre-check as a one-line reason,
 * and offers "Switch to …" when the wallet is on the wrong chain.
 */
export function ActionButton({
  chainId,
  check,
  blocker,
  note,
  state,
  onClick,
  children,
  size = "default",
}: {
  chainId: number;
  check: PreCheckResult;
  /** A form-level reason to stay disabled (empty amount, above balance, …), shown under the button. */
  blocker?: string;
  /** Informational line under the button that does not disable it. */
  note?: string;
  state: FlowState;
  onClick: () => void;
  children: React.ReactNode;
  size?: "default" | "sm";
}) {
  const chains = useChains();
  const chain = chains.find((c) => c.id === chainId);
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  // Small buttons sit in table cells: short labels, the full one as a tooltip.
  const compact = size === "sm";
  const busy = busyLabel(state, compact);
  const pendingHref = state.status === "pending" ? explorerUrl(chain, "tx", state.hash) : undefined;
  const confirmedHref = state.status === "confirmed" ? explorerUrl(chain, "tx", state.hash) : undefined;
  const switchLabel = `Switch to ${chain?.name ?? `chain ${chainId}`}`;

  // The label truncates and the lines below wrap: text spilling out of a table cell would make the table scroll.
  if (!check.ok && check.fix === "switchChain") {
    return (
      <div className="flex flex-col gap-1.5 break-words">
        <Button
          size={size}
          className="w-full"
          onClick={() => switchChain({ chainId })}
          disabled={switching}
          title={compact ? switchLabel : undefined}
        >
          {switching && <Loader className="animate-spin" aria-hidden />}
          <span className="min-w-0 truncate">
            {!compact ? switchLabel : switching ? "Switching…" : "Switch network"}
          </span>
        </Button>
        <p className="text-muted-foreground text-xs">{check.reason}</p>
      </div>
    );
  }

  const reason = !check.ok ? check.reason : blocker;
  return (
    <div className="flex flex-col gap-1.5 break-words">
      <Button
        size={size}
        className="w-full"
        onClick={onClick}
        disabled={!!reason || !!busy}
        title={compact && busy ? busyLabel(state, false) : undefined}
      >
        {busy && <Loader className="animate-spin" aria-hidden />}
        <span className="min-w-0 truncate">{busy ?? children}</span>
      </Button>
      {reason && !busy && <p className="text-muted-foreground text-xs">{reason}</p>}
      {note && !reason && !busy && <p className="text-muted-foreground text-xs">{note}</p>}
      {state.status === "pending" && state.slow && (
        <p role="status" className="text-warning text-xs">
          Still pending. If your wallet dropped it, reload before retrying.
        </p>
      )}
      {pendingHref && (
        <a
          href={pendingHref}
          target="_blank"
          rel="noreferrer"
          className="text-brand inline-flex items-center gap-1 text-xs"
        >
          View transaction <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
      {state.status === "confirmed" && (
        <p role="status" className="text-success inline-flex flex-wrap items-center gap-1 text-xs">
          {state.message ?? "Confirmed."}
          {confirmedHref && (
            <a
              href={confirmedHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              View transaction <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
      )}
      {state.status === "failed" && (
        <p role="alert" className="text-destructive text-xs">
          {state.message}
        </p>
      )}
    </div>
  );
}
