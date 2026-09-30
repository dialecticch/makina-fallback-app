import { Link, type LinkProps } from "react-router";

import type { Topic } from "@/config/topics";
import { cn } from "@/lib/utils";

/** A short link to the matching topic of the "How it works" page, so inline texts can stay to one line. */
export function LearnMore({ topic, className, ...props }: { topic: Topic } & Omit<LinkProps, "to">) {
  return (
    <Link
      to={`/about?topic=${topic}`}
      className={cn("text-brand whitespace-nowrap underline-offset-4 hover:underline", className)}
      {...props}
    >
      Learn more
    </Link>
  );
}
