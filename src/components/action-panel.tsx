import { useSearchParams } from "react-router";

import { DepositForm } from "@/actions/deposit";
import { RequestRedeemForm } from "@/actions/request-redeem";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MachineView } from "@/data/machine-view";
import { useIsMobile } from "@/hooks/use-mobile";

type Tab = "deposit" | "redeem";

function PanelTabs({ view, tab, setTab }: { view: MachineView; tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <TabsList className="w-full">
        <TabsTrigger value="deposit">Deposit</TabsTrigger>
        <TabsTrigger value="redeem">Redeem</TabsTrigger>
      </TabsList>
      <TabsContent value="deposit">
        <ErrorBoundary label="Deposit">
          <DepositForm view={view} />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="redeem">
        <ErrorBoundary label="Redeem">
          <RequestRedeemForm view={view} />
        </ErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}

/** Deposit and Redeem: a right column on desktop, a bottom sheet on mobile. `?action=` selects the tab. */
export function ActionPanel({ view }: { view: MachineView }) {
  const isMobile = useIsMobile(1024);
  const [params, setParams] = useSearchParams();
  const action = params.get("action");
  const tab: Tab = action === "redeem" ? "redeem" : "deposit";
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        p.set("action", t);
        return p;
      },
      { replace: true },
    );

  if (!isMobile) {
    return (
      <Card className="p-4">
        <PanelTabs view={view} tab={tab} setTab={setTab} />
      </Card>
    );
  }

  const open = action === "deposit" || action === "redeem";
  return (
    <>
      <div className="bg-card fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t p-3">
        <Button className="flex-1" onClick={() => setTab("deposit")}>
          Deposit
        </Button>
        <Button className="flex-1" variant="outline" onClick={() => setTab("redeem")}>
          Redeem
        </Button>
      </div>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o)
            setParams(
              (p) => {
                p.delete("action");
                return p;
              },
              { replace: true },
            );
        }}
      >
        <SheetContent side="bottom" className="p-4 pt-10">
          <SheetHeader className="sr-only">
            <SheetTitle>{tab === "deposit" ? "Deposit" : "Redeem"}</SheetTitle>
            <SheetDescription>{view.symbol}</SheetDescription>
          </SheetHeader>
          <PanelTabs view={view} tab={tab} setTab={setTab} />
        </SheetContent>
      </Sheet>
    </>
  );
}
