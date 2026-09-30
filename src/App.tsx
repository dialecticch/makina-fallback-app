import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";

import { TooltipProvider } from "@/components/ui/tooltip";
import { persistOptions, queryClient } from "@/lib/query-client";
import { createAppConfig } from "@/lib/wagmi-config";

export default function App({ children }: { children: ReactNode }) {
  // Built inside the root error boundary, from the user's settings (which apply on reload).
  const [wagmiConfig] = useState(() => createAppConfig());
  return (
    <WagmiProvider config={wagmiConfig}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <TooltipProvider>{children}</TooltipProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}
