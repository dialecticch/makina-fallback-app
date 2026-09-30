import { twMerge } from "tailwind-merge";

/** Joins class names, later Tailwind classes overriding earlier ones (`twMerge` also drops falsy values). */
export function cn(...inputs: (string | false | null | undefined)[]) {
  return twMerge(...inputs);
}
