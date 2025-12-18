import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown) {
    // Keep console signal for debugging
    // eslint-disable-next-line no-console
    console.error('App crashed:', err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-xl w-full bg-white border border-gray-200 rounded-xl p-6">
            <h1 className="text-xl font-bold text-gray-900">Se produjo un error</h1>
            <p className="text-sm text-gray-600 mt-2">
              La aplicación se ha detenido por un error inesperado. Recarga la página.
            </p>
            {this.state.message ? (
              <pre className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto">
                {this.state.message}
              </pre>
            ) : null}
            <div className="mt-4">
              <button className="btn-primary" onClick={() => window.location.reload()}>
                Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
