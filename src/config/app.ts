/**
 * What a self-hoster or a fork is most likely to change, in one place: name, links, defaults, which local hosts
 * may serve RPCs over plain http. Chains, RPCs and built-in hubs live in chains.ts.
 *
 * Kept free of `@/` imports and `import.meta`: vite.config.ts and Node scripts import it too.
 */

export const APP = {
  name: "Makina Fallback",
  /** Open question for Makina: the official repository. Shown in the footer and the welcome dialog when set. */
  repoUrl: undefined as string | undefined,
  /** Open question for Makina: where to report vulnerabilities (also in SECURITY.md). */
  securityContact: undefined as string | undefined,
  /** Open question for Makina: terms of use. The footer hides the link while this is undefined. */
  termsUrl: undefined as string | undefined,
  makinaApp: "https://makina.finance",
  makinaDocs: "https://docs.makina.finance",
};

/** Slippage applied to `minShares` and `minAssets`, in basis points, and the presets Settings offers. */
export const SLIPPAGE_BPS = { default: 50, min: 10, max: 500, presets: [10, 50, 100] } as const;

/**
 * Hosts that may serve RPCs over plain `http:` (a local node). Everything else must be `https:`. The production
 * build's Content-Security-Policy is generated from this list (vite.config.ts), so the two cannot drift.
 */
export const LOCAL_RPC_HOSTS = ["localhost", "127.0.0.1"] as const;

/** Deep link to a strategy in the main Makina app, built from the share token symbol. */
export function makinaAppStrategyUrl(symbol: string) {
  return `${APP.makinaApp}/strategy/${encodeURIComponent(symbol)}`;
}
