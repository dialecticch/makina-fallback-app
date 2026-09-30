import { ErrorBoundary } from "@/components/error-boundary";
import { useViewer } from "@/components/viewer";
import { useInstances } from "@/data/use-instances";
import { UserScanner } from "@/data/user-scanner";

/** One user scanner per hub instance for the current viewer, each behind its own error boundary. */
export function UserScanners() {
  const { address } = useViewer();
  const instances = useInstances();
  if (!address) return null;
  return (
    <>
      {instances.map((instance) => (
        <ErrorBoundary key={`${instance.id}:${address}`} label={`Loading your ${instance.id} positions`}>
          <UserScanner instance={instance} user={address} />
        </ErrorBoundary>
      ))}
    </>
  );
}
