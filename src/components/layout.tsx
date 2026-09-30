import { Outlet, useLocation } from "react-router";

import { ChainFilterProvider } from "@/components/chain-filter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { ViewerProvider, ViewOnlyBanner } from "@/components/viewer";
import { WalletChainBanner } from "@/components/wallet-chain-banner";
import { WelcomeModal } from "@/components/welcome-modal";
import { HubScanners } from "@/data/hub-scanners";
import { UserScanners } from "@/data/user-scanners";

export function Layout() {
  const location = useLocation();

  return (
    <ChainFilterProvider>
      <ViewerProvider>
        <div className="flex min-h-screen flex-col">
          <Header />
          <ViewOnlyBanner />
          <WalletChainBanner />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
            {/* Always mounted: data keeps loading whichever page is open. They render only on failure. */}
            <HubScanners />
            <UserScanners />
            {/* Keyed by path so navigating away from a crashed page resets it. */}
            <ErrorBoundary key={location.pathname} label="This page">
              <Outlet />
            </ErrorBoundary>
          </main>
          <Footer />
          <WelcomeModal />
        </div>
      </ViewerProvider>
    </ChainFilterProvider>
  );
}
