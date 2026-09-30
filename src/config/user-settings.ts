import { useSyncExternalStore } from "react";
import { type Address, getAddress, isAddress } from "viem";

import { SLIPPAGE_BPS } from "@/config/app";
import { parseRpcUrls } from "@/lib/rpc-urls";

/**
 * Runtime settings the user edits in the Settings sheet. They live in localStorage, so changing them never needs
 * a rebuild. Every read tolerates missing or corrupt storage: invalid values are dropped, never trusted.
 */
export const SETTINGS_STORAGE_KEY = "makina-fallback:settings";

/** A hub instance the user added in Settings, validated before saving. */
export type StoredUserInstance = {
  chainId: number;
  /** Display name, for chains the app does not ship. */
  name?: string;
  /** RPCs, only for chains the app does not ship (on shipped chains, custom RPCs go in "RPC endpoints"). */
  rpcUrls: string[];
  /** Block explorer root, for chains the app does not ship. */
  explorerUrl?: string;
  /** Native currency symbol, for chains the app does not ship. */
  nativeSymbol?: string;
  hubCoreRegistry: Address;
  /** Registry deployment block, found by binary search when the instance was added. */
  startBlock: string;
};

export type Theme = "system" | "light" | "dark";

export type UserSettings = {
  /** Extra RPC URLs per chain ID, tried before the public list. Applied on reload. */
  rpcUrls: Record<string, string[]>;
  /** Slippage for `minShares` and `minAssets`, in basis points. */
  slippageBps: number;
  /** Hub instances added by hand. Applied on reload. */
  instances: StoredUserInstance[];
  /** IDs of discovered or user-added hubs whose actions the user unlocked after checking the registry. */
  unlockedHubs: string[];
  /** IDs of hubs the user chose not to load. */
  hiddenHubs: string[];
  theme: Theme;
};

export const DEFAULT_SETTINGS: UserSettings = {
  rpcUrls: {},
  slippageBps: SLIPPAGE_BPS.default,
  instances: [],
  unlockedHubs: [],
  hiddenHubs: [],
  theme: "system",
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cleanUrls = (v: unknown) =>
  Array.isArray(v) ? parseRpcUrls(v.filter((u) => typeof u === "string").join("\n")).urls : [];
const cleanIds = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
const cleanText = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

function sanitizeInstance(value: unknown): StoredUserInstance | undefined {
  if (!isRecord(value)) return undefined;
  const { chainId, hubCoreRegistry, startBlock } = value;
  if (!Number.isSafeInteger(chainId) || (chainId as number) <= 0) return undefined;
  if (typeof hubCoreRegistry !== "string" || !isAddress(hubCoreRegistry, { strict: false })) return undefined;
  if (typeof startBlock !== "string" || !/^[1-9][0-9]*$/.test(startBlock)) return undefined;
  const explorer = cleanText(value.explorerUrl, 200);
  return {
    chainId: chainId as number,
    name: cleanText(value.name, 40),
    rpcUrls: cleanUrls(value.rpcUrls),
    explorerUrl: explorer && /^https:\/\//.test(explorer) ? explorer : undefined,
    nativeSymbol: cleanText(value.nativeSymbol, 10),
    hubCoreRegistry: getAddress(hubCoreRegistry),
    startBlock,
  };
}

export function sanitizeSettings(parsed: unknown): UserSettings {
  const p = isRecord(parsed) ? parsed : {};
  const rpcUrls: Record<string, string[]> = {};
  if (isRecord(p.rpcUrls)) {
    for (const [chainId, urls] of Object.entries(p.rpcUrls)) {
      const clean = cleanUrls(urls);
      if (/^[1-9][0-9]*$/.test(chainId) && clean.length > 0) rpcUrls[chainId] = clean;
    }
  }
  const slippage = Number(p.slippageBps);
  return {
    rpcUrls,
    slippageBps:
      Number.isFinite(slippage) && slippage >= SLIPPAGE_BPS.min && slippage <= SLIPPAGE_BPS.max
        ? Math.round(slippage)
        : SLIPPAGE_BPS.default,
    instances: Array.isArray(p.instances)
      ? p.instances.map(sanitizeInstance).filter((i): i is StoredUserInstance => i !== undefined)
      : [],
    unlockedHubs: cleanIds(p.unlockedHubs),
    hiddenHubs: cleanIds(p.hiddenHubs),
    theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system",
  };
}

let cached: UserSettings | undefined;
const listeners = new Set<() => void>();

export function readUserSettings(): UserSettings {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    cached = raw ? sanitizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

export function writeUserSettings(update: Partial<UserSettings>) {
  cached = sanitizeSettings({ ...readUserSettings(), ...update });
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Storage full or blocked: keep the in-memory value for this session.
  }
  for (const listener of listeners) listener();
}

export function useUserSettings(): UserSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readUserSettings,
    readUserSettings,
  );
}

/**
 * `VITE_RPC_URLS_<chainId>` from `.env.local`, read at build time. Listed one by one on purpose: reading
 * `import.meta.env` with a computed key makes Vite inline every `VITE_*` variable into the bundle.
 */
const ENV_RPC_URLS: Record<number, string | undefined> = {
  1: import.meta.env.VITE_RPC_URLS_1,
  8453: import.meta.env.VITE_RPC_URLS_8453,
  42161: import.meta.env.VITE_RPC_URLS_42161,
  10: import.meta.env.VITE_RPC_URLS_10,
  57073: import.meta.env.VITE_RPC_URLS_57073,
  143: import.meta.env.VITE_RPC_URLS_143,
};

export function envRpcUrls(chainId: number): string[] {
  return parseRpcUrls(ENV_RPC_URLS[chainId] ?? "").urls;
}
