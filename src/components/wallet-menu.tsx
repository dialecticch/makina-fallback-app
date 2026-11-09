import { LoaderCircle, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useChains, useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";

import { ChainIcon } from "@/components/chain-icon";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { abbreviateAddress } from "@/lib/format";

function ConnectWalletButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingConnectorId, setPendingConnectorId] = useState<string | null>(null);

  const connectors = useConnectors();
  const { mutate: connect } = useConnect({
    mutation: {
      onSuccess: () => setIsDialogOpen(false),
      onSettled: () => setPendingConnectorId(null),
    },
  });

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        {/* Icon only on phones: the header row has to fit in 320 px. */}
        <Button aria-label="Connect wallet" title="Connect wallet">
          <Wallet aria-hidden />
          <span className="hidden sm:inline">Connect wallet</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect wallet</DialogTitle>
          <DialogDescription>Wallets found in this browser:</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {connectors.length === 0 && (
            <p className="text-muted-foreground text-sm">No browser wallet found. Install or unlock one and reload.</p>
          )}
          {connectors.map((connector) => (
            <Button
              key={connector.uid}
              variant="outline"
              className="justify-start"
              onClick={() => {
                setPendingConnectorId(connector.uid);
                connect({ connector });
              }}
            >
              {connector.icon ? <img width={20} height={20} src={connector.icon} alt="" /> : <Wallet aria-hidden />}
              {connector.name}
              {connector.uid === pendingConnectorId && <LoaderCircle className="ml-auto animate-spin" aria-hidden />}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <p className="text-muted-foreground text-xs italic">
            This tool is provided “as is”, at your own risk, and without warranties of any kind. No developer or entity
            involved in creating the tool will be liable for any claims or damages whatsoever associated with your use,
            inability to use, or your interaction with other users of, the tool, including any direct, indirect,
            incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies,
            tokens, or anything else of value.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WalletMenu() {
  const { address, chainId, status } = useConnection();
  const chains = useChains();
  const { mutate: disconnect } = useDisconnect();

  if (status !== "connected" || !address) return <ConnectWalletButton />;

  const walletChain = chains.find((c) => c.id === chainId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={`Connected as ${address}`}>
          <Wallet aria-hidden />
          <span className="hidden font-mono sm:inline">{abbreviateAddress(address)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-auto flex-col gap-3">
        <div className="flex items-center gap-2 font-mono text-sm">
          {abbreviateAddress(address, 10, 8)}
          <CopyButton value={address} label="Copy address" />
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          Wallet network:
          <ChainIcon id={chainId} name={walletChain?.name} />
          {walletChain?.name ?? `Unsupported (chain ${chainId})`}
        </div>
        <Button variant="outline" size="sm" onClick={() => disconnect()}>
          <LogOut aria-hidden />
          Disconnect
        </Button>
      </PopoverContent>
    </Popover>
  );
}
