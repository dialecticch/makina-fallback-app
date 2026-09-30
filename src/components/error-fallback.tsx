import { TriangleAlert } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";

export function ErrorFallback({
  error,
  label,
  onRetry,
  action,
}: {
  error: Error;
  label?: string;
  onRetry: () => void;
  action?: { label: string; onClick: () => void };
}) {
  const details = `${error.name}: ${error.message}\n\n${error.stack ?? ""}`;

  return (
    <div role="alert" className="bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <TriangleAlert className="text-destructive size-4" aria-hidden />
        {label ? `${label} failed to render.` : "Something failed to render."}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
        {action && (
          <Button size="sm" variant="outline" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer">Error details</summary>
        <div className="mt-2 flex items-start gap-2">
          <pre className="bg-muted max-h-48 flex-1 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
            {details}
          </pre>
          <CopyButton value={details} label="Copy error details" />
        </div>
      </details>
    </div>
  );
}
