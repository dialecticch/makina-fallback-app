import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP } from "@/config/app";
import { useLocalStorage } from "@/hooks/use-local-storage";

export function WelcomeModal() {
  const [hasSeenWelcome, setHasSeenWelcome] = useLocalStorage<boolean>("makina-fallback:welcome-seen", false);

  return (
    <Dialog open={!hasSeenWelcome} onOpenChange={(open) => !open && setHasSeenWelcome(true)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Makina fallback app</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-3">
              <p>
                A minimal Makina frontend that reads everything from the chain, so it works even when Makina is down.
              </p>
              <p>Redemptions go through a queue: a request must be finalized before you can claim it.</p>
              <p>
                Anyone can host a copy: check the commit in the footer against a release you trust. For the full
                experience, use the{" "}
                <a className="text-brand underline" href={APP.makinaApp} target="_blank" rel="noreferrer">
                  main Makina app
                </a>
                .
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" asChild>
              <Link to="/about">How it works</Link>
            </Button>
          </DialogClose>
          <Button onClick={() => setHasSeenWelcome(true)}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
