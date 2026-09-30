import { ErrorBoundary } from "@/components/error-boundary";
import { InstanceScanner } from "@/data/instance-scanner";
import { useInstances } from "@/data/use-instances";

/** Mounts one scanner per hub instance, each behind its own error boundary. */
export function HubScanners() {
  const instances = useInstances();
  return (
    <>
      {instances.map((instance) => (
        <ErrorBoundary key={instance.id} label={`Loading the ${instance.id} instance`}>
          <InstanceScanner instance={instance} />
        </ErrorBoundary>
      ))}
    </>
  );
}
