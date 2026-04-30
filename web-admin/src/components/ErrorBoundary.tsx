import { Component, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-slate-400">
          <AlertCircle size={40} className="text-status-red" />
          <h2 className="text-white font-semibold text-lg">Algo salió mal</h2>
          <p className="text-sm max-w-sm text-center">{this.state.error?.message}</p>
          <button
            className="px-4 py-2 bg-brand-primary rounded-md text-white text-sm hover:bg-brand-primary/90"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Intentar de nuevo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
