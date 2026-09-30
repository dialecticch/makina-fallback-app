import { formatUnits, parseUnits } from "viem";

import { formatTokenAmount } from "@/lib/format";

function validateTokenAmountInput(input: string, maxDecimals: number): string | null {
  if (input === "") return "";
  if (input === ".") return "0.";

  const re = new RegExp(`^[0-9]+[.]?[0-9]*$`);
  if (!re.test(input)) return null;

  const decimalIndex = input.indexOf(".");
  return decimalIndex > -1 ? input.slice(0, decimalIndex + maxDecimals + 1) : input;
}

/** Parses the input text into base units; undefined for empty or unparseable input. */
// eslint-disable-next-line react-refresh/only-export-components
export function parseTokenInput(text: string, decimals: number | undefined): bigint | undefined {
  if (decimals === undefined || text === "" || text === "0." || text === ".") return undefined;
  try {
    return parseUnits(text, decimals);
  } catch {
    return undefined;
  }
}

/** Amount field in token units, with the balance and a Max shortcut. */
export function TokenAmountInput({
  id,
  label,
  decimals,
  symbol,
  value,
  onChange,
  balance,
  maxValue,
  disabled,
}: {
  id: string;
  label: string;
  decimals: number | undefined;
  symbol: string | undefined;
  value: string;
  onChange: (value: string) => void;
  /** Shown as "Balance: …". */
  balance?: bigint;
  /** What Max fills in; defaults to `balance`. */
  maxValue?: bigint;
  disabled?: boolean;
}) {
  const max = maxValue ?? balance;
  return (
    <div className="bg-muted/60 focus-within:border-ring flex flex-col gap-2 rounded-lg border p-3">
      <label htmlFor={id} className="text-muted-foreground flex items-center justify-between text-xs">
        {label}
        {symbol && <span>{symbol}</span>}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className="w-full bg-transparent font-mono text-2xl font-semibold tabular-nums outline-none disabled:opacity-50"
        placeholder="0"
        value={value}
        disabled={disabled || decimals === undefined}
        onChange={(e) => {
          const next = validateTokenAmountInput(e.target.value, decimals ?? 18);
          if (next !== null) onChange(next);
        }}
      />
      {balance !== undefined && decimals !== undefined && (
        <div className="text-muted-foreground flex items-center justify-end gap-2 text-xs tabular-nums">
          Balance: {formatTokenAmount(balance, decimals, { compact: false })}
          {max !== undefined && max > 0n && (
            <button
              type="button"
              className="text-brand cursor-pointer font-medium hover:underline"
              onClick={() => onChange(formatUnits(max, decimals))}
            >
              Max
            </button>
          )}
        </div>
      )}
    </div>
  );
}
