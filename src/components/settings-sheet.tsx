import { Monitor, Moon, Settings, Sun } from "lucide-react";
import { useState } from "react";

import { AddInstancePanel, NetworksPanel, RpcPanel } from "@/components/settings-networks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SLIPPAGE_BPS } from "@/config/app";
import { DEFAULT_SETTINGS, sanitizeSettings, useUserSettings, writeUserSettings } from "@/config/user-settings";
import { clearCacheAndReload } from "@/lib/query-client";
import { applyTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

const pct = (bps: number) => `${bps / 100}%`;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t px-5 pt-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="text-muted-foreground text-xs">{description}</p>}
      {children}
    </section>
  );
}

function SlippageSection() {
  const { slippageBps } = useUserSettings();
  const [text, setText] = useState((slippageBps / 100).toString());
  const inRange = (bps: number) => Number.isFinite(bps) && bps >= SLIPPAGE_BPS.min && bps <= SLIPPAGE_BPS.max;
  const valid = inRange(Number(text) * 100);

  return (
    <Section
      title="Slippage"
      description={`Deposits revert if they would mint fewer shares, and redemption requests if they are worth less, than the estimate minus this. ${pct(SLIPPAGE_BPS.min)} to ${pct(SLIPPAGE_BPS.max)}.`}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="slippage" className="sr-only">
          Slippage in percent
        </label>
        <Input
          id="slippage"
          inputMode="decimal"
          className="w-24 tabular-nums"
          value={text}
          aria-invalid={!valid}
          onChange={(e) => {
            setText(e.target.value);
            const next = Math.round(Number(e.target.value) * 100);
            if (inRange(next)) writeUserSettings({ slippageBps: next });
          }}
        />
        <span className="text-sm">%</span>
        {SLIPPAGE_BPS.presets.map((bps) => (
          <Button
            key={bps}
            size="sm"
            variant="outline"
            className={cn(slippageBps === bps && "border-brand text-brand")}
            onClick={() => {
              setText((bps / 100).toString());
              writeUserSettings({ slippageBps: bps });
            }}
          >
            {pct(bps)}
          </Button>
        ))}
      </div>
      {!valid && (
        <p className="text-destructive text-xs">
          Enter a value between {SLIPPAGE_BPS.min / 100} and {SLIPPAGE_BPS.max / 100}.
        </p>
      )}
    </Section>
  );
}

/** Settings live per browser origin: export and import move them (for example between `pnpm dev` and `pnpm start`). */
function BackupSection() {
  const settings = useUserSettings();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string>();

  return (
    <Section
      title="Backup"
      description="Settings are stored in this browser, for this address only. Copy them to move them; they include any RPC URLs, which may contain API keys."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(JSON.stringify(settings)).then(
              () => setMessage("Settings copied to the clipboard."),
              () => setMessage("Could not copy: the browser refused clipboard access."),
            )
          }
        >
          Copy settings
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            writeUserSettings(DEFAULT_SETTINGS);
            applyTheme("system");
            setMessage("Settings reset. Reload to apply RPC changes.");
          }}
        >
          Reset settings
        </Button>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        Import settings
        <textarea
          className="border-input bg-card min-h-16 rounded-md border px-3 py-2 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste copied settings here"
        />
      </label>
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={!text.trim()}
        onClick={() => {
          try {
            const imported = sanitizeSettings(JSON.parse(text));
            writeUserSettings(imported);
            applyTheme(imported.theme);
            setText("");
            setMessage("Imported. Reload to apply RPC and network changes.");
          } catch {
            setMessage("That is not valid settings JSON.");
          }
        }}
      >
        Import
      </Button>
      {message && (
        <p role="status" className="text-muted-foreground text-xs">
          {message}
        </p>
      )}
    </Section>
  );
}

export function SettingsSheet() {
  const { theme } = useUserSettings();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent className="pb-6">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Stored in this browser only.</SheetDescription>
        </SheetHeader>

        <SlippageSection />

        <Section
          title="RPC endpoints"
          description="Your own RPCs are tried before the public ones: the best fix when public RPCs are slow or rate-limited. Only add RPCs you trust: an RPC can lie about chain state (the app double-checks transaction targets with your wallet)."
        >
          <RpcPanel />
        </Section>

        <Section
          title="Networks"
          description="Hubs the app loads. Only built-in hubs are verified; others are read-only until you unlock them."
        >
          <NetworksPanel />
        </Section>

        <Section
          title="Add an instance"
          description="A hub this release does not ship. The app only checks that the address behaves like a hub registry, not that it is Makina's: get the address from an official Makina source. Its Machines stay read-only until you unlock them."
        >
          <AddInstancePanel />
        </Section>

        <Section title="Theme">
          <div role="radiogroup" aria-label="Theme" className="flex gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                role="radio"
                aria-checked={theme === value}
                variant="outline"
                size="sm"
                className={cn(theme === value && "border-brand text-brand")}
                onClick={() => {
                  writeUserSettings({ theme: value });
                  applyTheme(value);
                }}
              >
                <Icon aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        </Section>

        <Section
          title="Cache"
          description="Public chain data is cached for 7 days so reloads are instant, and loaded activity history is kept to avoid rescanning. Clearing both refetches everything."
        >
          <Button variant="outline" size="sm" className="w-fit" onClick={clearCacheAndReload}>
            Clear cache and reload
          </Button>
        </Section>

        <BackupSection />
      </SheetContent>
    </Sheet>
  );
}
