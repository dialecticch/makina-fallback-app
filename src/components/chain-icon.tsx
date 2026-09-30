import { cn } from "@/lib/utils";

/** Every `src/assets/chains/<chainId>.svg`, bundled: adding a chain's icon is adding its file. */
const ICONS: Record<number, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../assets/chains/*.svg", { eager: true, import: "default", query: "?url" }),
  ).map(([path, url]) => [Number(/(\d+)\.svg$/.exec(path)?.[1]), url]),
);

/** Bundled icon for configured chains; a lettered disc for anything else (e.g. user-added chains). */
export function ChainIcon({ id, name, className }: { id: number | undefined; name?: string; className?: string }) {
  const src = id !== undefined ? ICONS[id] : undefined;
  if (src) return <img src={src} alt="" className={cn("size-4 shrink-0 rounded-sm", className)} />;

  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
        className,
      )}
    >
      {(name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
