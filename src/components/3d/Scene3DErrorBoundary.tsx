import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Always show full details (including stack) in the UI to simplify support.
const IS_DEV = import.meta.env.DEV;

interface Props {
  children: ReactNode;
  onSwitch2D?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  componentStack?: string;
}

/**
 * Specialized error boundary for Three.js/React Three Fiber scenes
 * Provides 3D-specific recovery options like switching to 2D view
 */
class Scene3DErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false, componentStack: undefined };
  }

  static getDerivedStateFromError(error: Error): State {
    // Default to showing details so users can copy/paste the error.
    return { hasError: true, error, showDetails: true, componentStack: undefined };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Persist stack in UI so users can copy/paste it even in production builds.
    this.setState({ componentStack: errorInfo.componentStack });
    console.error('3D Scene Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false, componentStack: undefined });
  };

  handleSwitch2D = () => {
    this.setState({ hasError: false, error: null, showDetails: false, componentStack: undefined });
    this.props.onSwitch2D?.();
  };

  toggleDetails = () => {
    this.setState(prev => ({ ...prev, showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error;

      const stackText = err?.stack ? `\n\n${err.stack}` : '';
      const componentStackText = this.state.componentStack
        ? `\n\nComponent stack:\n${this.state.componentStack}`
        : '';

      const detailsText = err ? `${err.name}: ${err.message}${stackText}${componentStackText}` : '';

      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80 backdrop-blur-sm">
          <div className="bg-card p-8 rounded-lg shadow-lg border border-border max-w-md text-center">
            <AlertTriangle className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              3D Rendering Error
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              The 3D scene encountered an error. This could be due to WebGL
              compatibility or a rendering issue.
            </p>

            {err && (
              <div className="mb-4 text-left">
                <Button
                  onClick={this.toggleDetails}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {this.state.showDetails ? 'Hide error details' : 'Show error details'}
                </Button>
                {this.state.showDetails && (
                  <pre className="mt-2 bg-muted text-foreground text-xs p-3 rounded font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                    {detailsText}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="default" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry 3D
              </Button>
              {this.props.onSwitch2D && (
                <Button onClick={this.handleSwitch2D} variant="outline" size="sm">
                  <Monitor className="h-4 w-4 mr-2" />
                  Switch to 2D
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default Scene3DErrorBoundary;
