import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/lib/logger";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("ErrorBoundary caught an error", error, { componentStack: errorInfo.componentStack });
    this.setState({ error, errorInfo });
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="p-4 space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Oops, something broke</AlertTitle>
            <AlertDescription>
              We hit an unexpected snag. Try again — if it keeps happening, reach out to support.
              {this.state.error && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">Error Details</summary>
                  <pre className="whitespace-pre-wrap break-all mt-1 p-2 bg-muted rounded text-xs">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack && (
                      <>
                        {"\n\nComponent Stack:"}
                        {this.state.errorInfo.componentStack}
                      </>
                    )}
                  </pre>
                </details>
              )}
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button onClick={this.handleRetry} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              size="sm"
            >
              Reload Page
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href="https://github.com/Raip036/weightcut-wizard/issues" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Contact Support
              </a>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;