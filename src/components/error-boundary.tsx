import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorFallback } from "@/components/error-fallback";

type Props = {
  children: ReactNode;
  /** Short description of what failed, e.g. "This Machine" or "Portfolio". */
  label?: string;
  /** Extra action for the fallback, e.g. "Clear cache and reload" at the app root. */
  action?: { label: string; onClick: () => void };
  /** Wraps the fallback where a bare <div> is invalid, e.g. inside a <tbody>. */
  wrap?: (fallback: ReactNode) => ReactNode;
};

type State = { error: Error | undefined };

/** Keeps a thrown render error inside its own card, section or page: one failure never blanks the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: undefined };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? "ErrorBoundary"}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: undefined });

  render() {
    const { error } = this.state;
    if (error === undefined) return this.props.children;
    const fallback = (
      <ErrorFallback error={error} label={this.props.label} onRetry={this.reset} action={this.props.action} />
    );
    return this.props.wrap ? this.props.wrap(fallback) : fallback;
  }
}
