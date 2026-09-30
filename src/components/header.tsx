import { ChartPie, Compass } from "lucide-react";
import { NavLink } from "react-router";

import { ChainFilterSelect } from "@/components/chain-filter";
import { MakinaLogo } from "@/components/makina-logo";
import { SettingsSheet } from "@/components/settings-sheet";
import { ViewAddressField } from "@/components/viewer";
import { WalletMenu } from "@/components/wallet-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Explore", end: true, icon: Compass },
  { to: "/portfolio", label: "Portfolio", end: false, icon: ChartPie },
];

export function Header() {
  return (
    <header className="bg-card sticky top-0 z-40 border-b">
      {/* Must fit in 320 px: below sm the nav and the wallet button show icons only (labels stay for screen readers). */}
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <NavLink to="/" className="flex shrink-0 items-center gap-2" aria-label="Makina Fallback, home">
          <MakinaLogo />
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">Makina</span>
          <span className="border-brand text-brand rounded-full border px-2 py-0.5 text-xs font-medium">Fallback</span>
        </NavLink>

        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map(({ to, label, end, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                  isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="size-4 sm:hidden" aria-hidden />
              <span className="sr-only sm:not-sr-only">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 lg:flex">
            <ViewAddressField />
            <ChainFilterSelect />
          </div>
          <SettingsSheet />
          <WalletMenu />
        </div>
      </div>
      {/* Below lg the filter and view field move to a second row instead of disappearing. */}
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pb-3 sm:px-6 lg:hidden">
        <div className="min-w-0 flex-1 [&_input]:w-full [&_form]:w-full">
          <ViewAddressField />
        </div>
        <ChainFilterSelect />
      </div>
    </header>
  );
}
