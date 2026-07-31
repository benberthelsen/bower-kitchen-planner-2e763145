import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStaleDeploymentError, loadLatestDeployment } from '@/lib/deploymentRecovery';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic Error Boundary component that catches React errors
 * and displays a fallback UI instead of crashing the entire app
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
    // React.lazy can surface the rejected import directly without a usable
    // preload event. Cover that path and recover automatically once.
    if (isStaleDeploymentError(error)) loadLatestDeployment();
  }

  handleRetry = () => {
    if (isStaleDeploymentError(this.state.error)) {
      loadLatestDeployment(true);
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const staleDeployment = isStaleDeploymentError(this.state.error);

      return (
        <div className="flex flex-col items-center justify-center p-8 bg-muted/50 rounded-lg border border-border">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            {staleDeployment
              ? 'The planner was updated while this tab was open. Load the latest version to continue.'
              : this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button onClick={this.handleRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {staleDeployment ? 'Load latest version' : 'Try Again'}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
