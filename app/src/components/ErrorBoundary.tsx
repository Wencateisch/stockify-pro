import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icons";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console; the screen stays calm.
    console.error("Stockify Pro crashed a screen:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="glass card">
          <div className="empty">
            <div
              style={{
                width: 46,
                height: 46,
                margin: "0 auto 10px",
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: "rgba(244,82,106,0.12)",
                border: "1px solid rgba(244,82,106,0.24)",
                color: "var(--red)",
              }}
            >
              <Icon name="alert" size={22} />
            </div>
            <strong>That screen hit an error</strong>
            <p style={{ marginTop: 6 }}>{this.state.error.message}</p>
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 14 }}>
              <button type="button" className="btn ghost" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
              <button type="button" className="btn primary" onClick={() => window.location.reload()}>
                Reload the app
              </button>
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              The paper book is stored locally and survives a reload.
            </p>
          </div>
        </div>
      </div>
    );
  }
}
