import { type Address, formatUnits } from "viem";

/** `0x1234…abcd`, keeping `head` characters (including 0x) and `tail` characters. */
export function abbreviateAddress(address: Address, head = 6, tail = 4) {
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const plainFormatter = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });

/** Exact decimal string, respecting `decimals` (used for tooltips and inputs). */
export function formatTokenExact(amount: bigint, decimals: number) {
  return formatUnits(amount, decimals);
}

/**
 * Compact display (`1.23M`) for large amounts, up to 6 significant digits otherwise. Precision loss here is
 * display-only: callers show `formatTokenExact` in a tooltip.
 */
export function formatTokenAmount(amount: bigint, decimals: number, { compact = true }: { compact?: boolean } = {}) {
  const value = Number(formatUnits(amount, decimals));
  if (value === 0) return "0";
  if (Math.abs(value) < 0.000001) return "<0.000001";
  return compact && Math.abs(value) >= 10_000 ? compactFormatter.format(value) : plainFormatter.format(value);
}

/** A 1e18 = 100 % rate as a percentage with two decimals, rounded half up. */
export function formatWadPercent(rate: bigint) {
  const hundredths = (rate * 10_000n + 5n * 10n ** 17n) / 10n ** 18n;
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}%`;
}

export function formatRatioPercent(ratio: number) {
  return `${(ratio * 100).toFixed(2)}%`;
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** "3 hours ago" / "in 2 days", from Unix seconds. */
export function formatRelativeTime(unixSeconds: number, nowSeconds = Date.now() / 1000) {
  const delta = unixSeconds - nowSeconds;
  const abs = Math.abs(delta);
  for (const [unit, size] of UNITS) {
    if (abs >= size || unit === "second") return relativeFormatter.format(Math.round(delta / size), unit);
  }
  return relativeFormatter.format(0, "second");
}

/** Absolute UTC timestamp for tooltips, e.g. "2026-09-30 11:05 UTC". */
export function formatUtc(unixSeconds: number) {
  return `${new Date(unixSeconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Durations such as `finalizationDelay`: "3 days", "12 hours", "45 minutes". */
export function formatDuration(seconds: bigint | number) {
  const s = Number(seconds);
  if (s <= 0) return "none";
  for (const [unit, size] of UNITS.slice(3)) {
    if (s >= size) {
      const n = Math.round((s / size) * 10) / 10;
      return `${n} ${unit}${n === 1 ? "" : "s"}`;
    }
  }
  return `${s} seconds`;
}

/**
 * Text read from a contract (token names and symbols), made safe to display: control and bidirectional-override
 * characters removed (they can make "USDC" render as something else, or reorder an address next to it), and
 * trimmed to 64 characters.
 */
export function chainText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").trim();
  return clean.length > 64 ? `${clean.slice(0, 63)}…` : clean;
}
