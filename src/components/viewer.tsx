import { Eye, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Address } from "viem";
import { useConnection } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abbreviateAddress } from "@/lib/format";
import { parseViewAddress } from "@/lib/view-address";

type Viewer = {
  /** Whose data the app shows: the view-only address if set, else the connected account. */
  address: Address | undefined;
  /** True while viewing someone else's address: same data path as a connected wallet, every write disabled. */
  readOnly: boolean;
  viewAddress: Address | undefined;
  exitViewOnly: () => void;
};

const ViewerContext = createContext<Viewer>({
  address: undefined,
  readOnly: false,
  viewAddress: undefined,
  exitViewOnly: () => {},
});

/**
 * View-only mode reuses the connected-wallet data path with a different address. The address comes from
 * `#/portfolio?address=0x…` (so it can be shared) and stays active while navigating until the user exits.
 */
export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const { address: connected } = useConnection();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [viewAddress, setViewAddress] = useState<Address | undefined>(() =>
    parseViewAddress(searchParams.get("address")),
  );

  const fromUrl = parseViewAddress(searchParams.get("address"));
  useEffect(() => {
    if (fromUrl && fromUrl !== viewAddress) setViewAddress(fromUrl);
  }, [fromUrl, viewAddress]);

  const value = useMemo<Viewer>(() => {
    const readOnly = viewAddress !== undefined && viewAddress.toLowerCase() !== connected?.toLowerCase();
    return {
      address: viewAddress ?? connected,
      readOnly,
      viewAddress,
      exitViewOnly: () => {
        setViewAddress(undefined);
        void navigate("/portfolio");
      },
    };
  }, [viewAddress, connected, navigate]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useViewer() {
  return useContext(ViewerContext);
}

/** Header field: paste any address to view its portfolio read-only. */
export function ViewAddressField() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const address = parseViewAddress(value);
        if (!address) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        setValue("");
        void navigate(`/portfolio?address=${address}`);
      }}
    >
      <label htmlFor="view-address" className="sr-only">
        View an address (read-only)
      </label>
      <Eye className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
      <Input
        id="view-address"
        className="w-44 pl-8 font-mono text-xs lg:w-56"
        placeholder="View address 0x…"
        value={value}
        aria-invalid={invalid}
        aria-describedby={invalid ? "view-address-error" : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
      />
      {invalid && (
        <p id="view-address-error" role="alert" className="text-destructive absolute mt-1 text-xs">
          Not a valid address
        </p>
      )}
    </form>
  );
}

/** Persistent banner while viewing someone else's address. */
export function ViewOnlyBanner() {
  const { readOnly, viewAddress, exitViewOnly } = useViewer();
  if (!readOnly || !viewAddress) return null;
  return (
    <div role="status" className="bg-warning/15 text-foreground border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <Eye className="text-warning size-4 shrink-0" aria-hidden />
        <span>
          Viewing <span className="font-mono">{abbreviateAddress(viewAddress)}</span> (read-only). Actions are disabled.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7"
          onClick={exitViewOnly}
          aria-label="Exit view-only mode"
        >
          <X aria-hidden />
          Exit
        </Button>
      </div>
    </div>
  );
}
