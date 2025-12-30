import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  onSwitch2D?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Specialized error boundary for Three.js/React Three Fiber scenes
 * Provides 3D-specific recovery options like switching to 2D view
 */
class Scene3DErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('3D Scene Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleSwitch2D = () => {
    this.setState({ hasError: false, error: null });
    this.props.onSwitch2D?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80 backdrop-blur-sm">
          <div className="bg-card p-8 rounded-lg shadow-lg border border-border max-w-md text-center">
            <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              3D Rendering Error
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              The 3D scene encountered an error. This could be due to WebGL
              compatibility or a rendering issue.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-destructive/10 text-destructive text-xs p-3 rounded mb-4 text-left font-mono overflow-auto max-h-32">
                {this.state.error.message}
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
