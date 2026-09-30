import { cn } from "@/lib/utils";

const base = import.meta.env.BASE_URL;

/** The Makina mark, with the light or dark variant picked by the current theme. */
export function MakinaLogo({ className }: { className?: string }) {
  return (
    <>
      <img src={`${base}brand/logo-medium.svg`} alt="" className={cn("size-7 dark:hidden", className)} />
      <img src={`${base}brand/logo-medium-dark.svg`} alt="" className={cn("hidden size-7 dark:block", className)} />
    </>
  );
}
