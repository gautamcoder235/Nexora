import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Block reload/refresh shortcuts (F5, Ctrl+F5, Ctrl+R, Cmd+R, etc.)
window.addEventListener("keydown", (e) => {
  if (
    e.key === "F5" ||
    ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))
  ) {
    e.preventDefault();
  }
});

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Nexora AppErrorBoundary] Caught render error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#060609',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '32px', fontFamily: 'monospace', color: '#f4f4f5',
          gap: '16px', zIndex: 9999
        }}>
          <div style={{ color: '#ef4444', fontSize: '18px', fontWeight: 700 }}>
            ⚠ Nexora Render Error
          </div>
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px', padding: '16px', maxWidth: '720px', width: '100%',
            fontSize: '12px', color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
          }}>
            {this.state.error?.toString()}
          </div>
          {this.state.errorInfo && (
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', padding: '16px', maxWidth: '720px', width: '100%',
              fontSize: '11px', color: '#71717a', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: '200px', overflowY: 'auto'
            }}>
              {this.state.errorInfo.componentStack}
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              padding: '8px 20px', background: 'rgba(245,158,11,0.15)',
              border: '1px solid rgba(245,158,11,0.35)', borderRadius: '6px',
              color: '#f59e0b', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Try to Recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
