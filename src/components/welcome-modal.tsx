import { Button } from "@/components/ui/button";
import {
  Dialog,
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
                A minimal Makina frontend that reads everything directly from the chain through public RPCs. It keeps
                working when the main Makina app, its API or its indexers are down.
              </p>
              <p>
                Redemptions go through a queue: the Machine&apos;s mechanic must finalize a request before you can claim
                it, and this app cannot speed that up.
              </p>
              <p>
                Anyone can host a copy of this app. Check that you run it from the official source
                {APP.repoUrl ? (
                  <>
                    {" "}
                    (
                    <a className="text-brand underline" href={APP.repoUrl} target="_blank" rel="noreferrer">
                      {APP.repoUrl.replace(/^https:\/\//, "")}
                    </a>
                    )
                  </>
                ) : null}
                , and compare the commit in the footer with a release you trust.
              </p>
              <p>
                For the full experience, use the{" "}
                <a className="text-brand underline" href={APP.makinaApp} target="_blank" rel="noreferrer">
                  main Makina app
                </a>
                .
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setHasSeenWelcome(true)}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
