import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { Card } from "@/components/ui/card";
import { APP } from "@/config/app";
import type { Topic } from "@/config/topics";

function Section({ id, title, children }: { id: Topic; title: string; children: React.ReactNode }) {
  return (
    <Card id={`topic-${id}`} className="scroll-mt-24 flex flex-col gap-2 p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-muted-foreground flex flex-col gap-2 text-sm [&_strong]:text-foreground">{children}</div>
    </Card>
  );
}

/** The explanations the rest of the UI keeps to one line, with a "Learn more" link to the matching topic. */
export function AboutPage() {
  const [params] = useSearchParams();
  const topic = params.get("topic");

  useEffect(() => {
    if (topic) document.getElementById(`topic-${topic}`)?.scrollIntoView({ block: "start" });
  }, [topic]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
        <p className="text-muted-foreground text-sm">
          A minimal Makina frontend that reads everything from the chain, so it keeps working when the main Makina app,
          its API or its indexers are down.
        </p>
      </div>

      <Section id="data" title="Where the data comes from">
        <p>
          Every number is read from the chain through JSON-RPC: your own RPCs first (Settings), then public RPCs, then
          your wallet&apos;s, only while it is on that network. The app contacts nothing else and has no backend.
        </p>
        <p>
          Machines, prices and positions load in seconds. Only the activity history scans event logs, which takes a
          minute or two per network on free public RPCs the first time, then only new blocks.
        </p>
        <p>
          The RPC providers you use see your IP address and the addresses you look up, as with any wallet or frontend.
        </p>
      </Section>

      <Section id="rpcs" title="Your own RPCs">
        <p>
          Public RPCs are free and shared, so they rate-limit. An RPC from any provider (a free account is enough),
          added under Settings, RPC endpoints, is tried first and makes everything faster.
        </p>
        <p>
          <strong>Only add RPCs you trust.</strong> An RPC can report wrong data. Before any transaction, the app checks
          the contracts involved through your wallet&apos;s own RPC as well, so a lying RPC cannot redirect your funds;
          but the numbers you see still come from your RPCs. Each RPC must answer with the right chain ID to be saved.
        </p>
        <p>
          RPC URLs are stored in this browser. If one contains an API key, anyone with access to this browser sees it.
        </p>
      </Section>

      <Section id="hubs" title="Hubs, and unlocking them">
        <p>
          A hub is the chain where Makina&apos;s core registry and Machines live. The app loads the hubs listed in
          Settings, Hub networks. <strong>Hubs built into this release are verified</strong>: their addresses are pinned
          and checked for every release.
        </p>
        <p>
          The app also finds hubs on other networks by itself, and you can add a custom hub by its registry address. The
          app only checks that such an address works like a hub registry; it cannot confirm that the registry belongs to
          Makina, and a lookalike registry is an easy trap during an outage. So you can view those hubs&apos; Machines,
          but you can&apos;t use them until you <strong>unlock</strong> the hub.
        </p>
        <p>
          To unlock a hub, open any of its Machines and confirm its registry address against an official Makina source.
          Unlocking enables deposits and redemptions for that hub. Claims always work: they can only pay the owner of
          the redemption NFT. Settings, Hub networks locks a hub again.
        </p>
      </Section>

      <Section id="slippage" title="Slippage and redemptions">
        <p>
          <strong>Deposits</strong> revert if they would mint fewer shares than the estimate minus your slippage
          (Settings, Slippage). Deposits are priced from the Machine&apos;s last accounting update.
        </p>
        <p>
          <strong>Redemptions</strong> go through a queue. Requesting one gives you an NFT and reverts if the request is
          worth less than the estimate minus your slippage. The Machine&apos;s mechanic then finalizes it, at the
          earliest after the finalization delay; this app cannot speed that up. At finalization you receive the lower of
          the value at request time and the value then: there is no minimum at that point. Once finalized, claim it from
          Portfolio.
        </p>
      </Section>

      <Section id="safety" title="Before you sign">
        <ul className="list-disc pl-5">
          <li>
            Every address a transaction uses is re-read through your wallet&apos;s own RPC and must match what the app
            shows; otherwise nothing is sent.
          </li>
          <li>Approvals are for exactly the amount of the action, to the address shown before your wallet opens.</li>
          <li>The receiver of every deposit, redemption and claim is the connected account.</li>
          <li>Each transaction is simulated first; a revert is explained next to the button.</li>
          <li>Viewing another address is read-only: nothing can be signed.</li>
        </ul>
      </Section>

      <Section id="statuses" title="Statuses">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-foreground">Accounting stale</dt>
          <dd>
            The share price has not been updated within the Machine&apos;s threshold. Deposits still work, priced from
            that update.
          </dd>
          <dt className="text-foreground">Queue stalled</dt>
          <dd>The oldest pending redemption is older than the finalization delay plus 72 hours.</dd>
          <dt className="text-foreground">Recovery mode</dt>
          <dd>
            Set by the Machine&apos;s security council: deposits and new redemptions are disabled; claims still work.
          </dd>
          <dt className="text-foreground">Deposits closed</dt>
          <dd>The Machine has no depositor.</dd>
          <dt className="text-foreground">Unsupported contracts</dt>
          <dd>The Machine uses periphery contracts this app does not know, so those actions are read-only here.</dd>
          <dt className="text-foreground">Unverified hub</dt>
          <dd>The Machine belongs to a hub not built into this release (see above).</dd>
        </dl>
      </Section>

      <Section id="storage" title="What this browser stores">
        <p>
          Settings, public chain data (for 7 days, so reloads are instant) and any activity history you loaded, in this
          browser&apos;s local storage for this site only. Settings, Cache clears the data; Settings, Backup copies
          settings to another browser.
        </p>
      </Section>

      <Section id="genuine" title="Running a genuine copy">
        <p>
          Anyone can host a copy of this app. Run it from the official source
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
      </Section>
    </div>
  );
}
